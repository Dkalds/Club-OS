import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_BRAND_COLORS } from "@/modules/tenancy/branding";
import type { ClubContext } from "@/modules/tenancy/queries";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  getConsentStatus: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/consents/queries", () => ({ getConsentStatus: mocks.getConsentStatus }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));

import { adminPage, requireAdmin, requireClub, requireTerms } from "./guards";

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

/** Lo que lanza `notFound()` de verdad: corta la ejecución, no devuelve. */
const NOT_FOUND = new Error("NEXT_HTTP_ERROR_FALLBACK;404");

/** Lo que lanza `redirect()` de verdad: corta la ejecución, no devuelve. */
const redirectThrow = (path: string) => new Error(`NEXT_REDIRECT;${path}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.notFound.mockImplementation(() => {
    throw NOT_FOUND;
  });
  mocks.redirect.mockImplementation((path: string) => {
    throw redirectThrow(path);
  });
  mocks.getConsentStatus.mockResolvedValue({ needsTerms: false, pendingGuardianships: [] });
});

describe("requireClub", () => {
  it("devuelve el contexto del club para el slug pedido", async () => {
    const context = contextWithRole("coach");
    mocks.getClubContext.mockResolvedValue(context);

    await expect(requireClub("club-a")).resolves.toBe(context);

    expect(mocks.getClubContext).toHaveBeenCalledTimes(1);
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("llama a notFound si el club no existe o la persona no es miembro", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(requireClub("club-b")).rejects.toBe(NOT_FOUND);

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-b");
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
});

describe("requireAdmin", () => {
  it("deja pasar a un admin", () => {
    expect(() => requireAdmin(contextWithRole("admin"))).not.toThrow();

    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it.each(["coach", "player", "guardian"] as const)("llama a notFound con un %s", (role) => {
    expect(() => requireAdmin(contextWithRole(role))).toThrow(NOT_FOUND);

    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });
});

describe("requireTerms", () => {
  it("sin que falten los términos, no hace nada", async () => {
    mocks.getConsentStatus.mockResolvedValue({ needsTerms: false, pendingGuardianships: [] });

    await expect(requireTerms(contextWithRole("coach"))).resolves.toBeUndefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("si faltan, redirige a /consent de este club", async () => {
    mocks.getConsentStatus.mockResolvedValue({ needsTerms: true, pendingGuardianships: [] });

    await expect(requireTerms(contextWithRole("coach"))).rejects.toThrow("NEXT_REDIRECT;/c/club-a/consent");
  });
});

describe("adminPage", () => {
  const params = Promise.resolve({ club: "club-a", sectionId: "seccion-1" });

  it("con dirección, ejecuta la página con el contexto del club y los parámetros de la ruta", async () => {
    const context = contextWithRole("admin");
    mocks.getClubContext.mockResolvedValue(context);
    const render = vi.fn().mockResolvedValue("contenido");

    const page = adminPage<{ club: string; sectionId: string }>(render);

    await expect(page({ params })).resolves.toBe("contenido");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(context, { club: "club-a", sectionId: "seccion-1" });
  });

  it.each(["coach", "player", "guardian"] as const)(
    "con un %s, el 404 y la página no llega a ejecutarse",
    async (role) => {
      mocks.getClubContext.mockResolvedValue(contextWithRole(role));
      const render = vi.fn();

      await expect(adminPage(render)({ params })).rejects.toBe(NOT_FOUND);

      expect(render).not.toHaveBeenCalled();
    },
  );

  it("sin club (no existe o no es miembro), el mismo 404 y la página no llega a ejecutarse", async () => {
    mocks.getClubContext.mockResolvedValue(null);
    const render = vi.fn();

    await expect(adminPage(render)({ params })).rejects.toBe(NOT_FOUND);

    expect(render).not.toHaveBeenCalled();
  });

  it("con dirección pero sin los términos aceptados, a /consent y la página no llega a ejecutarse", async () => {
    mocks.getClubContext.mockResolvedValue(contextWithRole("admin"));
    mocks.getConsentStatus.mockResolvedValue({ needsTerms: true, pendingGuardianships: [] });
    const render = vi.fn();

    await expect(adminPage(render)({ params })).rejects.toThrow("NEXT_REDIRECT;/c/club-a/consent");

    expect(render).not.toHaveBeenCalled();
  });

  it("lo que lanza la página (su propio notFound, un redirect) sale tal cual", async () => {
    mocks.getClubContext.mockResolvedValue(contextWithRole("admin"));
    const thrown = new Error("NEXT_REDIRECT");

    await expect(
      adminPage(() => {
        throw thrown;
      })({ params }),
    ).rejects.toBe(thrown);
  });
});
