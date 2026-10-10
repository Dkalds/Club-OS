"use server";

import type { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import {
  createGuardianshipSchema,
  createPersonSchema,
  personIdSchema,
  updatePersonSchema,
  type CreateGuardianshipInput,
  type CreatePersonInput,
  type PersonIdInput,
  type UpdatePersonInput,
} from "./schema";

// Acciones de personas (`/admin/people`, Fase 7 Task 11): alta, edición y archivado (nunca se
// borra), y dar una tutela. Van directas sobre la tabla (política y columnas de
// `20270112000700`); las tutelas, sobre la suya (Fase 7 Task 2, sin cambios).

function mutate<D, T>(
  name: string,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runMutation(
    { tag: `people.${name}`, permission: "people.manage", routes: ["/c/[club]/admin"] },
    clubSlug,
    schema,
    input,
    write,
  );
}

export async function createPerson(
  clubSlug: string,
  input: CreatePersonInput,
): Promise<ActionResult<{ personId: string }>> {
  return mutate("create", clubSlug, createPersonSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: row, error } = await db
      .from("people")
      .insert({ organization_id: ctx.org.id, first_name: data.firstName, last_name: data.lastName, birth_year: data.birthYear })
      .select("id")
      .single();
    if (error) return fromDb(error);

    return ok({ personId: row.id });
  });
}

export async function updatePerson(clubSlug: string, input: UpdatePersonInput): Promise<ActionResult<null>> {
  return mutate("update", clubSlug, updatePersonSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("people")
      .update({ first_name: data.firstName, last_name: data.lastName, birth_year: data.birthYear })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.personId)
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

/** Archiva una persona. No se deshace; sus notas, objetivos y partidos siguen enteros. */
export async function archivePerson(clubSlug: string, input: PersonIdInput): Promise<ActionResult<null>> {
  return mutate("archive", clubSlug, personIdSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { data: rows, error } = await db
      .from("people")
      .update({ archived_at: new Date().toISOString() })
      .eq("organization_id", ctx.org.id)
      .eq("id", data.personId)
      .is("archived_at", null)
      .select("id");
    if (error) return fromDb(error);

    return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
  });
}

/** Da una tutela: `guardianPersonId` pasa a poder decidir el consentimiento de imagen de `childPersonId`. */
export async function createGuardianship(
  clubSlug: string,
  input: CreateGuardianshipInput,
): Promise<ActionResult<null>> {
  return mutate("create-guardianship", clubSlug, createGuardianshipSchema, input, async ({ db, ctx, data, fromDb }) => {
    const { error } = await db.from("guardianships").insert({
      organization_id: ctx.org.id,
      guardian_person_id: data.guardianPersonId,
      child_person_id: data.childPersonId,
    });
    if (error) return fromDb(error, { field: "childPersonId", message: "Esa tutela ya existe." });

    return ok(null);
  });
}
