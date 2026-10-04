import { can } from "@/lib/permissions";
import type { ClubContext } from "@/modules/tenancy/queries";
import type { DrillStatus } from "./types";

/**
 * Qué botones enseñar en un ejercicio. Sirve para mostrar u ocultar, no para proteger: lo que
 * decide es RLS, y las Server Actions comprueban `can` antes de tocar la base de datos.
 *
 * Editar: el admin edita todo; el entrenador solo sus borradores; el resto de roles (jugador,
 * familia) no gestiona ejercicios. Publicar y archivar son la misma regla que el guard de
 * `publishDrill` y `archiveDrill` (`can(ctx, "drill.publish")`, hoy solo el admin), leída de
 * `ALLOWED_ROLES` y no repetida aquí: si cambia, el botón y la acción cambian juntos. Además
 * se publica lo que aún no está publicado (un borrador, o un archivado que vuelve) y se
 * archiva lo que aún no está archivado.
 */
export function drillPermissions(
  ctx: ClubContext,
  drill: { status: DrillStatus; createdByMe: boolean },
): { edit: boolean; publish: boolean; archive: boolean } {
  const manages = can(ctx, "drill.publish");

  return {
    edit: canEdit(ctx, drill),
    publish: manages && drill.status !== "published",
    archive: manages && drill.status !== "archived",
  };
}

function canEdit(
  ctx: ClubContext,
  drill: { status: DrillStatus; createdByMe: boolean },
): boolean {
  switch (ctx.membership.role) {
    case "admin":
      return true;
    case "coach":
      return drill.status === "draft" && drill.createdByMe;
    default:
      return false;
  }
}
