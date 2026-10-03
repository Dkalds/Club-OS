import { TZDate } from "@date-fns/tz";

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

/**
 * El instante `iso` visto en `tz`. Si la fecha o la zona no existen avisa en vez de dejar
 * que `NaN` acabe pintado en pantalla.
 */
function inZone(iso: string, tz: string): TZDate {
  const date = new TZDate(iso, tz);
  if (Number.isNaN(date.getTime())) {
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
