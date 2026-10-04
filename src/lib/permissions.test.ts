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

/** Las acciones que solo hace administración. */
const ADMIN_ONLY: Action[] = ["way.manage", "admin.access"];
/** Todas las acciones: quien administra las puede todas. */
const ACTIONS: Action[] = [...ADMIN_ONLY, "practice.manage"];

describe("can", () => {
  it.each(ACTIONS)("un admin puede %s", (action) => {
    expect(can(contextWithRole("admin"), action)).toBe(true);
  });

  it.each(ADMIN_ONLY)("un entrenador no puede %s", (action) => {
    expect(can(contextWithRole("coach"), action)).toBe(false);
  });

  it("un entrenador puede gestionar sesiones", () => {
    expect(can(contextWithRole("coach"), "practice.manage")).toBe(true);
  });

  it.each(["player", "guardian"] as const)("un %s no puede ninguna acción", (role) => {
    for (const action of ACTIONS) {
      expect(can(contextWithRole(role), action)).toBe(false);
    }
  });
});
