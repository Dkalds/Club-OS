import { formatDate } from "@/lib/time";
import type { CoachNote, GoalFormOptions, GoalStatus, NoteVisibility, PlayerGoal, PlayerProfile } from "./types";

// De las filas de PostgREST a la ficha del jugador. Funciones puras, aparte para probarlas sin
// base de datos. Las fechas salen en la zona del club (regla 7).
//
// Las claves foráneas son compuestas (`organization_id`, x_id): una relación embebida puede
// llegar como objeto o como lista de un elemento. Aquí se lee igual en los dos casos.
type Embedded<T> = T | T[] | null;

function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ── Columnas ─────────────────────────────────────────────────────────────────────────

/**
 * El jugador en la plantilla del equipo, con su persona y su equipo. El `!inner` con el filtro
 * sobre `teams.seasons.is_current` deja fuera un equipo de otra temporada. Sin `birth_year`:
 * la ficha no lo enseña y no se pide.
 */
export const PLAYER_COLUMNS = `jersey_number, position,
  people(id, first_name, last_name),
  teams!inner(id, name, categories(name), seasons!inner(is_current))`;

export const GOAL_COLUMNS = `id, title, description, status, achieved_at, created_at,
  focus_areas(id, name),
  standards(id, number, title)`;

/**
 * La nota con el nombre de su autor. `coach_notes` tiene dos claves hacia `people` (el jugador
 * y el autor): el embed nombra la del autor.
 */
export const NOTE_COLUMNS = `id, body, visibility, created_at, updated_at, author_id,
  author:people!coach_notes_organization_id_author_person_id_fkey(first_name, last_name)`;

// ── Filas ────────────────────────────────────────────────────────────────────────────

type PersonName = { first_name: string; last_name: string };

export type PlayerRow = {
  jersey_number: number | null;
  position: string | null;
  people: Embedded<PersonName & { id: string }>;
  teams: Embedded<{ id: string; name: string; categories: Embedded<{ name: string }> }>;
};

export type GoalRow = {
  id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  achieved_at: string | null;
  created_at: string;
  focus_areas: Embedded<{ id: string; name: string }>;
  standards: Embedded<{ id: string; number: number; title: string }>;
};

export type NoteRow = {
  id: string;
  body: string;
  visibility: NoteVisibility;
  created_at: string;
  updated_at: string;
  author_id: string;
  author: Embedded<PersonName>;
};

const byTime = (a: string, b: string) => Date.parse(a) - Date.parse(b);

function toGoal(row: GoalRow, timezone: string): PlayerGoal {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    achievedOn: row.achieved_at ? formatDate(row.achieved_at, timezone) : null,
    focus: one(row.focus_areas),
    standard: one(row.standards),
  };
}

function toNote(row: NoteRow, userId: string, timezone: string): CoachNote {
  const author = one(row.author);
  return {
    id: row.id,
    body: row.body,
    visibility: row.visibility,
    writtenOn: formatDate(row.created_at, timezone),
    edited: Date.parse(row.updated_at) > Date.parse(row.created_at),
    authorName: author ? `${author.first_name} ${author.last_name}` : null,
    isMine: row.author_id === userId,
  };
}

/**
 * La ficha. Los objetivos activos, del más antiguo al más nuevo; el historial (logrados y
 * archivados), lo último primero. Las notas, de la más reciente a la más antigua. `null` si la
 * persona o el equipo no llegan (RLS no los deja ver).
 */
export function toPlayerProfile({
  player,
  goals,
  notes,
  userId,
  timezone,
}: {
  player: PlayerRow;
  goals: GoalRow[];
  notes: NoteRow[];
  userId: string;
  timezone: string;
}): PlayerProfile | null {
  const person = one(player.people);
  const team = one(player.teams);
  if (!person || !team) return null;

  const active = goals.filter((g) => g.status === "active").sort((a, b) => byTime(a.created_at, b.created_at));
  const past = goals
    .filter((g) => g.status !== "active")
    .sort(
      (a, b) =>
        byTime(b.achieved_at ?? b.created_at, a.achieved_at ?? a.created_at) ||
        byTime(b.created_at, a.created_at),
    );

  return {
    personId: person.id,
    firstName: person.first_name,
    lastName: person.last_name,
    jerseyNumber: player.jersey_number,
    position: player.position,
    team: { id: team.id, name: team.name, categoryName: one(team.categories)?.name ?? "" },
    activeGoals: active.map((g) => toGoal(g, timezone)),
    pastGoals: past.map((g) => toGoal(g, timezone)),
    notes: [...notes].sort((a, b) => byTime(b.created_at, a.created_at)).map((n) => toNote(n, userId, timezone)),
  };
}

/** Los focos en el orden en que llegan (el del club) y los Standards por número. */
export function toGoalFormOptions(
  focusAreas: Array<{ id: string; name: string }>,
  standards: Array<{ id: string; number: number; title: string }>,
): GoalFormOptions {
  return {
    focusAreas: focusAreas.map(({ id, name }) => ({ id, name })),
    standards: [...standards]
      .sort((a, b) => a.number - b.number)
      .map(({ id, number, title }) => ({ id, number, title })),
  };
}
