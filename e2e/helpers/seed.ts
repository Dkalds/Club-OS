import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient, readSupabaseEnv } from "../../scripts/lib/admin-client";
import { buildSeedData } from "../../scripts/seed/data";
import { isLocalSupabaseUrl } from "../../scripts/seed/guard";
import { runSeed } from "../../scripts/seed/run";

/**
 * Variable de entorno con la que `e2e/global-setup.ts` pasa a los tests el instante con el
 * que acaba de sembrar la base de datos. Los workers de Playwright arrancan después del
 * arranque global y heredan su entorno.
 *
 * Contra un Supabase que no es local el arranque global no siembra. Entonces la variable
 * la puede traer quien lanza los e2e (una fecha ISO: cuándo sembró ese destino); si no la
 * trae, vale el instante del arranque. Siempre queda definida.
 */
export const SEED_NOW_ENV = "E2E_SEED_NOW";

/**
 * El instante con el que se sembró la base de datos de esta ejecución (o, sin siembra, el
 * que se da por bueno: ver `SEED_NOW_ENV`).
 *
 * Las fechas del seed son relativas a ese instante (`seedSchedule(now, zona)`): con él, un
 * test calcula exactamente el calendario que hay en la base de datos, tarde lo que tarde
 * en llegarle el turno. Con `new Date()` calcularía el de «ahora», que deja de coincidir en
 * cuanto entre la siembra y el test empieza un entrenamiento o un partido.
 *
 * Hay que llamarla dentro de un test, no al cargar el archivo: Playwright lee los specs
 * antes de ejecutar el arranque global.
 */
export function seedNow(): Date {
  const iso = process.env[SEED_NOW_ENV];
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) {
    throw new Error(
      `Falta el instante de la siembra (${SEED_NOW_ENV}). Lo deja e2e/global-setup.ts al ` +
        "sembrar: ejecuta los e2e con `pnpm test:e2e`, con la configuración del repo.",
    );
  }
  return at;
}

/**
 * Las tablas que los e2e de escritura (Gestión, la ficha y el editor de ejercicios) y los
 * borradores de los de lectura (The Way) pueden dejar con filas que el seed no conoce: los
 * ejercicios, las fichas de medios (`media_assets`) y las cinco de la metodología del club. Cada
 * fase que añade tablas que sus e2e escriben, la suma aquí.
 *
 * El orden importa: se borra en este orden. `drills` va primero porque sus vínculos
 * (`drill_principles`, `drill_standards`) apuntan a `game_principles` y `standards` sin
 * cascada, y sus puntos, variantes y vínculos se van con él (`on delete cascade`): así un
 * principio o un Standard sobrante al que apunta un ejercicio sobrante se puede borrar después.
 * `media_assets` va justo después: `drills.diagram_media_id` apunta a ella con `on delete set
 * null`, de modo que cualquier orden valdría para la base de datos, pero así un ejercicio
 * sobrante ya no existe cuando su diagrama se desliga. Un ejercicio del seed no se toca, y con
 * él se quedan sus vínculos.
 */
const WRITABLE_TABLES = [
  "drills",
  "media_assets",
  "principle_points",
  "game_principles",
  "club_values",
  "standards",
  "way_sections",
] as const;

/** El bucket privado de los medios del club (el mismo de `src/modules/media/storage.ts`). */
const MEDIA_BUCKET = "club-media";

/** Cuántas entradas se piden por página al listar una carpeta de Storage, y cuántas se borran por llamada. */
const STORAGE_PAGE = 100;

type Bucket = ReturnType<SupabaseClient<Database>["storage"]["from"]>;

/**
 * Las rutas de todos los objetos que hay bajo `folder`, de cualquier profundidad. `list` solo
 * baja un nivel: devuelve los objetos de la carpeta y sus subcarpetas, y estas últimas se
 * distinguen porque no tienen `id`. Pide las páginas hasta que una viene corta.
 */
async function listObjects(bucket: Bucket, folder: string): Promise<string[]> {
  const paths: string[] = [];

  for (let offset = 0; ; offset += STORAGE_PAGE) {
    const { data, error } = await bucket.list(folder, { limit: STORAGE_PAGE, offset });
    if (error) {
      throw new Error(`No se pudo listar ${folder} en ${MEDIA_BUCKET}: ${error.message}`);
    }

    for (const entry of data) {
      const path = `${folder}/${entry.name}`;
      if (entry.id === null) paths.push(...(await listObjects(bucket, path)));
      else paths.push(path);
    }
    if (data.length < STORAGE_PAGE) return paths;
  }
}

/**
 * Borra, por la API de Storage (no con SQL sobre `storage.objects`: eso dejaría el fichero),
 * todo lo que hay en `org/<club>/` del bucket de medios de cada club del seed. El seed no sube
 * nada, así que todo lo que hay ahí es de un e2e abortado.
 */
async function clearMediaObjects(db: SupabaseClient<Database>, organizationIds: string[]): Promise<void> {
  const bucket = db.storage.from(MEDIA_BUCKET);

  for (const organizationId of organizationIds) {
    const paths = await listObjects(bucket, `org/${organizationId}`);
    for (let start = 0; start < paths.length; start += STORAGE_PAGE) {
      const { error } = await bucket.remove(paths.slice(start, start + STORAGE_PAGE));
      if (error) {
        throw new Error(`No se pudieron borrar los objetos de org/${organizationId} en ${MEDIA_BUCKET}: ${error.message}`);
      }
    }
  }
}

/**
 * Deja la metodología y la biblioteca de ejercicios de los clubes del seed exactamente como las
 * deja `runSeed(now)`: borra, en las tablas de `WRITABLE_TABLES` y en los clubes del seed, toda
 * fila cuyo id no sea de `buildSeedData(now)`, y después siembra, que devuelve a lo suyo lo que
 * el seed sí posee (texto, estado, orden, número) y quita los puntos que sobren de sus
 * principios y los hijos que sobren de sus ejercicios.
 *
 * Es lo que hace que la suite se recupere sola de una ejecución abortada: lo que esta dejó a
 * medias (una sección, un Standard, un borrador o un ejercicio `E2E …` de un spec) no vale como
 * dato de la siguiente, y quien lo ve falla sin que el fallo señale a la causa. Sin listas de
 * slugs ni de números escritas a mano: lo que no es del seed no sobrevive, se llame como se llame.
 *
 * Borra contenido, así que:
 *  - Solo corre con un Supabase local, diga lo que diga `ALLOW_REMOTE_SEED`. Con otro lanza,
 *    sin borrar nada. (Los specs que la llaman ya se saltan sus tests en ese caso.)
 *  - Solo toca los clubes del seed, solo esas tablas y solo la carpeta `org/<club>/` de cada uno
 *    en el bucket de medios.
 *  - NO está dentro de `runSeed`: `pnpm seed` con `ALLOW_REMOTE_SEED=true` borraría el
 *    contenido real de un entorno de demo.
 *
 * `now` es el instante de la siembra (`seedNow()` en los specs, el del arranque global en él).
 */
export async function restoreSeed(now: Date, client?: SupabaseClient<Database>): Promise<void> {
  if (!isLocalSupabaseUrl(readSupabaseEnv().url)) {
    throw new Error(
      "restoreSeed borra contenido de la metodología, de la biblioteca y de Storage: solo se ejecuta contra un Supabase local.",
    );
  }

  const db = client ?? createAdminClient();
  const data = buildSeedData(now);
  const organizationIds = data.organizations.map((organization) => organization.id);
  const seedIds = {
    drills: data.drills.map((row) => row.id),
    // El seed no posee ninguna ficha de medios (sus ejercicios no llevan diagrama): todas las de
    // sus clubes son de un e2e abortado.
    media_assets: [],
    principle_points: data.principle_points.map((row) => row.id),
    game_principles: data.game_principles.map((row) => row.id),
    club_values: data.club_values.map((row) => row.id),
    standards: data.standards.map((row) => row.id),
    way_sections: data.way_sections.map((row) => row.id),
  } satisfies Record<(typeof WRITABLE_TABLES)[number], string[]>;

  for (const table of WRITABLE_TABLES) {
    const keep = seedIds[table];
    let strays = db.from(table).delete().in("organization_id", organizationIds);
    if (keep.length > 0) strays = strays.not("id", "in", `(${keep.join(",")})`);
    const { error } = await strays;
    if (error) {
      throw new Error(`No se pudieron borrar las filas de ${table} que no son del seed: ${error.message}`);
    }
  }

  await clearMediaObjects(db, organizationIds);

  await runSeed(now, db);
}
