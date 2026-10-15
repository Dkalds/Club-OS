"use server";

import type { z } from "zod";
import { ok, type ActionResult } from "@/lib/action-result";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import { createGuardianshipSchema, type CreateGuardianshipInput } from "./schema";

// Tutelas (`/admin/people`, Fase 7 Task 11): dar una. Las personas en sí (alta, edición,
// archivado) son de `@/modules/structure`. Va directa sobre la tabla `guardianships`.

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
