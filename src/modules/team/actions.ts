"use server";

import type { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import {
  createCategorySchema,
  createSeasonSchema,
  createTeamSchema,
  updateCategorySchema,
  updateSeasonSchema,
  updateTeamSchema,
  type CreateCategoryInput,
  type CreateSeasonInput,
  type CreateTeamInput,
  type UpdateCategoryInput,
  type UpdateSeasonInput,
  type UpdateTeamInput,
} from "./schema";

// Acciones de Gestión de equipos (`/admin/teams`, Fase 7 Task 10): temporadas, categorías y
// equipos. Alta y edición directas sobre la tabla (política y columnas de
// `20270112000500`); ninguna se borra. Como mucho una temporada actual por club (único
// parcial de la tabla): marcar una segunda, 23505 → INVALID en `isCurrent`.

const IS_CURRENT_UNIQUE = { field: "isCurrent", message: "Ya hay otra temporada marcada como actual." };

function mutate<D, T>(
  name: string,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runMutation(
    { tag: `team.${name}`, permission: "team.manage", routes: ["/c/[club]/admin"] },
    clubSlug,
    schema,
    input,
    write,
  );
}

// ── Temporadas ───────────────────────────────────────────────────────────────────────

export async function createSeason(
  clubSlug: string,
  input: CreateSeasonInput,
): Promise<ActionResult<{ seasonId: string }>> {
  return mutate("create-season", clubSlug, createSeasonSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: row, error } = await db
      .from("seasons")
      .insert({
        organization_id: ctx.org.id,
        name: data.name,
        starts_on: data.startsOn,
        ends_on: data.endsOn,
        is_current: data.isCurrent,
      })
      .select("id")
      .single();
    if (error) return fromDb(error, IS_CURRENT_UNIQUE);

    return ok({ seasonId: row.id });
  });
}

export async function updateSeason(clubSlug: string, input: UpdateSeasonInput): Promise<ActionResult<null>> {
  return mutate("update-season", clubSlug, updateSeasonSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("seasons")
      .update({ name: data.name, starts_on: data.startsOn, ends_on: data.endsOn, is_current: data.isCurrent })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.seasonId)
      .select("id");
    if (error) return fromDb(error, IS_CURRENT_UNIQUE);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

// ── Categorías ───────────────────────────────────────────────────────────────────────

export async function createCategory(
  clubSlug: string,
  input: CreateCategoryInput,
): Promise<ActionResult<{ categoryId: string }>> {
  return mutate("create-category", clubSlug, createCategorySchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: row, error } = await db
      .from("categories")
      .insert({ organization_id: ctx.org.id, name: data.name, age_band: data.ageBand, sort: data.sort })
      .select("id")
      .single();
    if (error) return fromDb(error);

    return ok({ categoryId: row.id });
  });
}

export async function updateCategory(clubSlug: string, input: UpdateCategoryInput): Promise<ActionResult<null>> {
  return mutate("update-category", clubSlug, updateCategorySchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("categories")
      .update({ name: data.name, age_band: data.ageBand, sort: data.sort })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.categoryId)
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

// ── Equipos ──────────────────────────────────────────────────────────────────────────

export async function createTeam(
  clubSlug: string,
  input: CreateTeamInput,
): Promise<ActionResult<{ teamId: string }>> {
  return mutate("create-team", clubSlug, createTeamSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: row, error } = await db
      .from("teams")
      .insert({ organization_id: ctx.org.id, season_id: data.seasonId, category_id: data.categoryId, name: data.name })
      .select("id")
      .single();
    if (error) return fromDb(error);

    return ok({ teamId: row.id });
  });
}

export async function updateTeam(clubSlug: string, input: UpdateTeamInput): Promise<ActionResult<null>> {
  return mutate("update-team", clubSlug, updateTeamSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("teams")
      .update({ season_id: data.seasonId, category_id: data.categoryId, name: data.name })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.teamId)
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}
