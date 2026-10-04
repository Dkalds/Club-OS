import { describe, expect, it } from "vitest";
import { PLATFORM_BRAND_COLORS } from "@/modules/tenancy/branding";
import type { ClubContext } from "@/modules/tenancy/queries";
import { can, type Action } from "./permissions";

type Role = ClubContext["membership"]["role"];

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
function contextWithRole(role: Role): ClubContext {
  return {
    org: { id: "org-a", slug: "club-a", name: "Club A", timezone: "Europe/Madrid" },
    branding: {
      displayName: "Club A",
      wordmarkSub: null,
      shortName: "CLA",
      wayName: "The Way",
      tagline: null,
      colors: { ...PLATFORM_BRAND_COLORS },
      terminology: {},
    },
    membership: { role, personId: role === "admin" ? null : "person-a" },
  };
}

/**
 * Los roles que pueden cada acción, escritos a mano. Al ser un `Record<Action, …>`, una
 * acción nueva no compila hasta que alguien decide aquí quién puede hacerla.
 */
const EXPECTED: Record<Action, Record<Role, boolean>> = {
  "way.manage": { admin: true, coach: false, player: false, guardian: false },
  "admin.access": { admin: true, coach: false, player: false, guardian: false },
  "drill.create": { admin: true, coach: true, player: false, guardian: false },
  "drill.publish": { admin: true, coach: false, player: false, guardian: false },
};

const ACTIONS = Object.keys(EXPECTED) as Action[];
const ROLES: Role[] = ["admin", "coach", "player", "guardian"];

describe("can", () => {
  it.each(ACTIONS.flatMap((action) => ROLES.map((role) => [action, role] as const)))(
    "%s con el rol %s",
    (action, role) => {
      expect(can(contextWithRole(role), action)).toBe(EXPECTED[action][role]);
    },
  );

  it.each(ACTIONS)("un admin puede %s", (action) => {
    expect(can(contextWithRole("admin"), action)).toBe(true);
  });

  it.each(["player", "guardian"] as const)("un %s no puede ninguna acción", (role) => {
    for (const action of ACTIONS) {
      expect(can(contextWithRole(role), action)).toBe(false);
    }
  });

  it("un entrenador puede crear ejercicios, pero no publicarlos", () => {
    expect(can(contextWithRole("coach"), "drill.create")).toBe(true);
    expect(can(contextWithRole("coach"), "drill.publish")).toBe(false);
  });

  it("un entrenador sigue sin gestionar The Way ni Gestión", () => {
    expect(can(contextWithRole("coach"), "way.manage")).toBe(false);
    expect(can(contextWithRole("coach"), "admin.access")).toBe(false);
  });
});
