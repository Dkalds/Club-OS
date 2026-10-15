"use server";

import type { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { mutate as runMutation, type UniqueField, type Write } from "@/lib/mutate";
import {
  createTeamScheduleSchema,
  createVenueSchema,
  renameVenueSchema,
  scheduleIdSchema,
  updateTeamScheduleSchema,
  venueIdSchema,
  type CreateTeamScheduleInput,
  type CreateVenueInput,
  type RenameVenueInput,
  type ScheduleIdInput,
  type UpdateTeamScheduleInput,
  type VenueIdInput,
} from "./schema";

// Acciones del calendario de Gestión: las pistas del club y los horarios semanales de sus
// equipos. Solo la dirección las usa.
//
// Todas siguen el orden de `mutate` (`@/lib/mutate`): Zod sobre la entrada, el club y el permiso
// `club.manage` (sin permiso, `NOT_FOUND` sin tocar la base), la escritura y, si ha ido bien,
// `revalidatePath`.
//
// Las pistas se escriben por su tabla, acotadas al club de `clubSlug`. Los horarios, con tres
// funciones SQL que reciben solo un id y comprueban ellas que quien llama dirige ese club:
// antes se comprueba aquí que el equipo o el horario es de ESTE club (C25), para que quien
// dirige dos no escriba en el B llamando a la acción del A.

/** Gestión, y la app: un horario crea, mueve y borra entrenamientos de la Agenda de su equipo. */
const ROUTES = ["/c/[club]/admin", "/c/[club]/(app)"] as const;

/** Una clave foránea que impide borrar lo que se pide. */
const FOREIGN_KEY_VIOLATION = "23503";

const DUPLICATE_VENUE: UniqueField = { field: "name", message: "Ya hay una pista con ese nombre." };
const DUPLICATE_SLOT: UniqueField = { field: "time", message: "Ese equipo ya entrena ese día a esa hora." };

function mutate<D, T>(
  name: string,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runMutation(
    { tag: `calendar.${name}`, permission: "club.manage", routes: ROUTES },
    clubSlug,
    schema,
    input,
    write,
  );
}

// ── Pistas ──────────────────────────────────────────────────────────────────────────────

/** Una pista nueva. Los eventos del club cuyo lugar ya era ese nombre quedan vinculados a ella. */
export async function createVenue(clubSlug: string, input: CreateVenueInput): Promise<ActionResult<{ id: string }>> {
  return mutate("create-venue", clubSlug, createVenueSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: row, error } = await db
      .from("venues")
      .insert({ organization_id: ctx.org.id, name: data.name })
      .select("id")
      .single();
    if (error) return fromDb(error, DUPLICATE_VENUE);

    return ok({ id: row.id });
  });
}

/**
 * Cambia el nombre de una pista. Sus eventos programados que aún no han empezado pasan a
 * llamarla así; no cuenta como un cambio de lugar.
 */
export async function renameVenue(clubSlug: string, input: RenameVenueInput): Promise<ActionResult<null>> {
  return mutate("rename-venue", clubSlug, renameVenueSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("venues")
      .update({ name: data.name })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .select("id");
    if (error) return fromDb(error, DUPLICATE_VENUE);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

/**
 * Borra una pista que ningún horario usa; si alguno la usa, `IN_USE`. Los eventos que se
 * jugaron o se van a jugar en ella conservan su lugar como texto.
 */
export async function deleteVenue(clubSlug: string, input: VenueIdInput): Promise<ActionResult<null>> {
  return mutate("delete-venue", clubSlug, venueIdSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("venues")
      .delete()
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .select("id");
    if (error) return error.code === FOREIGN_KEY_VIOLATION ? fail("IN_USE") : fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

// ── Horarios semanales ──────────────────────────────────────────────────────────────────

/**
 * Un horario nuevo para un equipo del club, y sus entrenamientos hasta el final de la
 * temporada. Devuelve cuántos ha creado. La hora es la del reloj del club.
 */
export async function createTeamSchedule(
  clubSlug: string,
  input: CreateTeamScheduleInput,
): Promise<ActionResult<{ id: string; created: number }>> {
  return mutate("create-team-schedule", clubSlug, createTeamScheduleSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: team, error: readError } = await db
      .from("teams")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .eq("id", data.teamId)
      .maybeSingle();
    if (readError) return fromDb(readError);
    if (!team) return fail("NOT_FOUND");

    const { data: result, error } = await db.rpc("create_team_schedule", {
      p_team: data.teamId,
      p_weekday: data.weekday,
      p_start_time: data.time,
      p_duration_minutes: data.durationMinutes,
      // Ausente y no `null` (C15). Que la pista sea de este club lo comprueba la función.
      ...(data.venueId ? { p_venue: data.venueId } : {}),
    });
    if (error) return fromDb(error, DUPLICATE_SLOT);

    const { id, created } = result as { id: string; created: number };
    return ok({ id, created });
  });
}

/**
 * Cambia un horario y mueve con él sus entrenamientos futuros que siguen en su sitio. Devuelve
 * cuántos ha movido: cada uno queda registrado como un cambio para su equipo.
 */
export async function updateTeamSchedule(
  clubSlug: string,
  input: UpdateTeamScheduleInput,
): Promise<ActionResult<{ moved: number }>> {
  return mutate("update-team-schedule", clubSlug, updateTeamScheduleSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: schedule, error: readError } = await db
      .from("team_schedules")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .maybeSingle();
    if (readError) return fromDb(readError);
    if (!schedule) return fail("NOT_FOUND");

    const { data: moved, error } = await db.rpc("update_team_schedule", {
      p_schedule: data.id,
      p_weekday: data.weekday,
      p_start_time: data.time,
      p_duration_minutes: data.durationMinutes,
      ...(data.venueId ? { p_venue: data.venueId } : {}),
    });
    if (error) return fromDb(error, DUPLICATE_SLOT);

    return ok({ moved });
  });
}

/**
 * Quita un horario. Sus entrenamientos futuros que nadie ha tocado se borran; los demás se
 * quedan como sesiones sueltas. Devuelve cuántos ha borrado.
 */
export async function deleteTeamSchedule(
  clubSlug: string,
  input: ScheduleIdInput,
): Promise<ActionResult<{ removed: number }>> {
  return mutate("delete-team-schedule", clubSlug, scheduleIdSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: schedule, error: readError } = await db
      .from("team_schedules")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .eq("id", data.id)
      .maybeSingle();
    if (readError) return fromDb(readError);
    if (!schedule) return fail("NOT_FOUND");

    const { data: removed, error } = await db.rpc("delete_team_schedule", { p_schedule: data.id });
    if (error) return fromDb(error);

    return ok({ removed });
  });
}
