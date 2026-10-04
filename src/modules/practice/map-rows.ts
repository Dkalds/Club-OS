import type { Database } from "@/lib/database.types";
import { dayChip, formatEventSlot, localTime } from "@/lib/time";
import type { Standard } from "@/modules/methodology/types";
import { sessionMinutes } from "./items";
import type {
  FocusOption,
  PracticeDetail,
  PracticeDetailItem,
  PracticeListItem,
  PracticeStatus,
  SavedPracticeItem,
  TeamOption,
} from "./types";

// Lo que comparten las lecturas de las sesiones (`queries.ts`): las columnas que se piden, la
// forma de las filas que devuelve PostgREST y el paso de fila a tipo. Es aparte, y puro, para
// probarlo sin base de datos.
//
// Una relación embebida llega como objeto si PostgREST la reconoce «a uno» y como lista si no.
// Las claves foráneas de estas tablas son compuestas (`organization_id`, x_id): el plan de un
// evento llega como lista de un elemento, y el resto, según cómo las resuelva. Aquí se lee
// igual en los dos casos. Una fila anidada que RLS no deja ver llega como `null` (o lista
// vacía) aunque el tipo generado diga que siempre hay fila: se acepta y se salta.

type Tables = Database["public"]["Tables"];
type Embedded<T> = T | T[] | null;

function one<T>(value: Embedded<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** El título de un entrenamiento sin plan en la lista. */
const NO_PLAN_TITLE = "Entrenamiento sin plan";
/** El título de un ítem cuyo ejercicio no se ve y que no guarda título propio. */
const FALLBACK_ITEM_TITLE = "Ejercicio";

// ── Columnas ─────────────────────────────────────────────────────────────────────────

/**
 * Los equipos de la dirección: todos los del club. El `!inner` con el filtro sobre
 * `seasons.is_current` deja solo los de la temporada actual.
 */
export const TEAM_COLUMNS = "id, name, seasons!inner(is_current)";
/** Los equipos de quien entrena: los de su cuerpo técnico, con el mismo filtro de temporada. */
export const STAFF_TEAM_COLUMNS = "teams!inner(id, name, seasons!inner(is_current))";

/**
 * La lista: el evento con su franja y su lugar, el título del plan y los minutos de sus ítems.
 * El fin de la franja se pide para decir cuánto dura una sesión que aún no tiene ejercicios. El
 * nombre del equipo no se pide: sale de los equipos gestionables, que ya se han leído.
 */
export const LIST_COLUMNS =
  "id, team_id, status, starts_at, ends_at, location, practice_plans(title, practice_items(minutes))";

/**
 * El detalle. Los dos focos del plan apuntan a la misma tabla, y cada uno lleva el nombre de
 * su clave foránea para que PostgREST sepa cuál es cuál. De cada ejercicio se piden sus
 * Standards con el `status`: la dirección ve los borradores y en el detalle solo salen los
 * publicados.
 */
export const DETAIL_COLUMNS = `id, team_id, status, starts_at, ends_at, location,
  teams(name),
  practice_plans(
    id, title, notes, updated_at,
    primary_focus:focus_areas!practice_plans_organization_id_primary_focus_id_fkey(id, name),
    secondary_focus:focus_areas!practice_plans_organization_id_secondary_focus_id_fkey(id, name),
    practice_items(
      id, sort, phase, drill_id, title_override, minutes, notes,
      drills(title, drill_standards(standards(id, number, title, description, status)))
    )
  )`;

// ── Filas ────────────────────────────────────────────────────────────────────────────

export type TeamRow = { id: string; name: string };
export type StaffTeamRow = { teams: Embedded<TeamRow> };

type StandardEmbed = Pick<Tables["standards"]["Row"], "id" | "number" | "title" | "description" | "status">;

export type PracticeItemRow = Pick<
  Tables["practice_items"]["Row"],
  "id" | "sort" | "phase" | "drill_id" | "title_override" | "minutes" | "notes"
> & {
  drills: Embedded<{
    title: string;
    drill_standards: Array<{ standards: Embedded<StandardEmbed> }> | null;
  }>;
};

export type PracticePlanRow = Pick<Tables["practice_plans"]["Row"], "id" | "title" | "notes" | "updated_at"> & {
  primary_focus: Embedded<FocusOption>;
  secondary_focus: Embedded<FocusOption>;
  practice_items: PracticeItemRow[] | null;
};

/** Una fila de `events` con su equipo y su plan, para el detalle. */
export type PracticeDetailRow = Pick<
  Tables["events"]["Row"],
  "id" | "team_id" | "starts_at" | "ends_at" | "location"
> & {
  status: PracticeStatus;
  teams: Embedded<{ name: string }>;
  practice_plans: Embedded<PracticePlanRow>;
};

/** Una fila de `events` con su franja, el título del plan y los minutos de sus ítems, para la lista. */
export type PracticeListRow = Pick<
  Tables["events"]["Row"],
  "id" | "team_id" | "starts_at" | "ends_at" | "location"
> & {
  status: PracticeStatus;
  practice_plans: Embedded<{ title: string; practice_items: Array<{ minutes: number }> | null }>;
};

// ── Equipos ──────────────────────────────────────────────────────────────────────────

/** Por nombre y, a igual nombre, por id: un orden fijo, que no depende del de la base de datos. */
export function toTeamOptions(rows: TeamRow[]): TeamOption[] {
  return rows
    .map((row) => ({ id: row.id, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "es") || compareText(a.id, b.id));
}

/** Los equipos de las filas de `team_staff`; una fila sin equipo no se cuenta. */
export function toStaffTeamOptions(rows: StaffTeamRow[]): TeamOption[] {
  return toTeamOptions(rows.flatMap((row) => one(row.teams) ?? []));
}

// ── Lista ────────────────────────────────────────────────────────────────────────────

/**
 * Las filas de la lista, en el orden en que llegan. El día y la hora salen en `timezone` (la
 * del club) y el nombre del equipo, de `teams`. El lugar pasa tal cual: quien pinta decide qué
 * hacer con uno en blanco. Los minutos son los de los ítems y, sin ítems (con plan vacío o sin
 * plan), los de la franja del evento: una sesión recién creada dura lo que se programó. Sin plan
 * ni ítems son 0 ejercicios.
 */
export function toPracticeListItems(
  rows: PracticeListRow[],
  teams: TeamOption[],
  timezone: string,
): PracticeListItem[] {
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));

  return rows.map((row) => {
    const plan = one(row.practice_plans);
    const items = plan?.practice_items ?? [];
    const { dow, day } = dayChip(row.starts_at, timezone);

    return {
      eventId: row.id,
      teamName: teamNames.get(row.team_id) ?? "",
      dow,
      day,
      time: localTime(row.starts_at, timezone),
      title: plan?.title ?? NO_PLAN_TITLE,
      totalMinutes: sessionMinutes(items, row.starts_at, row.ends_at),
      itemCount: items.length,
      status: row.status,
      location: row.location,
    };
  });
}

// ── Detalle ──────────────────────────────────────────────────────────────────────────

function focusOption(value: Embedded<FocusOption>): FocusOption | null {
  const focus = one(value);
  return focus ? { id: focus.id, name: focus.name } : null;
}

function toSavedItem(row: PracticeItemRow): SavedPracticeItem {
  return {
    id: row.id,
    drillId: row.drill_id,
    title: row.title_override ?? one(row.drills)?.title ?? FALLBACK_ITEM_TITLE,
    phase: row.phase,
    minutes: row.minutes,
    notes: row.notes,
  };
}

/**
 * Un ítem del detalle: el guardado y si su ejercicio llegó. `drill_id` dice que el ítem es un
 * ejercicio; que la relación embebida venga vacía dice que RLS no deja ver su ficha (un
 * borrador de otro entrenador), y entonces la fila se queda en texto en vez de llevar a un 404.
 */
function toDetailItem(row: PracticeItemRow): PracticeDetailItem {
  return { ...toSavedItem(row), drillVisible: row.drill_id !== null && one(row.drills) !== null };
}

/** Los Standards publicados de los ejercicios de los ítems, cada uno una vez y por número. */
function toStandards(items: PracticeItemRow[]): Standard[] {
  const byId = new Map<string, Standard>();

  for (const item of items) {
    for (const link of one(item.drills)?.drill_standards ?? []) {
      const standard = one(link.standards);
      if (!standard || standard.status !== "published" || byId.has(standard.id)) continue;
      byId.set(standard.id, {
        id: standard.id,
        number: standard.number,
        title: standard.title,
        description: standard.description,
      });
    }
  }

  return [...byId.values()].sort((a, b) => a.number - b.number || compareText(a.id, b.id));
}

/**
 * El entrenamiento entero para el constructor, o `null` si el evento no tiene plan (o RLS no
 * deja verlo). Los ítems salen por `sort`, porque PostgREST no ordena lo anidado. `updatedAt`
 * queda tal cual lo da PostgREST: es la versión con la que se guarda y no debe pasar por `Date`.
 *
 * `canManage` es el permiso de la sesión para gestionar sesiones; solo se edita lo programado.
 */
export function toPracticeDetail(
  row: PracticeDetailRow,
  { timezone, canManage }: { timezone: string; canManage: boolean },
): PracticeDetail | null {
  const plan = one(row.practice_plans);
  if (!plan) return null;

  const ordered = [...(plan.practice_items ?? [])].sort(
    (a, b) => a.sort - b.sort || compareText(a.id, b.id),
  );

  return {
    eventId: row.id,
    planId: plan.id,
    teamId: row.team_id,
    teamName: one(row.teams)?.name ?? "",
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    slotLabel: formatEventSlot(row.starts_at, row.ends_at, timezone),
    location: row.location,
    title: plan.title,
    primaryFocus: focusOption(plan.primary_focus),
    secondaryFocus: focusOption(plan.secondary_focus),
    notes: plan.notes,
    items: ordered.map(toDetailItem),
    standards: toStandards(ordered),
    updatedAt: plan.updated_at,
    canEdit: canManage && row.status === "scheduled",
  };
}
