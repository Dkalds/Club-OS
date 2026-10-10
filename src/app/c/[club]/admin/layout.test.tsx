import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/consents/queries", () => ({
  getConsentStatus: async () => ({ needsTerms: false, pendingGuardianships: [] }),
}));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  usePathname: () => "/c/club-a/admin/way",
}));

import AdminLayout from "./layout";

function renderLayout(club = "club-a") {
  return AdminLayout({ children: <h1>Contenido</h1>, params: Promise.resolve({ club }) });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("layout de Gestión", () => {
  it("dirección ve el marco de Gestión con el nombre del club y su navegación", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin", { way: "Nuestra forma" }));

    render(await renderLayout());

    expect(screen.getByRole("banner")).toHaveTextContent("Club A");
    const nav = screen.getByRole("navigation", { name: "Gestión" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Nuestra forma",
      "Valores",
      "Principios",
      "Standards",
      "Club",
      "Equipos",
      "Personas",
      "Ejercicios pendientes",
      "Cobertura",
      "Invitaciones",
    ]);
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Contenido" })).toBeInTheDocument();
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
  });

  it.each(["coach", "player", "guardian"] as const)(
    "un miembro con el rol %s recibe el 404 y no se pinta nada",
    async (role) => {
      mocks.getClubContext.mockResolvedValue(clubContext(role));

      await expect(renderLayout()).rejects.toThrow("NOT_FOUND");
    },
  );

  it("sin club (no existe o no es el tuyo) recibe el mismo 404", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(renderLayout("club-b")).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-b");
  });
});
