import { TZDate } from "@date-fns/tz";
import { addDays } from "date-fns";

export type SlotIso = { startsAt: string; endsAt: string };

export type SeedSchedule = {
  past: SlotIso[];
  upcoming: SlotIso[];
  game: SlotIso;
  /** El sábado más reciente cuyo partido (10:30–12:00) ya terminó: el partido jugado del seed. */
  pastGame: SlotIso;
  /** Franja de hoy en la zona del club, para la sesión de Live de seed. */
  todayLive: SlotIso;
};

const TUESDAY = 2;
const THURSDAY = 4;
const SATURDAY = 6;

const PRACTICE = { start: "18:00", end: "19:15" } as const;
const GAME = { start: "10:30", end: "12:00" } as const;

const UPCOMING_COUNT = 2;
const PAST_COUNT = 4;
// Dos semanas bastan para encontrar cuatro martes/jueves hacia atrás y un sábado hacia delante.
const SEARCH_DAYS = 14;

function parseTime(time: string): [hours: number, minutes: number] {
  const [hours, minutes] = time.split(":").map(Number);
  return [hours, minutes];
}

// `TZDate` hace que los getters y el constructor trabajen en la zona dada. Para guardar el
// instante hay que salir de `TZDate`: su `toISOString()` devuelve el desfase de la zona
// (`+02:00`), no UTC.
function slotOnLocalDay(day: Date, tz: string, start: string, end: string): SlotIso {
  const at = (time: string) => {
    const [hours, minutes] = parseTime(time);
    const instant = new TZDate(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      hours,
      minutes,
      0,
      0,
      tz,
    );
    return new Date(instant.getTime()).toISOString();
  };
  return { startsAt: at(start), endsAt: at(end) };
}

/**
 * Pone otras horas locales en el mismo día (en la zona `tz`) de un slot ya calculado.
 * Se usa para las sesiones que comparten día con `upcoming[0]` pero no su hora.
 */
export function slotOnSameDay(
  reference: SlotIso,
  tz: string,
  start: string,
  end: string,
): SlotIso {
  const day = new TZDate(new Date(reference.startsAt), tz);
  return slotOnLocalDay(day, tz, start, end);
}

/**
 * Calendario relativo a `now` y a la zona del club, para que el seed siempre tenga
 * sesiones próximas y pasadas:
 *  - upcoming: los dos siguientes martes/jueves 18:00–19:15 con inicio posterior a `now`;
 *  - game: el siguiente sábado 10:30–12:00 con inicio posterior a `now`;
 *  - past: los cuatro martes/jueves 18:00–19:15 más recientes con inicio anterior a `now`,
 *    del más reciente al más antiguo.
 * "Posterior" y "anterior" son estrictos y comparan el inicio del slot.
 */
export function seedSchedule(now: Date, tz: string): SeedSchedule {
  const today = new TZDate(now, tz);
  const nowMs = now.getTime();
  const startMs = (slot: SlotIso) => Date.parse(slot.startsAt);

  const upcoming: SlotIso[] = [];
  let game: SlotIso | undefined;
  for (let offset = 0; offset <= SEARCH_DAYS; offset += 1) {
    const day = addDays(today, offset);
    const weekday = day.getDay();
    if (upcoming.length < UPCOMING_COUNT && (weekday === TUESDAY || weekday === THURSDAY)) {
      const slot = slotOnLocalDay(day, tz, PRACTICE.start, PRACTICE.end);
      if (startMs(slot) > nowMs) upcoming.push(slot);
    }
    if (game === undefined && weekday === SATURDAY) {
      const slot = slotOnLocalDay(day, tz, GAME.start, GAME.end);
      if (startMs(slot) > nowMs) game = slot;
    }
  }

  const past: SlotIso[] = [];
  for (let offset = 0; offset >= -SEARCH_DAYS && past.length < PAST_COUNT; offset -= 1) {
    const day = addDays(today, offset);
    const weekday = day.getDay();
    if (weekday === TUESDAY || weekday === THURSDAY) {
      const slot = slotOnLocalDay(day, tz, PRACTICE.start, PRACTICE.end);
      if (startMs(slot) < nowMs) past.push(slot);
    }
  }

  let pastGame: SlotIso | undefined;
  for (let offset = 0; offset >= -SEARCH_DAYS && pastGame === undefined; offset -= 1) {
    const day = addDays(today, offset);
    if (day.getDay() === SATURDAY) {
      const slot = slotOnLocalDay(day, tz, GAME.start, GAME.end);
      if (Date.parse(slot.endsAt) <= nowMs) pastGame = slot;
    }
  }

  if (
    upcoming.length < UPCOMING_COUNT ||
    game === undefined ||
    pastGame === undefined ||
    past.length < PAST_COUNT
  ) {
    throw new Error(`seedSchedule: no se pudo calcular el calendario para ${now.toISOString()} en ${tz}`);
  }
  const todayLive = slotOnLocalDay(today, tz, PRACTICE.start, PRACTICE.end);
  return { past, upcoming, game, pastGame, todayLive };
}
