import type { ClubContext } from "@/modules/tenancy/queries";
import type { DrillStatus } from "./types";

/**
 * Qué botones enseñar en un ejercicio. Sirve para mostrar u ocultar, no para proteger: lo que
 * decide es RLS, y las Server Actions comprueban `can` antes de tocar la base de datos.
 *
 * El admin edita todo; publica lo que aún no está publicado (un borrador, o un archivado que
 * vuelve) y archiva lo que aún no está archivado. El entrenador solo edita sus borradores y
 * no publica ni archiva. El resto de roles (jugador, familia) no gestiona ejercicios.
 */
export function drillPermissions(
  ctx: ClubContext,
  drill: { status: DrillStatus; createdByMe: boolean },
): { edit: boolean; publish: boolean; archive: boolean } {
  switch (ctx.membership.role) {
    case "admin":
      return {
        edit: true,
        publish: drill.status !== "published",
        archive: drill.status !== "archived",
      };
    case "coach":
      return { edit: drill.status === "draft" && drill.createdByMe, publish: false, archive: false };
    default:
      return { edit: false, publish: false, archive: false };
  }
}
