"use server";

import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { Json } from "@/lib/database.types";
import { logError } from "@/lib/log";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import type { Action } from "@/lib/permissions";
import { WAY_ROUTE } from "@/lib/routes";
import { DIAGRAM_ERROR, DIAGRAM_MIME, sniffImageType } from "@/modules/media/diagram-file";
import { MEDIA_BUCKET, mediaPath, signedUrl } from "@/modules/media/storage";
import {
  diagramUploadSchema,
  drillIdSchema,
  drillInputSchema,
  updateDrillSchema,
  type DrillIdInput,
  type DrillInput,
  type UpdateDrillInput,
} from "./schema";
import type { DrillStatus } from "./types";

// Acciones de la biblioteca de ejercicios: crear, guardar, publicar, archivar y subir el
// diagrama de un ejercicio.
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
//
// Subir el diagrama (`uploadDrillDiagram`) escribe en otro sitio: no en `drills` sino en
// Storage y en `media_assets`. El ejercicio apunta al diagrama nuevo cuando se guarda con
// `updateDrill`.

// Rutas que se revalidan tras escribir: patrones de ruta, no URLs (el porqué está en
// `MutateConfig.routes`, de `@/lib/mutate`). La biblioteca y las fichas cuelgan de `drills`;
// The Way también (`WAY_ROUTE`, de `@/lib/routes`), porque cada principio enseña los
// ejercicios que lo trabajan.
//
// Siguen las carpetas de `src/app/c/[club]/(app)/`. Si se renombran o se mueven, se cambian
// aquí y en `@/lib/routes`.
/** La biblioteca, las fichas y los formularios de ejercicios. */
const DRILLS_ROUTE = "/c/[club]/(app)/drills";

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

// ── El diagrama ──────────────────────────────────────────────────────────────────────────

// Los errores de Storage que significan algo para la acción. El `status` HTTP de todos es 400 y
// no distingue nada; lo que los distingue es `statusCode` (una cadena, `"403"`) y `code`
// (`"AccessDenied"`), que se miran los dos por si el servidor omite uno. Observado contra
// Storage local: la política de `storage.objects` niega con 403 AccessDenied; el bucket rechaza
// un tipo que no admite con 415 InvalidMimeType y un fichero de más de 2 MiB con 413
// EntityTooLarge.
const STORAGE_DENIED = new Set(["403", "AccessDenied"]);
const STORAGE_REJECTED = new Set(["413", "415", "EntityTooLarge", "InvalidMimeType"]);

/**
 * Traduce un error de Storage al subir. Sin permiso es `NOT_FOUND`, el mismo 404 opaco de
 * siempre, y no deja rastro: es la respuesta normal de una política (otro entrenador, un
 * ejercicio publicado que solo edita la dirección). Que el bucket rechace el fichero, en cambio,
 * no debería pasar: la acción ya comprobó tipo y tamaño con las mismas cifras que el bucket, así
 * que si pasa es que han dejado de coincidir. A la persona se le dice lo mismo que con cualquier
 * otro fichero que no vale, y se registra. Todo lo demás es `SAVE_FAILED`, registrado.
 */
function fromStorageError(error: object): ActionResult<never> {
  const { statusCode, code } = error as { statusCode?: unknown; code?: unknown };
  const codes = [statusCode, code].filter((value): value is string => typeof value === "string");

  if (codes.some((value) => STORAGE_DENIED.has(value))) return fail("NOT_FOUND");

  logError("drills.upload-diagram", error);
  if (codes.some((value) => STORAGE_REJECTED.has(value))) return fail("INVALID", { diagram: DIAGRAM_ERROR });
  return fail("SAVE_FAILED");
}

/**
 * Borra un objeto que se subió y se quedó sin ficha. Es limpieza, no parte del resultado: si
 * falla, se registra y la acción devuelve el motivo del fallo original, no éste.
 */
async function discardUpload(db: Write<unknown>["db"], path: string): Promise<void> {
  try {
    const { error } = await db.storage.from(MEDIA_BUCKET).remove([path]);
    if (error) logError("drills.upload-diagram.cleanup", error);
  } catch (error) {
    logError("drills.upload-diagram.cleanup", error);
  }
}

/**
 * La URL de vista previa de un objeto recién subido, o `null` si no se puede firmar. `signedUrl`
 * ya devuelve `null` en vez de lanzar, salvo que ni pueda crear su cliente: a estas alturas el
 * objeto y su ficha existen, y nada de la firma puede volver la subida un fallo.
 */
async function previewUrlOf(path: string): Promise<string | null> {
  try {
    return await signedUrl(path);
  } catch (error) {
    unstable_rethrow(error);
    logError("drills.upload-diagram", error);
    return null;
  }
}

/** El `FormData` de la subida, como lo valida `diagramUploadSchema`: el campo `file` es `diagram`. */
function uploadFields(input: unknown): unknown {
  // Un cliente manipulado puede mandar otra cosa en lugar del `FormData`: el esquema la rechaza.
  if (!(input instanceof FormData)) return null;
  return { drillId: input.get("drillId"), diagram: input.get("file") };
}

/**
 * Sube el diagrama de un ejercicio al bucket privado y lo registra en `media_assets`. Devuelve
 * el `mediaId` (para guardarlo en el ejercicio con `updateDrill`, que es lo único que lo liga
 * al ejercicio) y una URL firmada de 10 minutos para enseñar la vista previa. Los campos del
 * `FormData` son `drillId` y `file`. Pide `drill.create`; quién sube a qué ejercicio lo decide
 * la política de Storage (la dirección, en cualquiera del club; un entrenador, en sus
 * borradores), y una subida que esa política niega vuelve como `NOT_FOUND`.
 *
 * No se fía de nada que mande el cliente. La ruta la construye el servidor con el club de la
 * sesión y el `drillId` validado como uuid; el nombre del fichero no cuenta. Un fichero vale por
 * sus bytes (`sniffImageType`), no por su nombre ni por su tipo declarado: el tipo que se manda
 * a Storage y se guarda en la ficha es el detectado, la extensión sale de él, y si el declarado
 * y el detectado no coinciden (un SVG llamado `x.png`) se rechaza con `INVALID` y
 * `DIAGRAM_ERROR` sin tocar Storage. Se suben los bytes, no el `File`: con un `File`,
 * `supabase-js` manda el tipo declarado por el cliente como tipo del objeto e ignora
 * `contentType`. `upsert: false`: el nombre es nuevo cada vez y nunca se pisa un objeto.
 *
 * Si la ficha no se puede crear, se borra el objeto recién subido y no queda nada.
 *
 * Si todo salió bien pero no se puede firmar la URL, la subida cuenta: devuelve `ok` con el
 * `mediaId` y `previewUrl: null`. El objeto y su ficha existen, y descartar el id obligaría a la
 * persona a subir otra vez lo que ya está subido. El formulario guarda el `mediaId` igual y, sin
 * URL, enseña que hay un diagrama subido en lugar de la imagen.
 *
 * No revalida ninguna ruta: la subida no cambia `drills`, y ninguna página enseña un diagrama
 * hasta que `updateDrill` lo liga al ejercicio (y revalida). Cada subida crea una ficha nueva:
 * si la persona sube otro diagrama o abandona el formulario, las anteriores quedan sin
 * ejercicio.
 *
 * Los Server Actions admiten 1 MB de cuerpo por defecto; `next.config.ts` lo sube a 3 MB para
 * que quepa un diagrama de 2 MiB con lo que añade `multipart/form-data`.
 */
export async function uploadDrillDiagram(
  clubSlug: string,
  input: FormData,
): Promise<ActionResult<{ mediaId: string; previewUrl: string | null }>> {
  return runMutation(
    { tag: "drills.upload-diagram", permission: "drill.create", routes: [] },
    clubSlug,
    diagramUploadSchema,
    uploadFields(input),
    async ({ db, ctx, data, fromDb }) => {
      // El tamaño ya está comprobado (`File.size`); aquí se leen los bytes, ya autorizado.
      const bytes = new Uint8Array(await data.diagram.arrayBuffer());
      const type = sniffImageType(bytes);
      if (type === null || DIAGRAM_MIME[type] !== data.diagram.type) {
        return fail("INVALID", { diagram: DIAGRAM_ERROR });
      }
      const mime = DIAGRAM_MIME[type];
      const path = mediaPath(ctx.org.id, "drills", data.drillId, type);

      const { error: uploadError } = await db.storage
        .from(MEDIA_BUCKET)
        .upload(path, bytes, { contentType: mime, upsert: false });
      if (uploadError) return fromStorageError(uploadError);

      // `created_by` y `bucket` toman su valor por defecto: la sesión y `club-media`.
      const { data: media, error: insertError } = await db
        .from("media_assets")
        .insert({ organization_id: ctx.org.id, path, kind: "image", mime, bytes: bytes.byteLength })
        .select("id")
        .single();
      if (insertError || !media) {
        // Primero el motivo (y su registro), después la limpieza: si ésta falla, no lo tapa.
        const failure = fromDb(insertError ?? {});
        await discardUpload(db, path);
        return failure;
      }

      return ok({ mediaId: media.id, previewUrl: await previewUrlOf(path) });
    },
  );
}
