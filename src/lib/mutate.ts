import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { fail, fromDbError, fromZodError, type ActionResult } from "@/lib/action-result";
import type { Database } from "@/lib/database.types";
import { requireClub } from "@/lib/guards";
import { logError } from "@/lib/log";
import { can, type Action } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { ClubContext } from "@/modules/tenancy/queries";

// El esqueleto común de las Server Actions que escriben (C1/C2: todas las fases las escriben
// igual). Lo usa cada módulo con su permiso, su etiqueta de log y sus rutas; la escritura de
// cada acción es lo único que cambia.
//
// Este módulo NO es `'use server'`: no exporta acciones, las ayuda. Los módulos `'use server'`
// que lo importan siguen exportando solo funciones asíncronas.

type Db = SupabaseClient<Database>;
type DbError = { code?: string; message?: string };

/** Un `23505` (único) señala este campo con este mensaje; ver `fromDbError`. */
export type UniqueField = { field: string; message: string };

/** Lo que cambia de un módulo a otro. */
export type MutateConfig = {
  /** Cómo se llama la acción en el log del servidor: `modulo.accion` (`methodology.create-value`). */
  tag: string;
  /**
   * El permiso que exige la acción. Sin él, `NOT_FOUND` sin tocar la base de datos: RLS
   * decide de verdad quién escribe, `can` solo evita llegar hasta ella.
   */
  permission: Action;
  /**
   * Las rutas que se revalidan tras escribir. Son patrones de ruta, no URLs: las carpetas de
   * `src/app/c/[club]/` tal cual, con el segmento dinámico `[club]` y el grupo `(app)`. Así lo
   * espera `revalidatePath(ruta, "layout")`: Next etiqueta cada página con los layouts de su
   * patrón (`/c/[club]/(app)/way/layout`, `/c/[club]/admin/layout`…), y con la URL concreta
   * (`/c/club-a/way`) más `layout` armaría una etiqueta que ninguna ruta lleva y no
   * invalidaría nada; solo parecería funcionar porque cualquier `revalidatePath` dentro de una
   * Server Action vacía además la caché de rutas del cliente. El patrón no distingue clubes.
   */
  routes: readonly string[];
};

/** Lo que recibe la escritura de cada acción, ya validado y autorizado. */
export type Write<D> = {
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
 * como `SAVE_FAILED`: una acción siempre devuelve un `ActionResult`. Salvo lo que lanza el
 * propio Next para dirigir el flujo (`notFound()`, `redirect()`): eso lo recoge Next, no es un
 * fallo (`unstable_rethrow`).
 */
export async function mutate<D, T>(
  { tag, permission, routes }: MutateConfig,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  // Fuera de todo try/catch: `notFound()` funciona lanzando, y un catch se tragaría el 404.
  const ctx = await requireClub(clubSlug);
  if (!can(ctx, permission)) return fail("NOT_FOUND");

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
    unstable_rethrow(error);
    logError(tag, error);
    return fail("SAVE_FAILED");
  }

  if (result.ok) {
    for (const route of routes) revalidatePath(route, "layout");
  }
  return result;
}
