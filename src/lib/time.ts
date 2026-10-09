import { TZDate, tzOffset } from "@date-fns/tz";

// Todo lo que sale de aquí se calcula en la zona que se le pasa (`organizations.timezone`),
// nunca en la del dispositivo ni en la del servidor (regla 7). Los nombres de días y meses
// salen de listas fijas y no de `Intl`: así el texto no cambia con la versión de ICU del
// servidor ni con el idioma del navegador.

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
const WEEKDAYS_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** Entre campos: «Martes 6 oct · 18:00». Espacio, U+00B7, espacio. */
const FIELD_SEPARATOR = " · ";
/** Entre dos horas: «18:00–19:15». Raya corta, U+2013. */
const RANGE_SEPARATOR = "–";

/** Un instante ISO explícito acaba en `Z` o en un desfase `±hh:mm`. */
const ISO_OFFSET_END = /(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * El instante `iso` visto en `tz`. Si la fecha o la zona no existen avisa en vez de dejar
 * que `NaN` acabe pintado en pantalla.
 *
 * Sin `Z` ni desfase la cadena no es un instante sino un reloj de pared, y el constructor la
 * leería en la zona del dispositivo (regla 7): el mismo texto daría horas distintas según
 * dónde se ejecute. Se rechaza en vez de adivinar.
 */
function inZone(iso: string, tz: string): TZDate {
  const date = ISO_OFFSET_END.test(iso) ? new TZDate(iso, tz) : null;
  if (!date || Number.isNaN(date.getTime())) {
    throw new RangeError("Fecha o zona horaria no válidas");
  }
  return date;
}

/** El instante de un `TZDate` como ISO en UTC (`toISOString()` de un `TZDate` lleva el desfase). */
function toIso(date: TZDate): string {
  return new Date(date.getTime()).toISOString();
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}

function clock(date: TZDate): string {
  return `${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** «Martes 6 oct» */
function dateLabel(date: TZDate): string {
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** «Martes 6 oct» */
export function formatDate(iso: string, tz: string): string {
  return dateLabel(inZone(iso, tz));
}

/** «Martes 6 oct · 18:00–19:15» */
export function formatEventSlot(startIso: string, endIso: string, tz: string): string {
  const start = inZone(startIso, tz);
  const end = inZone(endIso, tz);
  return `${dateLabel(start)}${FIELD_SEPARATOR}${clock(start)}${RANGE_SEPARATOR}${clock(end)}`;
}

/** «Sábado 10 oct · 10:30 · Local» («Visitante»; sin sufijo si no se sabe). */
export function formatGameSlot(startIso: string, tz: string, homeAway: "home" | "away" | null): string {
  const start = inZone(startIso, tz);
  const slot = `${dateLabel(start)}${FIELD_SEPARATOR}${clock(start)}`;
  if (homeAway === "home") return `${slot}${FIELD_SEPARATOR}Local`;
  if (homeAway === "away") return `${slot}${FIELD_SEPARATOR}Visitante`;
  return slot;
}

/** El día de la semana abreviado y el día del mes sin cero a la izquierda: `{ dow: 'Jue', day: '8' }`. */
export function dayChip(iso: string, tz: string): { dow: string; day: string } {
  const date = inZone(iso, tz);
  return { dow: WEEKDAYS_SHORT[date.getDay()], day: String(date.getDate()) };
}

/** El mes abreviado y el día del mes sin cero a la izquierda: `{ month: 'oct', day: '8' }`. */
export function monthChip(iso: string, tz: string): { month: string; day: string } {
  const date = inZone(iso, tz);
  return { month: MONTHS[date.getMonth()], day: String(date.getDate()) };
}

/** «18:00», de 24 horas. */
export function localTime(iso: string, tz: string): string {
  return clock(inZone(iso, tz));
}

/** De 06:00 a 13:59 «Buenos días», de 14:00 a 20:59 «Buenas tardes», el resto «Buenas noches». */
export function greeting(nowIso: string, tz: string): "Buenos días" | "Buenas tardes" | "Buenas noches" {
  const hour = inZone(nowIso, tz).getHours();
  if (hour >= 6 && hour < 14) return "Buenos días";
  if (hour >= 14 && hour < 21) return "Buenas tardes";
  return "Buenas noches";
}

/** El instante de las 00:00 locales del día de `iso`, en ISO UTC. */
export function startOfLocalDay(iso: string, tz: string): string {
  const date = inZone(iso, tz);
  date.setHours(0, 0, 0, 0);
  return toIso(date);
}

/**
 * Suma `days` días de CALENDARIO en `tz`: mismo reloj de pared, no `days × 24 h`. Con el
 * cambio de hora un día local dura 23 o 25 horas, y sumar 24 h por día dejaría la semana
 * torcida (un evento de las 23:30 del último día quedaría fuera, o uno de las 00:30 del
 * siguiente, dentro).
 */
export function addLocalDays(iso: string, days: number, tz: string): string {
  const date = inZone(iso, tz);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

// Los formularios (`<input type="date">` y `<input type="time">`) dan texto en el reloj del
// club, sin zona. Estas funciones lo pasan a instante y de vuelta, siempre en `tz`.

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_INPUT = /^(\d{2}):(\d{2})$/;
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Solo para estimar por dónde empezar a contar semanas; las candidatas son de calendario. */
const WEEK_MS = 7 * DAY_MS;

/**
 * El día `date` (`YYYY-MM-DD`) a la hora `time` (`HH:mm`) del reloj de `tz`, como ISO en UTC.
 *
 * Con el cambio de hora no toda hora de pared corresponde a un único instante. Una que no
 * existe (02:30 el día que se pasa de las 02:00 a las 03:00) se adelanta lo que dura el hueco
 * y queda en las 03:30; una que se repite (02:30 cuando se vuelve de las 03:00 a las 02:00)
 * es la primera de las dos. Lo que no se admite es un día que no existe (30 de febrero): el
 * calendario lo llevaría al 2 de marzo y se guardaría otro día del que se escribió.
 *
 * El instante se calcula con los desfases de `tz`, sin construir la fecha por sus campos: ese
 * constructor (el de `Date` y el de `TZDate`) pasa por la zona del servidor, y con la hora
 * que se repite daba la primera ocurrencia en una máquina en Madrid y la segunda en una en
 * UTC (regla 7).
 */
export function zonedDateTimeToIso(date: string, time: string, tz: string): string {
  const dateParts = DATE_INPUT.exec(date);
  const timeParts = TIME_INPUT.exec(time);
  if (!dateParts || !timeParts) throw new RangeError("Fecha u hora no válidas");

  const [year, month, day] = dateParts.slice(1).map(Number);
  const [hours, minutes] = timeParts.slice(1).map(Number);
  // `Date.UTC` desborda en vez de fallar: las 25:00 serían la 01:00 del día siguiente.
  if (hours > 23 || minutes > 59) throw new RangeError("Fecha u hora no válidas");

  // El reloj de pared leído como si fuera UTC: el instante es ese menos el desfase de `tz`.
  const wall = Date.UTC(year, month - 1, day, hours, minutes);
  const asUtc = new Date(wall);
  if (asUtc.getUTCFullYear() !== year || asUtc.getUTCMonth() !== month - 1 || asUtc.getUTCDate() !== day) {
    throw new RangeError("Fecha u hora no válidas");
  }

  // Los desfases que `tz` puede tener a esa hora: el de un día antes y el de un día después.
  // Solo difieren si hay un cambio de hora por medio. Una zona que no existe da `NaN`.
  const before = tzOffset(tz, new Date(wall - DAY_MS));
  const after = tzOffset(tz, new Date(wall + DAY_MS));
  if (Number.isNaN(before) || Number.isNaN(after)) throw new RangeError("Fecha u hora no válidas");

  // Vale el instante en el que `tz` tiene de verdad el desfase con el que se calculó. La hora
  // que se repite da dos y se toma el primero; la que no existe no da ninguno y se lee con el
  // desfase de antes del cambio, que es adelantarla lo que dura el hueco.
  const instants = [before, after]
    .map((offset) => wall - offset * MINUTE_MS)
    .filter((instant) => tzOffset(tz, new Date(instant)) * MINUTE_MS === wall - instant);
  const instant = instants.length > 0 ? Math.min(...instants) : wall - before * MINUTE_MS;
  return new Date(instant).toISOString();
}

/**
 * El instante `iso` como texto para los campos del formulario, en el reloj de `tz`:
 * `{ date: '2026-11-17', time: '18:00' }`. Es la inversa de `zonedDateTimeToIso`.
 */
export function isoToLocalInputs(iso: string, tz: string): { date: string; time: string } {
  const local = inZone(iso, tz);
  const year = String(local.getFullYear()).padStart(4, "0");
  const date = `${year}-${two(local.getMonth() + 1)}-${two(local.getDate())}`;
  return { date, time: clock(local) };
}

/**
 * Día que se propone para una sesión nueva: hoy en la zona del club o, si la hora por defecto ya pasó, mañana.
 *
 * `time` es esa hora (`HH:mm`, en el reloj de `timezone`) y lo que vuelve, el día como lo
 * escribe un campo de fecha (`YYYY-MM-DD`). «Ya pasó» incluye el instante exacto: una sesión
 * que empieza ahora ya no está por venir. Mañana es el día siguiente del calendario del club,
 * no 24 h después: con el cambio de hora un día dura 23 o 25 horas.
 */
export function defaultSessionDate(nowIso: string, timezone: string, time: string): string {
  const today = isoToLocalInputs(nowIso, timezone).date;
  const startsToday = zonedDateTimeToIso(today, time, timezone);
  if (new Date(nowIso).getTime() < new Date(startsToday).getTime()) return today;

  return isoToLocalInputs(addLocalDays(nowIso, 1, timezone), timezone).date;
}

/**
 * La próxima sesión de una serie semanal: el primer instante, con el mismo día de la semana
 * y la misma hora de reloj que `startIso`, estrictamente posterior a `startIso` y a `nowIso`.
 *
 * Cada candidata es `startIso` más `7 × k` días de CALENDARIO, no `k × 168 h`: a las 18:00 de
 * un martes de octubre le siguen las 18:00 del martes siguiente aunque entre medias cambie la
 * hora. Y se cuenta desde el inicio, no desde la anterior: si una semana cae en un hueco del
 * cambio de hora (02:30 pasa a 03:30), las demás conservan las 02:30.
 */
export function nextWeeklySlot(startIso: string, nowIso: string, tz: string): string {
  const startMs = inZone(startIso, tz).getTime();
  const afterMs = Math.max(startMs, inZone(nowIso, tz).getTime());

  // El cambio de hora desvía cada candidata unas horas respecto a las semanas de 168 h, nunca
  // una semana entera. Si ya han pasado `k` semanas completas, la candidata `k - 1` queda
  // por detrás de `afterMs` seguro: se arranca en `k` y no en la primera semana, que con un
  // inicio de hace años serían cientos de vueltas.
  let week = Math.max(1,Math.floor((afterMs - startMs) / WEEK_MS));
  let candidate = addLocalDays(startIso, week * 7, tz);
  while (new Date(candidate).getTime() <= afterMs) {
    week += 1;
    candidate = addLocalDays(startIso, week * 7, tz);
  }
  return candidate;
}
