"use server";

import type { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { Action } from "@/lib/permissions";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import {
  createGoalSchema,
  createNoteSchema,
  goalIdSchema,
  noteIdSchema,
  updateGoalSchema,
  updateNoteSchema,
  type CreateGoalInput,
  type CreateNoteInput,
  type GoalIdInput,
  type NoteIdInput,
  type UpdateGoalInput,
  type UpdateNoteInput,
} from "./schema";

// Acciones de objetivos y notas de un jugador. Siguen el orden de `mutate` (`@/lib/mutate`):
// Zod, el club y el permiso (`goal.manage`, `note.manage`; sin él, `NOT_FOUND` sin tocar la
// base), la escritura y `revalidatePath`. RLS decide de verdad quién escribe: el equipo del
// objetivo, y solo el autor de una nota.
//
// Todo va acotado al club de `clubSlug` (C25). Las altas leen antes al jugador en la plantilla
// del equipo filtrando por el club: sin esa lectura, quien gestiona equipos en dos clubes
// escribiría en el B desde la acción del A. Los cambios y los borrados filtran por el club en el
// propio `update`/`delete`, y si no tocan ninguna fila es `NOT_FOUND`.
//
// Ningún log lleva el texto de una nota o de un objetivo: `mutate` registra el error de la base,
// no la entrada.

/** Todo el grupo `(app)`: la ficha del jugador y la plantilla quedan viejas al escribir. */
const APP_ROUTE = "/c/[club]/(app)";

function mutate<D, T>(
  name: string,
  permission: Action,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runMutation(
    { tag: `development.${name}`, permission, routes: [APP_ROUTE] },
    clubSlug,
    schema,
    input,
    write,
  );
}

/** ¿Está `personId` en la plantilla de `teamId` de este club? Con la sesión de quien escribe. */
async function onRoster(
  { db, ctx, fromDb }: Pick<Write<unknown>, "db" | "ctx" | "fromDb">,
  teamId: string,
  personId: string,
): Promise<ActionResult<null>> {
  const { data, error } = await db
    .from("team_players")
    .select("person_id")
    .eq("organization_id", ctx.org.id)
    .eq("team_id", teamId)
    .eq("person_id", personId)
    .maybeSingle();
  if (error) return fromDb(error);
  return data ? ok(null) : fail("NOT_FOUND");
}

// ── Objetivos ────────────────────────────────────────────────────────────────────────

/** Un objetivo nuevo, activo. Con tres activos ya, `GOAL_LIMIT` (lo decide la base). */
export async function createGoal(
  clubSlug: string,
  input: CreateGoalInput,
): Promise<ActionResult<{ goalId: string }>> {
  return mutate("create-goal", "goal.manage", clubSlug, createGoalSchema, input, async (run) => {
    const { db, ctx, data, fromDb } = run;

    const roster = await onRoster(run, data.teamId, data.personId);
    if (!roster.ok) return roster;

    const { data: row, error } = await db
      .from("player_goals")
      .insert({
        organization_id: ctx.org.id,
        team_id: data.teamId,
        person_id: data.personId,
        title: data.title,
        description: data.description,
        focus_area_id: data.focusAreaId,
        standard_id: data.standardId,
      })
      .select("id")
      .single();
    if (error) return fromDb(error);

    return ok({ goalId: row.id });
  });
}

/** Cambia un objetivo activo. Uno logrado o archivado no se cambia: `NOT_FOUND`. */
export async function updateGoal(clubSlug: string, input: UpdateGoalInput): Promise<ActionResult<null>> {
  return mutate("update-goal", "goal.manage", clubSlug, updateGoalSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("player_goals")
      .update({
        title: data.title,
        description: data.description,
        focus_area_id: data.focusAreaId,
        standard_id: data.standardId,
      })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.goalId)
      .eq("status", "active")
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

function closeGoal(name: string, status: "achieved" | "archived") {
  return (clubSlug: string, input: GoalIdInput): Promise<ActionResult<null>> =>
    mutate(name, "goal.manage", clubSlug, goalIdSchema, input, async ({ db, ctx, data, fromDb }) => {
      const { data: rows, error } = await db
        .from("player_goals")
        .update({ status })
        .eq("organization_id", ctx.org.id)
        .eq("id", data.goalId)
        .eq("status", "active")
        .select("id");
      if (error) return fromDb(error);

      return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
    });
}

const achieve = closeGoal("achieve-goal", "achieved");
const archive = closeGoal("archive-goal", "archived");

/** Marca un objetivo activo como logrado; la fecha la pone la base. */
export async function achieveGoal(clubSlug: string, input: GoalIdInput): Promise<ActionResult<null>> {
  return achieve(clubSlug, input);
}

/** Archiva un objetivo activo. No se deshace; los objetivos no se borran. */
export async function archiveGoal(clubSlug: string, input: GoalIdInput): Promise<ActionResult<null>> {
  return archive(clubSlug, input);
}

// ── Notas ────────────────────────────────────────────────────────────────────────────

/** Una nota nueva sobre un jugador de la plantilla. Su autor es quien la escribe. */
export async function createNote(
  clubSlug: string,
  input: CreateNoteInput,
): Promise<ActionResult<{ noteId: string }>> {
  return mutate("create-note", "note.manage", clubSlug, createNoteSchema, input, async (run) => {
    const { db, ctx, data, fromDb } = run;

    const roster = await onRoster(run, data.teamId, data.personId);
    if (!roster.ok) return roster;

    const { data: row, error } = await db
      .from("coach_notes")
      .insert({
        organization_id: ctx.org.id,
        team_id: data.teamId,
        person_id: data.personId,
        body: data.body,
        visibility: data.visibility,
      })
      .select("id")
      .single();
    if (error) return fromDb(error);

    return ok({ noteId: row.id });
  });
}

/** Cambia una nota propia. Una ajena (o que no existe) es `NOT_FOUND`: RLS no la deja tocar. */
export async function updateNote(clubSlug: string, input: UpdateNoteInput): Promise<ActionResult<null>> {
  return mutate("update-note", "note.manage", clubSlug, updateNoteSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("coach_notes")
      .update({ body: data.body, visibility: data.visibility })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.noteId)
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

/** Borra de verdad una nota propia. */
export async function deleteNote(clubSlug: string, input: NoteIdInput): Promise<ActionResult<null>> {
  return mutate("delete-note", "note.manage", clubSlug, noteIdSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("coach_notes")
      .delete()
      .eq("organization_id", ctx.org.id)
      .eq("id", data.noteId)
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}
