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
 * Las tablas que los e2e de escritura pueden dejar con filas que el seed no conoce: las cinco
 * de la metodología del club (Gestión escribe sus contenidos y The Way, sus borradores) y las
 * tres de las sesiones (el constructor crea sesiones, planes e ítems). Cada fase que añade
 * tablas que sus e2e escriben, la suma aquí.
 *
 * El orden es el del borrado, y en las sesiones importa: un ítem cuelga de su plan y un plan,
 * de su evento, así que van ítems, planes y, al final, eventos.
 */
const WRITABLE_TABLES = [
  "principle_points",
  "game_principles",
  "club_values",
  "standards",
  "way_sections",
  "practice_items",
  "practice_plans",
  "events",
] as const;

/**
 * Deja los clubes del seed exactamente como los deja `runSeed(now)`: borra, en las tablas de
 * `WRITABLE_TABLES` y en los clubes del seed, toda fila cuyo id no sea de `buildSeedData(now)`,
 * y después siembra, que devuelve a lo suyo lo que el seed sí posee (texto, estado, orden,
 * número) y quita los puntos que sobren de sus principios.
 *
 * Es lo que hace que la suite se recupere sola de una ejecución abortada: lo que esta dejó a
 * medias (una sección, un Standard, un borrador o una sesión de un spec) no vale como dato de
 * la siguiente, y quien lo ve falla sin que el fallo señale a la causa. Sin listas de slugs ni
 * de números escritas a mano: lo que no es del seed no sobrevive, se llame como se llame.
 *
 * De `events` solo se borran los entrenos (`kind = 'practice'`): los partidos tienen su propio
 * tratamiento en una fase posterior y un partido que no es del seed no se toca. Los planes sin
 * equipo (las plantillas privadas) que no son del seed se borran como los demás: son del club
 * por `organization_id`.
 *
 * Borra contenido, así que:
 *  - Solo corre con un Supabase local, diga lo que diga `ALLOW_REMOTE_SEED`. Con otro lanza,
 *    sin borrar nada. (Los specs que la llaman ya se saltan sus tests en ese caso.)
 *  - Solo toca los clubes del seed y solo esas tablas.
 *  - NO está dentro de `runSeed`: `pnpm seed` con `ALLOW_REMOTE_SEED=true` borraría el
 *    contenido real de un entorno de demo.
 *
 * `now` es el instante de la siembra (`seedNow()` en los specs, el del arranque global en él).
 */
export async function restoreSeed(now: Date, client?: SupabaseClient<Database>): Promise<void> {
  if (!isLocalSupabaseUrl(readSupabaseEnv().url)) {
    throw new Error(
      "restoreSeed borra contenido de la metodología: solo se ejecuta contra un Supabase local.",
    );
  }

  const db = client ?? createAdminClient();
  const data = buildSeedData(now);
  const organizationIds = data.organizations.map((organization) => organization.id);
  const seedIds = {
    principle_points: data.principle_points.map((row) => row.id),
    game_principles: data.game_principles.map((row) => row.id),
    club_values: data.club_values.map((row) => row.id),
    standards: data.standards.map((row) => row.id),
    way_sections: data.way_sections.map((row) => row.id),
    practice_items: data.practice_items.map((row) => row.id),
    practice_plans: data.practice_plans.map((row) => row.id),
    events: data.events.map((row) => row.id),
  } satisfies Record<(typeof WRITABLE_TABLES)[number], string[]>;

  for (const table of WRITABLE_TABLES) {
    const keep = seedIds[table];
    let strays = db.from(table).delete().in("organization_id", organizationIds);
    // `filter` y no `eq`: `kind` no está en todas las tablas del bucle y `eq` solo acepta
    // columnas de la unión de sus filas. Es el mismo `kind=eq.practice` de PostgREST.
    if (table === "events") strays = strays.filter("kind", "eq", "practice");
    if (keep.length > 0) strays = strays.not("id", "in", `(${keep.join(",")})`);
    const { error } = await strays;
    if (error) {
      throw new Error(`No se pudieron borrar las filas de ${table} que no son del seed: ${error.message}`);
    }
  }

  await runSeed(now, db);
}
