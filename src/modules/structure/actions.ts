"use server";

import type { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { mutate as runMutation, type UniqueField, type Write } from "@/lib/mutate";
import { toAgeBand } from "./format";
import {
  categoryIdSchema,
  createCategorySchema,
  createPersonSchema,
  createSeasonSchema,
  createTeamSchema,
  newPlayerSchema,
  playerSchema,
  seasonIdSchema,
  seatSchema,
  setPersonArchivedSchema,
  staffSchema,
  teamIdSchema,
  updateCategorySchema,
  updatePersonSchema,
  updateSeasonSchema,
  updateTeamSchema,
  type CategoryIdInput,
  type CreateCategoryInput,
  type CreatePersonInput,
  type CreateSeasonInput,
  type CreateTeamInput,
  type NewPlayerInput,
  type PlayerInput,
  type SeasonIdInput,
  type SeatInput,
  type SetPersonArchivedInput,
  type StaffInput,
  type TeamIdInput,
  type UpdateCategoryInput,
  type UpdatePersonInput,
  type UpdateSeasonInput,
  type UpdateTeamInput,
} from "./schema";

// Acciones de la estructura del club (temporadas, categorías, equipos, cuerpos técnicos,
// plantillas y personas): solo la dirección las usa, desde Gestión.
//
// Todas siguen el orden de `mutate` (`@/lib/mutate`): Zod sobre la entrada, el club y el permiso
// `club.manage` (sin permiso, `NOT_FOUND` sin tocar la base), la escritura y, si ha ido bien,
// `revalidatePath`. RLS decide de verdad quién escribe.
//
// Todo va acotado al club de `clubSlug`: los insert llevan su `organization_id`, y los update,
// los delete y los select lo filtran. Las funciones SQL que reciben solo un id
// (`set_current_season`, `delete_team`, `add_new_player`) no reciben el club: antes se comprueba
// aquí que la fila es de este (C25), para que quien dirige dos clubes no escriba en el B
// llamando a la acción del A.

/** Gestión, y la app: «mis equipos», la agenda y las plantillas cambian con la estructura. */
const ROUTES = ["/c/[club]/admin", "/c/[club]/(app)"] as const;

/** Una clave foránea que no encuentra su fila, o que impide borrar la que se pide. */
const FOREIGN_KEY_VIOLATION = "23503";

const DUPLICATE_SEASON: UniqueField = { field: "name", message: "Ya hay una temporada con ese nombre." };
const DUPLICATE_CATEGORY: UniqueField = { field: "name", message: "Ya hay una categoría con ese nombre." };
const DUPLICATE_TEAM: UniqueField = {
  field: "name",
  message: "Ya hay un equipo con ese nombre en esta temporada.",
};
const DUPLICATE_STAFF: UniqueField = { field: "personId", message: "Ya está en el cuerpo técnico." };
const DUPLICATE_PLAYER: UniqueField = { field: "personId", message: "Ya está en la plantilla." };
const DUPLICATE_JERSEY: UniqueField = {
  field: "jerseyNumber",
  message: "Ese dorsal ya lo lleva otra persona del equipo.",
};
const STILL_IN_TEAM =
  "Sigue en un equipo de la temporada actual o de una que no ha acabado. Quítala antes de ese equipo.";

function mutate<D, T>(
  name: string,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runMutation(
    { tag: `structure.${name}`, permission: "club.manage", routes: ROUTES },
    clubSlug,
    schema,
    input,
    write,
  );
}

/** El único de la plantilla que ha chocado: el dorsal, o la persona, que ya estaba. */
function playerConflict(error: { message?: string }): UniqueField {
  return error.message?.includes("jersey_number") ? DUPLICATE_JERSEY : DUPLICATE_PLAYER;
}

// ── Temporadas ──────────────────────────────────────────────────────────────────────────

/**
 * Una temporada nueva. La primera de un club nace actual; las demás, no. Con `copyTeamsFrom`,
 * nace con los equipos de esa temporada (nombre y categoría), vacíos.
 */
export async function createSeason(
  clubSlug: string,
  input: CreateSeasonInput,
): Promise<ActionResult<{ id: string }>> {
  return mutate("create-season", clubSlug, createSeasonSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: id, error } = await db.rpc("create_season", {
      p_org: ctx.org.id,
      p_name: data.name,
      p_starts_on: data.startsOn,
      p_ends_on: data.endsOn,
      // Ausente y no `null` (C15). Que sea de este club lo comprueba la función, con `p_org`.
      ...(data.copyTeamsFrom ? { p_copy_teams_from: data.copyTeamsFrom } : {}),
    });
    if (error) return fromDb(error, DUPLICATE_SEASON);

    return ok({ id });
  });
}

/** Cambia el nombre y las fechas de una temporada. */
export async function updateSeason(clubSlug: string, input: UpdateSeasonInput): Promise<ActionResult<null>> {
  return mutate("update-season", clubSlug, updateSeasonSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("seasons")
      .update({ name: data.name, starts_on: data.startsOn, ends_on: data.endsOn })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .select("id");
    if (error) return fromDb(error, DUPLICATE_SEASON);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

/** Deja una temporada como la actual del club: lo que ve todo el club pasa a ser lo suyo. */
export async function setCurrentSeason(clubSlug: string, input: SeasonIdInput): Promise<ActionResult<null>> {
  return mutate("set-current-season", clubSlug, seasonIdSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: season, error: readError } = await db
      .from("seasons")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .maybeSingle();
    if (readError) return fromDb(readError);
    if (!season) return fail("NOT_FOUND");

    const { error } = await db.rpc("set_current_season", { p_season: data.id });
    if (error) return fromDb(error);

    return ok(null);
  });
}

/** Borra una temporada sin equipos. La actual no se borra: es `IN_USE`, como la que tiene equipos. */
export async function deleteSeason(clubSlug: string, input: SeasonIdInput): Promise<ActionResult<null>> {
  return mutate("delete-season", clubSlug, seasonIdSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: season, error: readError } = await db
      .from("seasons")
      .select("id, is_current")
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .maybeSingle();
    if (readError) return fromDb(readError);
    if (!season) return fail("NOT_FOUND");
    if (season.is_current) return fail("IN_USE");

    const { data: rows, error } = await db
      .from("seasons")
      .delete()
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .select("id");
    if (error) return error.code === FOREIGN_KEY_VIOLATION ? fail("IN_USE") : fromDb(error);

    // Sin fila borrada: entre la lectura y el borrado alguien la marcó como actual (la política
    // no deja borrarla) o la borró.
    return rows.length === 0 ? fail("IN_USE") : ok(null);
  });
}

// ── Categorías ──────────────────────────────────────────────────────────────────────────

export async function createCategory(
  clubSlug: string,
  input: CreateCategoryInput,
): Promise<ActionResult<{ id: string }>> {
  return mutate("create-category", clubSlug, createCategorySchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: row, error } = await db
      .from("categories")
      .insert({ organization_id: ctx.org.id, name: data.name, age_band: toAgeBand(data.age), sort: data.sort })
      .select("id")
      .single();
    if (error) return fromDb(error, DUPLICATE_CATEGORY);

    return ok({ id: row.id });
  });
}

export async function updateCategory(clubSlug: string, input: UpdateCategoryInput): Promise<ActionResult<null>> {
  return mutate("update-category", clubSlug, updateCategorySchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("categories")
      .update({ name: data.name, age_band: toAgeBand(data.age), sort: data.sort })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .select("id");
    if (error) return fromDb(error, DUPLICATE_CATEGORY);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

/** Borra una categoría que ningún equipo lleva; si alguno la lleva, `IN_USE`. */
export async function deleteCategory(clubSlug: string, input: CategoryIdInput): Promise<ActionResult<null>> {
  return mutate("delete-category", clubSlug, categoryIdSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("categories")
      .delete()
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .select("id");
    if (error) return error.code === FOREIGN_KEY_VIOLATION ? fail("IN_USE") : fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

// ── Equipos ─────────────────────────────────────────────────────────────────────────────

/**
 * Un equipo nuevo en una temporada. La temporada y la categoría tienen que ser de este club:
 * las claves compuestas rechazan las de otro, y eso es `NOT_FOUND`.
 */
export async function createTeam(
  clubSlug: string,
  input: CreateTeamInput,
): Promise<ActionResult<{ id: string }>> {
  return mutate("create-team", clubSlug, createTeamSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: row, error } = await db
      .from("teams")
      .insert({
        organization_id: ctx.org.id,
        season_id: data.seasonId,
        category_id: data.categoryId,
        name: data.name,
      })
      .select("id")
      .single();
    if (error) return error.code === FOREIGN_KEY_VIOLATION ? fail("NOT_FOUND") : fromDb(error, DUPLICATE_TEAM);

    return ok({ id: row.id });
  });
}

/** Cambia el nombre y la categoría de un equipo. Su temporada no se cambia. */
export async function updateTeam(clubSlug: string, input: UpdateTeamInput): Promise<ActionResult<null>> {
  return mutate("update-team", clubSlug, updateTeamSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("teams")
      .update({ name: data.name, category_id: data.categoryId })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .select("id");
    if (error) return error.code === FOREIGN_KEY_VIOLATION ? fail("NOT_FOUND") : fromDb(error, DUPLICATE_TEAM);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

/**
 * Borra un equipo con su cuerpo técnico y su plantilla (no las personas). Con actividad
 * (sesiones, partidos, objetivos o notas) es `IN_USE` y no se borra nada.
 */
export async function deleteTeam(clubSlug: string, input: TeamIdInput): Promise<ActionResult<null>> {
  return mutate("delete-team", clubSlug, teamIdSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: team, error: readError } = await db
      .from("teams")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .maybeSingle();
    if (readError) return fromDb(readError);
    if (!team) return fail("NOT_FOUND");

    const { error } = await db.rpc("delete_team", { p_team: data.id });
    if (error) return fromDb(error);

    return ok(null);
  });
}

// ── Cuerpo técnico ──────────────────────────────────────────────────────────────────────

/** Añade a una persona del club al cuerpo técnico de un equipo del club. */
export async function addStaff(clubSlug: string, input: StaffInput): Promise<ActionResult<null>> {
  return mutate("add-staff", clubSlug, staffSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { error } = await db.from("team_staff").insert({
      organization_id: ctx.org.id,
      team_id: data.teamId,
      person_id: data.personId,
      staff_role: data.role,
    });
    if (error) return error.code === FOREIGN_KEY_VIOLATION ? fail("NOT_FOUND") : fromDb(error, DUPLICATE_STAFF);

    return ok(null);
  });
}

export async function setStaffRole(clubSlug: string, input: StaffInput): Promise<ActionResult<null>> {
  return mutate("set-staff-role", clubSlug, staffSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("team_staff")
      .update({ staff_role: data.role })
      .eq("organization_id", ctx.org.id)
      .eq("team_id", data.teamId)
      .eq("person_id", data.personId)
      .select("person_id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

export async function removeStaff(clubSlug: string, input: SeatInput): Promise<ActionResult<null>> {
  return mutate("remove-staff", clubSlug, seatSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("team_staff")
      .delete()
      .eq("organization_id", ctx.org.id)
      .eq("team_id", data.teamId)
      .eq("person_id", data.personId)
      .select("person_id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

// ── Plantilla ───────────────────────────────────────────────────────────────────────────

/** Añade a una persona del club a la plantilla de un equipo del club. */
export async function addPlayer(clubSlug: string, input: PlayerInput): Promise<ActionResult<null>> {
  return mutate("add-player", clubSlug, playerSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { error } = await db.from("team_players").insert({
      organization_id: ctx.org.id,
      team_id: data.teamId,
      person_id: data.personId,
      jersey_number: data.jerseyNumber,
      position: data.position,
    });
    if (error) {
      return error.code === FOREIGN_KEY_VIOLATION ? fail("NOT_FOUND") : fromDb(error, playerConflict(error));
    }

    return ok(null);
  });
}

/**
 * Da de alta a una persona y la pone en la plantilla: las dos cosas o ninguna. De un menor
 * solo viaja el año de nacimiento.
 */
export async function addNewPlayer(
  clubSlug: string,
  input: NewPlayerInput,
): Promise<ActionResult<{ personId: string }>> {
  return mutate("add-new-player", clubSlug, newPlayerSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: team, error: readError } = await db
      .from("teams")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .eq("id", data.teamId)
      .maybeSingle();
    if (readError) return fromDb(readError);
    if (!team) return fail("NOT_FOUND");

    const { data: personId, error } = await db.rpc("add_new_player", {
      p_team: data.teamId,
      p_first_name: data.firstName,
      p_last_name: data.lastName,
      // Ausentes y no `null` (C15).
      ...(data.birthYear === null ? {} : { p_birth_year: data.birthYear }),
      ...(data.jerseyNumber === null ? {} : { p_jersey_number: data.jerseyNumber }),
      ...(data.position === null ? {} : { p_position: data.position }),
    });
    if (error) return fromDb(error, DUPLICATE_JERSEY);

    return ok({ personId });
  });
}

/** Cambia el dorsal y la posición de alguien de la plantilla. */
export async function updatePlayer(clubSlug: string, input: PlayerInput): Promise<ActionResult<null>> {
  return mutate("update-player", clubSlug, playerSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("team_players")
      .update({ jersey_number: data.jerseyNumber, position: data.position })
      .eq("organization_id", ctx.org.id)
      .eq("team_id", data.teamId)
      .eq("person_id", data.personId)
      .select("person_id");
    if (error) return fromDb(error, DUPLICATE_JERSEY);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

/** Quita a alguien de la plantilla. La persona sigue en el club. */
export async function removePlayer(clubSlug: string, input: SeatInput): Promise<ActionResult<null>> {
  return mutate("remove-player", clubSlug, seatSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("team_players")
      .delete()
      .eq("organization_id", ctx.org.id)
      .eq("team_id", data.teamId)
      .eq("person_id", data.personId)
      .select("person_id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

// ── Personas ────────────────────────────────────────────────────────────────────────────

export async function createPerson(
  clubSlug: string,
  input: CreatePersonInput,
): Promise<ActionResult<{ id: string }>> {
  return mutate("create-person", clubSlug, createPersonSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: row, error } = await db
      .from("people")
      .insert({
        organization_id: ctx.org.id,
        first_name: data.firstName,
        last_name: data.lastName,
        birth_year: data.birthYear,
      })
      .select("id")
      .single();
    if (error) return fromDb(error);

    return ok({ id: row.id });
  });
}

export async function updatePerson(clubSlug: string, input: UpdatePersonInput): Promise<ActionResult<null>> {
  return mutate("update-person", clubSlug, updatePersonSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("people")
      .update({ first_name: data.firstName, last_name: data.lastName, birth_year: data.birthYear })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

/**
 * Archiva a una persona (ya no está en el club: sale de la lista y de los buscadores) o la
 * recupera. Nada se borra. No se archiva a quien sigue en un equipo de la temporada actual o de
 * una que no ha acabado: seguiría saliendo en su plantilla sin poder elegirla en ningún sitio.
 *
 * La regla la garantiza la base (`people_guard_archive`, que da un `23514` sin campo); aquí se
 * comprueba antes para decir el motivo. Los días se comparan en UTC, como `current_date` allí.
 */
export async function setPersonArchived(
  clubSlug: string,
  input: SetPersonArchivedInput,
): Promise<ActionResult<null>> {
  return mutate("set-person-archived", clubSlug, setPersonArchivedSchema, input, async ({ db, ctx, data, fromDb }) => {
    if (data.archived) {
      const SEAT_COLUMNS = "team_id, teams(seasons(is_current, ends_on))";
      const [players, staff] = await Promise.all([
        db.from("team_players").select(SEAT_COLUMNS).eq("organization_id", ctx.org.id).eq("person_id", data.id),
        db.from("team_staff").select(SEAT_COLUMNS).eq("organization_id", ctx.org.id).eq("person_id", data.id),
      ]);
      if (players.error) return fromDb(players.error);
      if (staff.error) return fromDb(staff.error);

      const today = new Date().toISOString().slice(0, 10);
      const open = [...players.data, ...staff.data].some((seat) => {
        const team = Array.isArray(seat.teams) ? seat.teams[0] : seat.teams;
        const season = Array.isArray(team?.seasons) ? team.seasons[0] : team?.seasons;
        return season ? season.is_current || season.ends_on >= today : false;
      });
      if (open) return fail("INVALID", { archived: STILL_IN_TEAM });
    }

    const { data: rows, error } = await db
      .from("people")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}
