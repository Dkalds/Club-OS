import type { ClubContext } from "@/modules/tenancy/queries";

type Role = ClubContext["membership"]["role"];

/** Cada fase que añade una acción la suma aquí y a `ALLOWED_ROLES`. */
export type Action =
  | "way.manage"
  | "admin.access"
  | "drill.view"
  | "drill.create"
  | "drill.publish"
  | "practice.manage"
  | "goal.manage"
  | "note.manage"
  | "game.manage";

/** Los roles que pueden cada acción. El compilador obliga a decidir las acciones nuevas. */
const ALLOWED_ROLES: Record<Action, readonly Role[]> = {
  "way.manage": ["admin"],
  "admin.access": ["admin"],
  // La biblioteca es del cuerpo técnico (RLS: `can_see_drill`): un jugador o una familia no
  // ven ningún ejercicio. Sirve para no ofrecerles lo que les llevaría a una lista vacía.
  "drill.view": ["admin", "coach"],
  // El entrenador escribe borradores; publicarlos (y archivarlos) es de la dirección.
  "drill.create": ["admin", "coach"],
  "drill.publish": ["admin"],
  // Planificar y editar sesiones de entrenamiento: quien entrena, no solo administración.
  "practice.manage": ["admin", "coach"],
  // Objetivos y notas de jugador, y partidos: quien entrena y dirección. Qué equipo y qué
  // nota en concreto lo decide RLS (una nota privada es solo de su autor).
  "goal.manage": ["admin", "coach"],
  "note.manage": ["admin", "coach"],
  "game.manage": ["admin", "coach"],
};

/**
 * Si quien tiene este contexto puede hacer la acción. Sirve para mostrar u ocultar, no para
 * proteger: lo que decide es RLS (y, en una Server Action, `can` antes de tocar la base de
 * datos).
 */
export function can(ctx: ClubContext, action: Action): boolean {
  return ALLOWED_ROLES[action].includes(ctx.membership.role);
}
