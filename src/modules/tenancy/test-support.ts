import type { ClubContext } from "./queries";

/**
 * Un contexto de club para los tests de layouts y páginas, con datos neutros: los tests de
 * `src/` no pueden nombrar a ningún club (pnpm check:guards). Solo lo importan tests.
 */
export function clubContext(
  role: ClubContext["membership"]["role"],
  terminology: ClubContext["branding"]["terminology"] = {},
): ClubContext {
  return {
    org: { id: "5b0e1c4e-2a53-4f6b-9a0c-1d2e3f4a5b6c", slug: "club-a", name: "Club A", timezone: "Europe/Madrid" },
    branding: {
      displayName: "Club A",
      wordmarkSub: "Baloncesto",
      shortName: "CLA",
      wayName: "El camino del Club A",
      tagline: null,
      colors: { accent: "#5aa9e6", accentPressed: "#4a90c8", onAccent: "#0a0a0b", accentSoft: "#14283a" },
      terminology,
    },
    membership: { role, personId: "2a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d" },
  };
}
