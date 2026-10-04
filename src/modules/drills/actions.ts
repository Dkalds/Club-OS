"use server";

import type { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { Json } from "@/lib/database.types";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import type { Action } from "@/lib/permissions";
import {
  drillIdSchema,
  drillInputSchema,
  updateDrillSchema,
  type DrillIdInput,
  type DrillInput,
  type UpdateDrillInput,
} from "./schema";
import type { DrillStatus } from "./types";

// Acciones de la biblioteca de ejercicios: crear, guardar, publicar y archivar.
//
// Todas siguen el orden de `mutate` (`@/lib/mutate`): Zod sobre la entrada, el club y el
// permiso (sin permiso, `NOT_FOUND` sin tocar la base de datos), la escritura y, si ha ido
// bien, `revalidatePath`. Crear y guardar piden `drill.create` (la dirección y el
// entrenador); publicar y archivar piden `drill.publish` (la dirección). `can` solo evita
// llegar hasta la base de datos: quién escribe qué ejercicio lo decide RLS, y un entrenador
// solo guarda sus borradores.
//
// Los ejercicios no se borran: archivar es pasar a `archived`, y no hay acción de borrado.
// Crear y guardar escriben por `save_drill`, que reemplaza en una sola transacción el
// ejercicio y todos sus hijos; no hay ningún insert ni update directo de sus tablas. El club
// sale siempre de la sesión (`ctx`), nunca de la entrada.

// Rutas que se revalidan tras escribir: patrones de ruta, no URLs (el porqué está en
// `MutateConfig.routes`, de `@/lib/mutate`). La biblioteca y las fichas cuelgan de `drills`;
// The Way también, porque cada principio enseña los ejercicios que lo trabajan.
//
// Siguen las carpetas de `src/app/c/[club]/(app)/`. Si se renombran o se mueven, se cambian
// aquí (y en `methodology/actions.ts`, que también revalida The Way).
/** La biblioteca, las fichas y los formularios de ejercicios. */
const DRILLS_ROUTE = "/c/[club]/(app)/drills";
/** The Way: el índice, cada sección y la página de los Standards. */
const WAY_ROUTE = "/c/[club]/(app)/way";

/**
 * El esqueleto de `@/lib/mutate` con lo de esta área: la etiqueta `drills.<acción>` del log, el
 * permiso de cada acción y las rutas de la biblioteca y de The Way.
 */
function mutate<D, T>(
  name: string,
  permission: Action,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runMutation(
    { tag: `drills.${name}`, permission, routes: [DRILLS_ROUTE, WAY_ROUTE] },
    clubSlug,
    schema,
    input,
    write,
  );
}

/**
 * El payload de `save_drill`: las claves en snake_case de la función. El diagrama viaja
 * siempre: al guardar, un `diagram_media_id` ausente o nulo lo quitaría (al crear lo ignora).
 * No lleva estado ni autor: la función no los lee, publicar es de la dirección y el autor no
 * cambia.
 */
function toSavePayload(drill: DrillInput): Json {
  return {
    title: drill.title,
    summary: drill.summary,
    objective: drill.objective,
    setup_md: drill.setupMd,
    min_players: drill.minPlayers,
    max_players: drill.maxPlayers,
    min_minutes: drill.minMinutes,
    max_minutes: drill.maxMinutes,
    min_age: drill.minAge,
    max_age: drill.maxAge,
    equipment: drill.equipment,
    video_url: drill.videoUrl,
    diagram_media_id: drill.diagramMediaId,
    focus_area_ids: drill.focusAreaIds,
    principle_ids: drill.principleIds,
    standard_ids: drill.standardIds,
    coaching_points: drill.coachingPoints.map((point) => ({ text: point.text, is_key: point.isKey })),
    variants: drill.variants.map((variant) => ({
      title: variant.title,
      description: variant.description,
    })),
  };
}

/**
 * La fila que devuelve `save_drill`. La función devuelve un conjunto, que por PostgREST llega
 * como lista, y siempre de una fila; si no llega, algo va mal en el esquema: lanza, y `mutate`
 * lo registra y responde `SAVE_FAILED`, en vez de devolver un id que no existe.
 */
function onlyRow<T>(rows: T[]): T {
  const row = rows.at(0);
  if (row === undefined) throw new Error("save_drill no devolvió ninguna fila");
  return row;
}

/**
 * Un ejercicio nuevo: siempre un borrador, a nombre de quien lo crea, sin diagrama (el
 * diagrama vive en la carpeta del ejercicio, que no existe hasta que existe su id: se sube
 * después y se guarda con `updateDrill`). Llama a `save_drill` sin `p_drill`: omitirlo es lo
 * que la hace crear.
 */
export async function createDrill(
  clubSlug: string,
  input: DrillInput,
): Promise<ActionResult<{ id: string }>> {
  return mutate(
    "create-drill",
    "drill.create",
    clubSlug,
    drillInputSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const { data: rows, error } = await db.rpc("save_drill", {
        p_org: ctx.org.id,
        p_payload: toSavePayload(data),
      });
      if (error) return fromDb(error);

      return ok({ id: onlyRow(rows).id });
    },
  );
}

/**
 * Guarda un ejercicio con todos sus hijos. Si `expectedUpdatedAt` ya no es el de la fila,
 * alguien guardó antes: `STALE_COPY`. Devuelve el `updated_at` nuevo tal cual lo da la
 * función (con microsegundos), que es la copia de quien siga editando. Manda siempre
 * `p_drill` y la copia esperada (el esquema los exige): omitir `p_drill` crearía un borrador
 * nuevo en vez de guardar éste.
 */
export async function updateDrill(
  clubSlug: string,
  input: UpdateDrillInput,
): Promise<ActionResult<{ updatedAt: string }>> {
  return mutate(
    "update-drill",
    "drill.create",
    clubSlug,
    updateDrillSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const { drillId, expectedUpdatedAt, ...drill } = data;

      const { data: rows, error } = await db.rpc("save_drill", {
        p_org: ctx.org.id,
        p_drill: drillId,
        p_expected_updated_at: expectedUpdatedAt,
        p_payload: toSavePayload(drill),
      });
      if (error) return fromDb(error);

      return ok({ updatedAt: onlyRow(rows).updated_at });
    },
  );
}

/**
 * Pasa un ejercicio de este club a `status`, y solo eso. Si no existe, es de otro club o RLS
 * no deja a esta persona cambiarlo, no toca nada: 0 filas, `NOT_FOUND`.
 */
function setStatus(
  name: string,
  status: DrillStatus,
  clubSlug: string,
  input: DrillIdInput,
): Promise<ActionResult<null>> {
  return mutate(
    name,
    "drill.publish",
    clubSlug,
    drillIdSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const { data: rows, error } = await db
        .from("drills")
        .update({ status })
        .eq("organization_id", ctx.org.id)
        .eq("id", data.drillId)
        .select("id");
      if (error) return fromDb(error);

      return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
    },
  );
}

/** Publica un ejercicio (un borrador, o un archivado que vuelve): lo ve todo el cuerpo técnico. */
export async function publishDrill(
  clubSlug: string,
  input: DrillIdInput,
): Promise<ActionResult<null>> {
  return setStatus("publish-drill", "published", clubSlug, input);
}

/**
 * Archiva un ejercicio: sale de la búsqueda, pero su ficha y su enlace en las sesiones que ya
 * lo usan siguen ahí.
 */
export async function archiveDrill(
  clubSlug: string,
  input: DrillIdInput,
): Promise<ActionResult<null>> {
  return setStatus("archive-drill", "archived", clubSlug, input);
}
