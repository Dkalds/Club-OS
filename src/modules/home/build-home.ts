import {
  addLocalDays,
  dayChip,
  formatEventSlot,
  formatGameSlot,
  greeting,
  localTime,
  startOfLocalDay,
} from "@/lib/time";
import type { HomeData, HomeEvent, HomeGame, HomeInput, HomePractice, WeekItem } from "./types";

const PRACTICE_WITHOUT_PLAN = "Entrenamiento sin plan";
const WEEK_PRACTICE_WITHOUT_PLAN = "Sin plan";
/** Un partido sin sus datos (no debería pasar) sigue siendo un partido del calendario. */
const UNKNOWN_OPPONENT = "Rival por confirmar";
const WEEK_DAYS = 7;

const FIELD_SEPARATOR = " · ";
// Mismas etiquetas que `formatGameSlot`; los tests de los dos lados las fijan.
const HOME_AWAY_LABEL = { home: "Local", away: "Visitante" } as const;

type Upcoming = { event: HomeEvent; startMs: number; endMs: number };

function compareById(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Orden total y estable: primero por inicio y, a igual inicio, por id. */
function byStart(a: Upcoming, b: Upcoming): number {
  return a.startMs - b.startMs || compareById(a.event.id, b.event.id);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toPractice(item: Upcoming, teamName: string, tz: string): HomePractice {
  const { event } = item;
  const { plan } = event;
  return {
    eventId: event.id,
    teamName,
    slotLabel: formatEventSlot(event.startsAt, event.endsAt, tz),
    title: plan ? plan.title : PRACTICE_WITHOUT_PLAN,
    totalMinutes: plan ? sum(plan.itemMinutes) : Math.round((item.endMs - item.startMs) / 60_000),
    drillCount: plan ? plan.itemMinutes.length : 0,
    focus: plan ? [...plan.focus] : [],
    location: event.location,
  };
}

function toGame(item: Upcoming, teamName: string, tz: string): HomeGame {
  const { event } = item;
  return {
    eventId: event.id,
    teamName,
    slotLabel: formatGameSlot(event.startsAt, tz, event.game?.homeAway ?? null),
    opponent: event.game?.opponent ?? UNKNOWN_OPPONENT,
    competition: event.game?.competition ?? null,
  };
}

function weekSubtitle(event: HomeEvent): string {
  if (event.kind === "practice") return event.plan?.title ?? WEEK_PRACTICE_WITHOUT_PLAN;
  if (!event.game) return UNKNOWN_OPPONENT;

  const versus = `vs ${event.game.opponent}`;
  return event.game.homeAway
    ? `${versus}${FIELD_SEPARATOR}${HOME_AWAY_LABEL[event.game.homeAway]}`
    : versus;
}

function kicker(teams: HomeInput["teams"]): string | null {
  const [first] = teams;
  if (!first) return null;
  const who = teams.length === 1 ? first.name : `${teams.length} equipos`;
  return `${who}${FIELD_SEPARATOR}Temporada ${first.seasonName}`;
}

/**
 * Los datos de la pantalla de Inicio a partir de lo que ya se ha leído de la base de datos.
 *
 * Es pura: no lee la hora ni nada de fuera. Todo lo que muestra (día, hora, saludo, los
 * límites de «Esta semana») se calcula en `tz`, la zona del club.
 *
 * Solo cuentan los eventos `scheduled` que no han terminado (`endsAt > now`): uno en curso
 * sigue siendo el próximo. Los cancelados, los hechos y los pasados no salen en ningún sitio.
 */
export function buildHome(input: HomeInput, nowIso: string, tz: string): HomeData {
  const nowMs = new Date(nowIso).getTime();
  const teamNames = new Map(input.teams.map((team) => [team.id, team.name]));
  const teamName = (teamId: string) => teamNames.get(teamId) ?? "";
  const severalTeams = input.teams.length > 1;

  const upcoming: Upcoming[] = input.events
    .map((event) => ({
      event,
      startMs: new Date(event.startsAt).getTime(),
      endMs: new Date(event.endsAt).getTime(),
    }))
    .filter(({ event, endMs }) => event.status === "scheduled" && endMs > nowMs)
    .sort(byStart);

  const nextPractice = upcoming.find(({ event }) => event.kind === "practice");
  const nextGame = upcoming.find(({ event }) => event.kind === "game");

  // «Esta semana»: de las 00:00 locales de hoy a las 00:00 locales del día 7 siguiente
  // (un intervalo semiabierto). Los límites se calculan en días de calendario, no en horas.
  const weekStart = startOfLocalDay(nowIso, tz);
  const weekStartMs = new Date(weekStart).getTime();
  const weekEndMs = new Date(addLocalDays(weekStart, WEEK_DAYS, tz)).getTime();

  const week: WeekItem[] = upcoming
    .filter(({ startMs }) => startMs >= weekStartMs && startMs < weekEndMs)
    .map(({ event }) => {
      const { dow, day } = dayChip(event.startsAt, tz);
      const subtitle = weekSubtitle(event);
      const name = teamName(event.teamId);
      return {
        eventId: event.id,
        kind: event.kind,
        dow,
        day,
        title: event.kind === "practice" ? "Entrenamiento" : "Partido",
        subtitle: severalTeams && name ? `${name}${FIELD_SEPARATOR}${subtitle}` : subtitle,
        time: localTime(event.startsAt, tz),
      };
    });

  return {
    greeting: greeting(nowIso, tz),
    firstName: input.firstName,
    kicker: kicker(input.teams),
    nextPractice: nextPractice ? toPractice(nextPractice, teamName(nextPractice.event.teamId), tz) : null,
    nextGame: nextGame ? toGame(nextGame, teamName(nextGame.event.teamId), tz) : null,
    week,
    hasTeams: input.teams.length > 0,
  };
}
