import { addLocalDays, dayChip, dayMonth, localTime, monthChip, startOfLocalWeek } from "@/lib/time";
import { gameStatusLabel, scoreLabel } from "@/modules/games/format";
import { minutesLabel, statusLabel } from "@/modules/practice/format";
import { sessionMinutes } from "@/modules/practice/items";
import type { AgendaEvent, AgendaItem, AgendaScope, AgendaWeek } from "./types";

/** Entre campos de un subtítulo: espacio, U+00B7, espacio (el mismo que el resto de la app). */
const FIELD_SEPARATOR = " · ";
const WEEK_DAYS = 7;

// Las mismas palabras que la lista de partidos y `formatGameSlot`.
const HOME_AWAY_LABEL = { home: "Local", away: "Visitante" } as const;

type Options = {
  scope: AgendaScope;
  /** El instante actual del servidor, en ISO: de él salen «esta semana» y «ya empezó». */
  nowIso: string;
  /** La zona del club (regla 7): en ella se cuentan las semanas y se dicen los días y las horas. */
  tz: string;
  clubSlug: string;
};

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Los campos que hay, unidos; los vacíos no dejan un separador suelto. */
function join(fields: Array<string | null | undefined>): string {
  return fields.filter((field): field is string => Boolean(field?.trim())).join(FIELD_SEPARATOR);
}

function practiceItem(event: AgendaEvent, plan: NonNullable<AgendaEvent["plan"]>, team: string | null): Omit<AgendaItem, "chip" | "href"> {
  const minutes = sessionMinutes(
    plan.itemMinutes.map((each) => ({ minutes: each })),
    event.startsAt,
    event.endsAt,
  );
  const status = statusLabel(event.status);

  return {
    eventId: event.id,
    kind: "practice",
    title: plan.title,
    subtitle: join([team, "Entrenamiento", minutesLabel(minutes), event.location]),
    trail: status ? { text: status, tone: event.status === "done" ? "done" : "plain" } : null,
  };
}

function gameItem(
  event: AgendaEvent,
  game: NonNullable<AgendaEvent["game"]>,
  team: string | null,
  started: boolean,
): Omit<AgendaItem, "chip" | "href"> {
  const status = gameStatusLabel(event.status, started);

  return {
    eventId: event.id,
    kind: "game",
    title: `vs ${game.opponent}`,
    subtitle: join([team, "Partido", game.homeAway ? HOME_AWAY_LABEL[game.homeAway] : null, game.competition]),
    // Uno jugado enseña su marcador, no un estado; así lo hace también la ficha del partido.
    trail: game.score
      ? { text: scoreLabel(game.score), spoken: `${game.score.for} a ${game.score.against}`, tone: "plain" }
      : status
        ? { text: status, tone: "plain" }
        : null,
  };
}

/** «Esta semana», «Semana que viene», «Semana pasada» o «Semana del 19 oct» (su lunes). */
function weekLabel(weekStart: string, nowIso: string, tz: string): string {
  if (weekStart === startOfLocalWeek(nowIso, tz)) return "Esta semana";
  if (weekStart === startOfLocalWeek(addLocalDays(nowIso, WEEK_DAYS, tz), tz)) return "Semana que viene";
  if (weekStart === startOfLocalWeek(addLocalDays(nowIso, -WEEK_DAYS, tz), tz)) return "Semana pasada";
  return `Semana del ${dayMonth(weekStart, tz)}`;
}

/**
 * La agenda a partir de los eventos ya leídos: filas agrupadas por semanas.
 *
 * Es pura: no lee la hora ni nada de fuera. Las semanas van de lunes a domingo y se cuentan en
 * `tz`, por días de calendario: un evento del domingo a las 23:30 y otro del lunes a las 00:30
 * caen en semanas distintas, también la semana del cambio de hora. Lo que viene se ordena del
 * más próximo al más lejano; lo anterior, del más reciente al más antiguo; a igual hora, por id.
 *
 * Cada fila dice lo que dicen las listas de Sesiones y de Partidos: el título del plan o el
 * rival, de qué tipo es, lo que dura o dónde se juega, y a la derecha la hora o cómo acabó. Con
 * más de un equipo (`teams`), el subtítulo empieza por el equipo.
 *
 * No salen: un entreno sin plan (su detalle sería un 404), un partido sin sus datos y un evento
 * de un equipo que no está en `teams`.
 */
export function buildAgenda(
  events: readonly AgendaEvent[],
  teams: ReadonlyArray<{ id: string; name: string }>,
  { scope, nowIso, tz, clubSlug }: Options,
): AgendaWeek[] {
  const nowMs = Date.parse(nowIso);
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const severalTeams = teams.length > 1;
  const direction = scope === "upcoming" ? 1 : -1;
  const base = `/c/${clubSlug}`;

  const ordered = events
    .filter((event) => teamNames.has(event.teamId))
    .map((event) => ({ event, startMs: Date.parse(event.startsAt) }))
    .sort((a, b) => direction * (a.startMs - b.startMs) || compareText(a.event.id, b.event.id));

  const weeks: AgendaWeek[] = [];

  for (const { event, startMs } of ordered) {
    const team = severalTeams ? (teamNames.get(event.teamId) ?? null) : null;
    const content =
      event.kind === "practice"
        ? event.plan && practiceItem(event, event.plan, team)
        : event.game && gameItem(event, event.game, team, startMs <= nowMs);
    if (!content) continue;

    const chip = scope === "upcoming" ? dayChip(event.startsAt, tz) : monthChip(event.startsAt, tz);
    const item: AgendaItem = {
      ...content,
      href: `${base}/${event.kind === "practice" ? "train" : "games"}/${event.id}`,
      chip: { label: "dow" in chip ? chip.dow : chip.month, day: chip.day },
      // Sin nada que decir de cómo acabó, la hora.
      trail: content.trail ?? { text: localTime(event.startsAt, tz), tone: "plain" },
    };

    const key = startOfLocalWeek(event.startsAt, tz);
    const last = weeks.at(-1);
    if (last?.key === key) {
      last.items.push(item);
    } else {
      weeks.push({ key, label: weekLabel(key, nowIso, tz), items: [item] });
    }
  }

  return weeks;
}
