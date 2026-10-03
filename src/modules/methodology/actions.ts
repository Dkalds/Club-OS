"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { fail, fromDbError, fromZodError, ok, type ActionResult } from "@/lib/action-result";
import type { Database } from "@/lib/database.types";
import { requireClub } from "@/lib/guards";
import { logError } from "@/lib/log";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ClubContext } from "@/modules/tenancy/queries";
import { moveId } from "./order";
import {
  createPrincipleSchema,
  createStandardSchema,
  createValueSchema,
  createWaySectionSchema,
  moveMethodologyItemSchema,
  savePrincipleSchema,
  setMethodologyStatusSchema,
  updateStandardSchema,
  updateValueSchema,
  updateWaySectionSchema,
  type CreatePrincipleInput,
  type CreateStandardInput,
  type CreateValueInput,
  type CreateWaySectionInput,
  type MoveMethodologyItemInput,
  type SavePrincipleInput,
  type SetMethodologyStatusInput,
  type UpdateStandardInput,
  type UpdateValueInput,
  type UpdateWaySectionInput,
} from "./schema";
import { slugify, uniqueSlug } from "./slug";

// Acciones de Gestión de la metodología: solo administración las usa.
//
// Todas siguen el mismo orden (ver `mutate`): Zod sobre la entrada, el club y el permiso
// `way.manage` (sin permiso, `NOT_FOUND` sin tocar la base de datos), la escritura y, si ha
// ido bien, `revalidatePath`. RLS decide de verdad quién escribe; `can` solo evita llegar
// hasta ella.
//
// Todo va acotado al club de `clubSlug`: los insert llevan su `organization_id`, los update y
// los select lo filtran, y las dos acciones que escriben por RPC con solo un id
// (`updateWaySection`, `savePrinciple`) comprueban antes que la fila es del club. Lo que no se
// borra nunca (archivar es pasar a borrador) no tiene acción de borrado, y los puntos de un
// principio los reemplaza `save_game_principle`.

type Db = SupabaseClient<Database>;
type DbError = { code?: string; message?: string };
type UniqueField = { field: string; message: string };

/** Lo que recibe la escritura de cada acción, ya validado y autorizado. */
type Write<D> = {
  db: Db;
  ctx: ClubContext;
  data: D;
  /**
   * Traduce un error de la base de datos con `fromDbError`, el único traductor, y registra
   * los inesperados: un `SAVE_FAILED`, y un `42501`, que tras pasar `can` solo puede ser un
   * permiso de esquema roto. Lo esperado (copia obsoleta, número repetido, entrada
   * rechazada) no deja rastro.
   */
  fromDb: (error: DbError, unique?: UniqueField) => ActionResult<never>;
};

/**
 * El esqueleto común: valida, autoriza, escribe y revalida. Cada acción aporta su escritura.
 *
 * Una escritura que lanza (el cliente no se puede crear, la red cae) se registra y vuelve
 * como `SAVE_FAILED`: una acción siempre devuelve un `ActionResult`.
 */
async function mutate<D, T>(
  name: string,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const tag = `methodology.${name}`;

  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  // Fuera de todo try/catch: `notFound()` funciona lanzando, y un catch se tragaría el 404.
  const ctx = await requireClub(clubSlug);
  if (!can(ctx, "way.manage")) return fail("NOT_FOUND");

  const fromDb = (error: DbError, unique?: UniqueField): ActionResult<never> => {
    const result = fromDbError(error, unique);
    if (error.code === "42501" || (!result.ok && result.error === "SAVE_FAILED")) {
      logError(tag, error);
    }
    return result;
  };

  let result: ActionResult<T>;
  try {
    result = await write({ db: await createClient(), ctx, data: parsed.data, fromDb });
  } catch (error) {
    logError(tag, error);
    return fail("SAVE_FAILED");
  }

  if (result.ok) {
    // `layout`: cuelga de `/way` cada sección y la página de los Standards, y de `/admin`
    // cada lista de Gestión; todas pintan estos datos.
    revalidatePath(`/c/${ctx.org.slug}/way`, "layout");
    revalidatePath(`/c/${ctx.org.slug}/admin`, "layout");
  }
  return result;
}

/** El siguiente puesto de una lista: uno más que el mayor que ya hay (1 si está vacía). */
function nextPosition(current: number[]): number {
  return Math.max(0, ...current) + 1;
}

/**
 * La fila `id` de `table` si es de este club; `data: null` si no existe o es de otro. Las
 * funciones SQL que escriben por `p_id` no reciben el club: sin esta comprobación previa,
 * quien administra dos clubes escribiría en una fila del B llamando a la acción del A.
 */
function findInClub(
  db: Db,
  table: "way_sections" | "game_principles",
  ctx: ClubContext,
  id: string,
) {
  return db.from(table).select("id").eq("organization_id", ctx.org.id).eq("id", id).maybeSingle();
}

const DUPLICATE_STANDARD: UniqueField = {
  field: "number",
  message: "Ya existe un Standard con ese número.",
};

// ── Secciones de The Way ────────────────────────────────────────────────────────────────

/**
 * Una sección nueva, en borrador y al final: su número es el siguiente al mayor del club y
 * su slug sale del título (`seccion` si no tiene letras), sin chocar con ninguno del club.
 * Leer y escribir no son atómicos: dos altas simultáneas pueden repetir número; el slug sí
 * lo guarda el único de la tabla.
 */
export async function createWaySection(
  clubSlug: string,
  input: CreateWaySectionInput,
): Promise<ActionResult<{ id: string }>> {
  return mutate(
    "create-way-section",
    clubSlug,
    createWaySectionSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const existing = await db
        .from("way_sections")
        .select("number, sort, slug")
        .eq("organization_id", ctx.org.id);
      if (existing.error) return fromDb(existing.error);

      const { data: created, error } = await db
        .from("way_sections")
        .insert({
          organization_id: ctx.org.id,
          number: nextPosition(existing.data.map((row) => row.number)),
          sort: nextPosition(existing.data.map((row) => row.sort)),
          slug: uniqueSlug(
            slugify(data.title),
            existing.data.map((row) => row.slug),
            "seccion",
          ),
          title: data.title,
          content_kind: data.contentKind,
          status: "draft",
        })
        .select("id")
        .single();
      if (error) return fromDb(error);

      return ok({ id: created.id });
    },
  );
}

/**
 * Guarda el contenido de una sección con `update_way_section`, la única que cambia su
 * `updated_at`. Antes comprueba que la sección es de este club: si no, `NOT_FOUND` sin llamar
 * a la función. Si `expectedUpdatedAt` ya no es el de la fila, alguien guardó antes:
 * `STALE_COPY`. Devuelve el `updated_at` nuevo tal cual lo da la función (con microsegundos),
 * que es la copia de quien siga editando. El slug no cambia nunca.
 */
export async function updateWaySection(
  clubSlug: string,
  input: UpdateWaySectionInput,
): Promise<ActionResult<{ updatedAt: string }>> {
  return mutate(
    "update-way-section",
    clubSlug,
    updateWaySectionSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const section = await findInClub(db, "way_sections", ctx, data.id);
      if (section.error) return fromDb(section.error);
      if (!section.data) return fail("NOT_FOUND");

      const { data: updatedAt, error } = await db.rpc("update_way_section", {
        p_id: data.id,
        p_expected_updated_at: data.expectedUpdatedAt,
        p_title: data.title,
        // La columna y la función admiten null, pero Supabase no genera argumentos
        // anulables: el tipo dice `string`. Se envía el null, no un texto vacío.
        p_summary: data.summary as string,
        p_content_kind: data.contentKind,
        p_body_md: data.bodyMd,
      });
      if (error) return fromDb(error);

      return ok({ updatedAt });
    },
  );
}

// ── Estado y orden (las cuatro listas) ──────────────────────────────────────────────────

/**
 * Publica o pasa a borrador (archivar). Solo cambia `status`, y solo si la fila es de este
 * club: si no existe o es de otro, no toca nada y es `NOT_FOUND`. No cambia `updated_at`.
 */
export async function setMethodologyStatus(
  clubSlug: string,
  input: SetMethodologyStatusInput,
): Promise<ActionResult<null>> {
  return mutate(
    "set-methodology-status",
    clubSlug,
    setMethodologyStatusSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      // `data.kind` ya pasó por el enum de Zod: solo puede ser una de las cuatro tablas.
      const { data: rows, error } = await db
        .from(data.kind)
        .update({ status: data.status })
        .eq("organization_id", ctx.org.id)
        .eq("id", data.id)
        .select("id");
      if (error) return fromDb(error);

      return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
    },
  );
}

/**
 * Sube o baja un puesto un elemento de su lista. Lee los ids del club en el orden de las
 * consultas de lectura (`sort`, `created_at`, `id`) y manda la lista completa a
 * `reorder_methodology`, que la renumera de golpe y responde `STALE_COPY` si alguien añadió
 * algo mientras tanto. En el extremo no hay nada que mover y no se llama.
 */
export async function moveMethodologyItem(
  clubSlug: string,
  input: MoveMethodologyItemInput,
): Promise<ActionResult<null>> {
  return mutate(
    "move-methodology-item",
    clubSlug,
    moveMethodologyItemSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const { data: rows, error } = await db
        .from(data.kind)
        .select("id")
        .eq("organization_id", ctx.org.id)
        .order("sort", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) return fromDb(error);

      const current = rows.map((row) => row.id);
      // Nada se borra: un id que no está entre los del club es de otro club o inventado.
      if (!current.includes(data.id)) return fail("NOT_FOUND");

      const moved = moveId(current, data.id, data.direction);
      if (moved.every((rowId, index) => rowId === current[index])) return ok(null);

      const { error: reorderError } = await db.rpc("reorder_methodology", {
        p_org: ctx.org.id,
        p_kind: data.kind,
        p_ids: moved,
      });
      if (reorderError) return fromDb(reorderError);

      return ok(null);
    },
  );
}

// ── Valores ─────────────────────────────────────────────────────────────────────────────

/** Un valor nuevo, en borrador y al final de la lista del club. */
export async function createValue(
  clubSlug: string,
  input: CreateValueInput,
): Promise<ActionResult<{ id: string }>> {
  return mutate(
    "create-value",
    clubSlug,
    createValueSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const existing = await db
        .from("club_values")
        .select("sort")
        .eq("organization_id", ctx.org.id);
      if (existing.error) return fromDb(existing.error);

      const { data: created, error } = await db
        .from("club_values")
        .insert({
          organization_id: ctx.org.id,
          code: data.code,
          title: data.title,
          description: data.description,
          status: "draft",
          sort: nextPosition(existing.data.map((row) => row.sort)),
        })
        .select("id")
        .single();
      if (error) return fromDb(error);

      return ok({ id: created.id });
    },
  );
}

/** Cambia un valor de este club: si no existe o es de otro, no toca nada y es `NOT_FOUND`. */
export async function updateValue(
  clubSlug: string,
  input: UpdateValueInput,
): Promise<ActionResult<null>> {
  return mutate(
    "update-value",
    clubSlug,
    updateValueSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const { data: rows, error } = await db
        .from("club_values")
        .update({ code: data.code, title: data.title, description: data.description })
        .eq("organization_id", ctx.org.id)
        .eq("id", data.id)
        .select("id");
      if (error) return fromDb(error);

      return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
    },
  );
}

// ── Principios ──────────────────────────────────────────────────────────────────────────

/**
 * Un principio nuevo, en borrador y al final, sin puntos (se añaden al guardarlo). Su slug
 * sale del título (`principio` si no tiene letras) y no cambia nunca.
 */
export async function createPrinciple(
  clubSlug: string,
  input: CreatePrincipleInput,
): Promise<ActionResult<{ id: string }>> {
  return mutate(
    "create-principle",
    clubSlug,
    createPrincipleSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const existing = await db
        .from("game_principles")
        .select("sort, slug")
        .eq("organization_id", ctx.org.id);
      if (existing.error) return fromDb(existing.error);

      const { data: created, error } = await db
        .from("game_principles")
        .insert({
          organization_id: ctx.org.id,
          slug: uniqueSlug(
            slugify(data.title),
            existing.data.map((row) => row.slug),
            "principio",
          ),
          title: data.title,
          summary: data.summary,
          status: "draft",
          sort: nextPosition(existing.data.map((row) => row.sort)),
        })
        .select("id")
        .single();
      if (error) return fromDb(error);

      return ok({ id: created.id });
    },
  );
}

/**
 * Guarda un principio con `save_game_principle`: cambia título y resumen y reemplaza todos
 * sus puntos por `points`, ya sin los vacíos, en una sola transacción. Antes comprueba que el
 * principio es de este club: si no, `NOT_FOUND` sin llamar a la función.
 */
export async function savePrinciple(
  clubSlug: string,
  input: SavePrincipleInput,
): Promise<ActionResult<null>> {
  return mutate(
    "save-principle",
    clubSlug,
    savePrincipleSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const principle = await findInClub(db, "game_principles", ctx, data.id);
      if (principle.error) return fromDb(principle.error);
      if (!principle.data) return fail("NOT_FOUND");

      const { error } = await db.rpc("save_game_principle", {
        p_id: data.id,
        p_title: data.title,
        // Igual que en `updateWaySection`: el argumento admite null aunque el tipo no lo diga.
        p_summary: data.summary as string,
        p_points: data.points,
      });
      if (error) return fromDb(error);

      return ok(null);
    },
  );
}

// ── Standards ───────────────────────────────────────────────────────────────────────────

/** Un Standard nuevo, en borrador y al final. El número lo elige la dirección: único por club. */
export async function createStandard(
  clubSlug: string,
  input: CreateStandardInput,
): Promise<ActionResult<{ id: string }>> {
  return mutate(
    "create-standard",
    clubSlug,
    createStandardSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const existing = await db.from("standards").select("sort").eq("organization_id", ctx.org.id);
      if (existing.error) return fromDb(existing.error);

      const { data: created, error } = await db
        .from("standards")
        .insert({
          organization_id: ctx.org.id,
          number: data.number,
          title: data.title,
          description: data.description,
          status: "draft",
          sort: nextPosition(existing.data.map((row) => row.sort)),
        })
        .select("id")
        .single();
      if (error) return fromDb(error, DUPLICATE_STANDARD);

      return ok({ id: created.id });
    },
  );
}

/**
 * Cambia un Standard de este club, número incluido (que sigue siendo único por club). Si no
 * existe o es de otro club, no toca nada y es `NOT_FOUND`.
 */
export async function updateStandard(
  clubSlug: string,
  input: UpdateStandardInput,
): Promise<ActionResult<null>> {
  return mutate(
    "update-standard",
    clubSlug,
    updateStandardSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const { data: rows, error } = await db
        .from("standards")
        .update({ number: data.number, title: data.title, description: data.description })
        .eq("organization_id", ctx.org.id)
        .eq("id", data.id)
        .select("id");
      if (error) return fromDb(error, DUPLICATE_STANDARD);

      return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
    },
  );
}
