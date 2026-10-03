import { describe, expect, it } from "vitest";
import { PLATFORM_BRAND_COLORS } from "@/modules/tenancy/branding";
import type { ClubContext } from "@/modules/tenancy/queries";
import { can, type Action } from "./permissions";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
function contextWithRole(role: ClubContext["membership"]["role"]): ClubContext {
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

const ACTIONS: Action[] = ["way.manage", "admin.access"];

describe("can", () => {
  it.each(ACTIONS)("un admin puede %s", (action) => {
    expect(can(contextWithRole("admin"), action)).toBe(true);
  });

  it.each(ACTIONS)("un entrenador no puede %s", (action) => {
    expect(can(contextWithRole("coach"), action)).toBe(false);
  });

  it.each(["player", "guardian"] as const)("un %s no puede ninguna acción", (role) => {
    for (const action of ACTIONS) {
      expect(can(contextWithRole(role), action)).toBe(false);
    }
  });
});
