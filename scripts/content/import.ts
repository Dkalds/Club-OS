// Escritura de un paquete de contenido en la biblioteca de un club: solo entrada y salida. Qué
// se escribe lo deciden `pack.ts` (leer y validar) y `rows.ts` (filas e ids).
//
// Por defecto solo crea: un ejercicio que ya existe no se toca, porque lo editado en la app
// manda. Con `update`, cada ejercicio del paquete vuelve a lo que dice el paquete; lo que el
// formato no lleva (Standards, resumen y vídeo) se queda como esté en la app. Ninguno de los
// dos modos borra un ejercicio que el paquete ya no trae.
//
// Las escrituras van por la API y no comparten transacción. Cada respuesta se comprueba y, ante
// el primer error, se deshace lo que esta ejecución había CREADO. Lo que `update` ya había
// sobrescrito no se puede deshacer: se repara volviendo a importar con `update`. Si el proceso
// muere a mitad (se cierra la terminal), no hay quien deshaga: la siguiente ejecución completa
// el ejercicio que se quedó sin hijos.

import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient, readSupabaseEnv } from "../lib/admin-client";
import { assertImportTarget } from "./guard";
import { loadPack } from "./pack";
import { buildPackRows, contentId, type PackDrillRows } from "./rows";

type Client = SupabaseClient<Database>;

const MEDIA_BUCKET = "club-media";

export type ImportOptions = { dir: string; club: string; update?: boolean };

/** Qué pasó con cada ejercicio del paquete, por su `key` y en el orden del paquete. */
export type ImportReport = {
  club: string;
  pack: { id: string; title: string };
  // Los que no existían, y los que una ejecución cortada dejó a medias y esta ha completado.
  created: string[];
  skipped: string[];
  updated: string[];
};

/** La importación no se pudo hacer o completar. El mensaje dice qué falló. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

type Failure = { message: string } | null;

/** Lo que esta ejecución ha creado, para deshacerlo si algo falla después. */
type Created = { drills: string[]; media: string[]; objects: string[] };

function assertRead(what: string, error: Failure): void {
  if (error) throw new ImportError(`No se pudo leer ${what}: ${error.message}.`);
}

function assertWritten(what: string, error: Failure): void {
  if (error) throw new ImportError(`No se pudo escribir ${what}: ${error.message}.`);
}

/** El filtro `not.in` de PostgREST con unos ids. */
function idList(ids: string[]): string {
  return `(${ids.join(",")})`;
}

// Quien importa sin cliente propio escribe con la clave de servicio del entorno: también aquí
// se comprueba el destino, para que nadie importe en un remoto por llamar a la función a mano.
function adminClientForImport(): Client {
  const { url } = readSupabaseEnv();
  assertImportTarget(url, process.env);
  return createAdminClient();
}

/**
 * De cada ejercicio que ya existía, borra los hijos que el paquete no trae, ANTES de escribir
 * los suyos. Guardar un ejercicio en la app sustituye sus puntos y variantes por otros con ids
 * nuevos en las mismas posiciones (`unique (drill_id, sort)`): escribir sin borrar chocaría.
 * Los Standards no se tocan: el paquete no opina sobre ellos.
 */
async function deleteStaleChildren(db: Client, rows: PackDrillRows[]): Promise<void> {
  for (const row of rows) {
    const id = row.drill.id;
    const children = [
      { table: "drill_coaching_points", column: "id", keep: row.points.map((point) => point.id) },
      { table: "drill_variants", column: "id", keep: row.variants.map((variant) => variant.id) },
      {
        table: "drill_focus_areas",
        column: "focus_area_id",
        keep: row.focusAreas.map((link) => link.focus_area_id),
      },
      {
        table: "drill_principles",
        column: "principle_id",
        keep: row.principles.map((link) => link.principle_id),
      },
    ] as const;

    for (const { table, column, keep } of children) {
      let stale = db.from(table).delete().eq("drill_id", id);
      if (keep.length > 0) stale = stale.not(column, "in", idList(keep));
      assertWritten(table, (await stale).error);
    }
  }
}

/**
 * La ficha de un ejercicio que ya existe, sin las columnas que el formato del paquete no lleva:
 * el resumen y el vídeo que alguien puso en la app no se pisan, como tampoco los Standards.
 */
function packColumns(drill: PackDrillRows["drill"]): PackDrillRows["drill"] {
  const columns = { ...drill };
  delete columns.summary;
  delete columns.video_url;
  return columns;
}

/**
 * Sube las pizarras y escribe fichas de medios, ejercicios e hijos, en orden de claves foráneas.
 * `created` son los ejercicios que no existían; `updated`, los que existían y se reescriben.
 */
async function write(
  db: Client,
  created: PackDrillRows[],
  updated: PackDrillRows[],
  undo: Created,
): Promise<void> {
  const all = [...created, ...updated];
  const isNew = new Set(created.map((row) => row.drill.id));

  // `upsert: true`: una ejecución anterior que muriera a mitad puede haber dejado el objeto.
  for (const row of all) {
    if (!row.upload) continue;
    if (isNew.has(row.drill.id)) undo.objects.push(row.upload.path);
    const { error } = await db.storage
      .from(MEDIA_BUCKET)
      .upload(row.upload.path, await readFile(row.upload.file), {
        contentType: row.upload.contentType,
        upsert: true,
      });
    assertWritten(`el objeto ${row.upload.path}`, error);
  }

  const media = all.flatMap((row) => (row.media ? [row.media] : []));
  if (media.length > 0) {
    undo.media.push(...created.flatMap((row) => (row.media ? [row.media.id] : [])));
    assertWritten("media_assets", (await db.from("media_assets").upsert(media, { onConflict: "id" })).error);
  }

  if (created.length > 0) {
    undo.drills.push(...created.map((row) => row.drill.id));
    assertWritten("drills", (await db.from("drills").insert(created.map((row) => row.drill))).error);
  }
  if (updated.length > 0) {
    assertWritten(
      "drills",
      (await db.from("drills").upsert(updated.map((row) => packColumns(row.drill)), { onConflict: "id" }))
        .error,
    );
  }

  await deleteStaleChildren(db, updated);

  const points = all.flatMap((row) => row.points);
  if (points.length > 0) {
    assertWritten(
      "drill_coaching_points",
      (await db.from("drill_coaching_points").upsert(points, { onConflict: "id" })).error,
    );
  }
  const variants = all.flatMap((row) => row.variants);
  if (variants.length > 0) {
    assertWritten("drill_variants", (await db.from("drill_variants").upsert(variants, { onConflict: "id" })).error);
  }
  const focusAreas = all.flatMap((row) => row.focusAreas);
  if (focusAreas.length > 0) {
    assertWritten(
      "drill_focus_areas",
      (await db.from("drill_focus_areas").upsert(focusAreas, { onConflict: "drill_id,focus_area_id" })).error,
    );
  }
  const principles = all.flatMap((row) => row.principles);
  if (principles.length > 0) {
    assertWritten(
      "drill_principles",
      (await db.from("drill_principles").upsert(principles, { onConflict: "drill_id,principle_id" })).error,
    );
  }
}

/** Borra lo creado en esta ejecución. Devuelve lo que no se pudo deshacer, si algo. */
async function rollBack(db: Client, undo: Created): Promise<string[]> {
  const problems: string[] = [];
  // Los ejercicios primero: apuntan a su ficha de medios, y sus hijos caen con ellos.
  if (undo.drills.length > 0) {
    const { error } = await db.from("drills").delete().in("id", undo.drills);
    if (error) problems.push(`drills: ${error.message}`);
  }
  if (undo.media.length > 0) {
    const { error } = await db.from("media_assets").delete().in("id", undo.media);
    if (error) problems.push(`media_assets: ${error.message}`);
  }
  if (undo.objects.length > 0) {
    const { error } = await db.storage.from(MEDIA_BUCKET).remove(undo.objects);
    if (error) problems.push(`los objetos de Storage: ${error.message}`);
  }
  return problems;
}

/**
 * Tras un `update` que ha ido bien: si la pizarra de un ejercicio ha cambiado de ruta (otro
 * tipo de imagen) se borra el objeto anterior, y si el paquete ya no trae pizarra para él se
 * borran también su ficha. Solo lo que el propio importador creó: sus ids son deterministas.
 */
async function retirePreviousDiagrams(
  db: Client,
  updated: PackDrillRows[],
  previous: Map<string, string>,
  mediaIdOf: (row: PackDrillRows) => string,
): Promise<void> {
  for (const row of updated) {
    const mediaId = mediaIdOf(row);
    const previousPath = previous.get(mediaId);
    if (previousPath === undefined) continue;
    if (row.media === null) {
      assertWritten("media_assets", (await db.from("media_assets").delete().eq("id", mediaId)).error);
    } else if (row.media.path === previousPath) {
      continue;
    }
    assertWritten(
      `el objeto ${previousPath}`,
      (await db.storage.from(MEDIA_BUCKET).remove([previousPath])).error,
    );
  }
}

/**
 * Importa el paquete de `options.dir` en el club de slug `options.club`. Sin `client`, escribe
 * con la clave de servicio del entorno, y solo en un Supabase local (ver `guard.ts`).
 *
 * Lanza `PackError` si el paquete no vale, `MissingRefsError` si al club le falta algún
 * objetivo de trabajo o principio de los que el paquete nombra, e `ImportError` si el club no
 * existe o una lectura o escritura falla. En los tres casos, sin dejar nada creado.
 */
export async function importPack(options: ImportOptions, client?: Client): Promise<ImportReport> {
  const loaded = await loadPack(options.dir);
  const db = client ?? adminClientForImport();
  const packId = loaded.pack.id;

  const club = await db.from("organizations").select("id, slug").eq("slug", options.club).maybeSingle();
  assertRead("el club", club.error);
  if (!club.data) throw new ImportError(`No existe el club "${options.club}".`);
  const organizationId = club.data.id;

  const [focusAreas, principles] = await Promise.all([
    db.from("focus_areas").select("id, slug").eq("organization_id", organizationId),
    db.from("game_principles").select("id, slug").eq("organization_id", organizationId),
  ]);
  assertRead("los objetivos de trabajo del club", focusAreas.error);
  assertRead("los principios del club", principles.error);

  const rows = buildPackRows(loaded, {
    organizationId,
    slug: club.data.slug,
    focusAreas: focusAreas.data ?? [],
    principles: principles.data ?? [],
  });

  const existing = await db
    .from("drills")
    .select("id")
    .in(
      "id",
      rows.map((row) => row.drill.id),
    );
  assertRead("los ejercicios del club", existing.error);
  const existingIds = new Set((existing.data ?? []).map((row) => row.id));

  const created = rows.filter((row) => !existingIds.has(row.drill.id));
  const present = rows.filter((row) => existingIds.has(row.drill.id));

  // Un ejercicio del paquete que existe sin ningún objetivo de trabajo es el resto de una
  // ejecución que murió entre escribir la ficha y sus hijos: el paquete y el formulario de la
  // app exigen al menos uno. No es algo editado en la app: se completa, también sin `update`.
  const unfinished = new Set<string>();
  if (present.length > 0 && !options.update) {
    const linked = await db
      .from("drill_focus_areas")
      .select("drill_id")
      .in(
        "drill_id",
        present.map((row) => row.drill.id),
      );
    assertRead("los objetivos de trabajo de los ejercicios", linked.error);
    const withFocus = new Set((linked.data ?? []).map((link) => link.drill_id));
    for (const row of present) if (!withFocus.has(row.drill.id)) unfinished.add(row.drill.id);
  }

  const completed = present.filter((row) => unfinished.has(row.drill.id));
  const updated = options.update ? present : [];
  const skipped = options.update ? [] : present.filter((row) => !unfinished.has(row.drill.id));
  // Lo que ya existía y se reescribe: lo pedido con `update` y lo que quedó a medias.
  const rewritten = [...updated, ...completed];

  // La ficha de la pizarra que cada ejercicio a reescribir tenía hasta ahora, por su id
  // determinista: también la de los que ya no traen pizarra.
  const mediaIdOf = (row: PackDrillRows) => contentId(organizationId, packId, `drill:${row.key}:diagram`);
  const previous = new Map<string, string>();
  if (rewritten.length > 0) {
    const media = await db.from("media_assets").select("id, path").in("id", rewritten.map(mediaIdOf));
    assertRead("las fichas de las pizarras", media.error);
    for (const asset of media.data ?? []) previous.set(asset.id, asset.path);
  }

  const undo: Created = { drills: [], media: [], objects: [] };
  try {
    await write(db, created, rewritten, undo);
  } catch (error) {
    const problems = await rollBack(db, undo);
    const reason =
      error instanceof ImportError
        ? error.message
        : `No se pudo completar la importación: ${error instanceof Error ? error.message : String(error)}.`;
    throw new ImportError(
      problems.length > 0 ? `${reason} Y no se pudo deshacer lo creado: ${problems.join("; ")}.` : reason,
    );
  }

  await retirePreviousDiagrams(db, rewritten, previous, mediaIdOf);

  const finished = new Set([...created, ...completed].map((row) => row.key));
  return {
    club: club.data.slug,
    pack: { id: packId, title: loaded.pack.title },
    created: rows.filter((row) => finished.has(row.key)).map((row) => row.key),
    skipped: skipped.map((row) => row.key),
    updated: updated.map((row) => row.key),
  };
}
