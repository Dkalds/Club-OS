import type { ZodError } from "zod";

/**
 * Lo que una Server Action puede devolver cuando algo sale mal. Cada fase que añade un error
 * de dominio con nombre (`GOAL_LIMIT`, `LAST_ADMIN`…) lo añade aquí y a `ACTION_ERROR_COPY`:
 * `fromDbError` lo reconoce solo, por estar en esa tabla.
 */
export type ActionError = "SAVE_FAILED" | "STALE_COPY" | "INVALID" | "NOT_FOUND";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError; fieldErrors?: Record<string, string> };

/** El texto que ve la persona para cada error. */
export const ACTION_ERROR_COPY: Record<ActionError, string> = {
  SAVE_FAILED: "No se pudo guardar. Inténtalo de nuevo.",
  STALE_COPY: "Alguien ha cambiado esto mientras editabas. Recarga para ver la última versión.",
  INVALID: "Revisa los campos marcados.",
  NOT_FOUND: "No encontramos este contenido.",
};

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: ActionError, fieldErrors?: Record<string, string>): ActionResult<never> {
  return fieldErrors ? { ok: false, error, fieldErrors } : { ok: false, error };
}

/**
 * Entrada inválida según Zod. De cada campo se queda con el primer mensaje; el campo
 * anidado se nombra con su ruta (`section.title`, `points.1`). Un error de la entrada
 * entera, sin campo, no se puede señalar en ningún sitio: queda el `INVALID` a secas.
 */
export function fromZodError(error: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path.length === 0) continue;
    // `String` y no `join` directo: una ruta puede llevar un símbolo.
    const field = issue.path.map(String).join(".");
    if (!Object.hasOwn(fieldErrors, field)) fieldErrors[field] = issue.message;
  }
  return fail("INVALID", Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined);
}

function isActionError(value: string | undefined): value is ActionError {
  // `hasOwn` y no `in`: «toString» no es un error.
  return value !== undefined && Object.hasOwn(ACTION_ERROR_COPY, value);
}

/**
 * ÚNICO traductor de errores de la base de datos a `ActionResult` (convención C1).
 *
 * Decide solo por `code` y `message`: PostgREST asigna a cada código un estado HTTP
 * distinto y ese estado no forma parte del contrato. Tampoco copia el mensaje al
 * resultado: puede llevar el contenido de una fila.
 *
 * - `P0001` con un mensaje que es un `ActionError` (`STALE_COPY`…): ese error.
 * - `P0002` (no encontrado) y `42501` (RLS): `NOT_FOUND`, el mismo 404 opaco.
 * - `23505` (único): `INVALID`, marcando `unique.field` si quien llama lo indica.
 * - `23514` (check) y `22023` (parámetro inválido): `INVALID`.
 * - Cualquier otro: `SAVE_FAILED`.
 */
export function fromDbError(
  error: { code?: string; message?: string },
  unique?: { field: string; message: string },
): ActionResult<never> {
  switch (error.code) {
    case "P0001":
      return isActionError(error.message) ? fail(error.message) : fail("SAVE_FAILED");
    case "P0002":
    case "42501":
      return fail("NOT_FOUND");
    case "23505":
      return fail("INVALID", unique ? { [unique.field]: unique.message } : undefined);
    case "23514":
    case "22023":
      return fail("INVALID");
    default:
      return fail("SAVE_FAILED");
  }
}
