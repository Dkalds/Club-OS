"use server";

import { ok, type ActionResult } from "@/lib/action-result";
import { mutate } from "@/lib/mutate";
import { importPeopleSchema, type ImportPeopleInput } from "./schema";

// `importPeople` (`/admin/people`, Fase 7 Task 11): escribe solo las filas que dirección
// confirmó tras ver la vista previa (`parseCsv`, en el cliente, nunca toca la base). Un
// único insert de varias filas: todo o nada, la misma transacción.

export async function importPeople(
  clubSlug: string,
  input: ImportPeopleInput,
): Promise<ActionResult<{ count: number }>> {
  return mutate(
    { tag: "people-import.import", permission: "people.manage", routes: ["/c/[club]/admin"] },
    clubSlug,
    importPeopleSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const { data: rows, error } = await db
        .from("people")
        .insert(
          data.rows.map((row) => ({
            organization_id: ctx.org.id,
            first_name: row.firstName,
            last_name: row.lastName,
            birth_year: row.birthYear,
          })),
        )
        .select("id");
      if (error) return fromDb(error);

      return ok({ count: rows.length });
    },
  );
}
