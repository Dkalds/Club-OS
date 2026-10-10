import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeData } from "@/modules/home/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), getHomeData: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/home/queries", () => ({ getHomeData: mocks.getHomeData }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ClubHomePage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const PARAMS = { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve({}) };

const HOME: HomeData = {
  greeting: "Buenos días",
  firstName: "Ana",
  kicker: null,
  nextPractice: null,
  nextGame: null,
  week: [],
  hasTeams: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getHomeData.mockResolvedValue(HOME);
});

// La página se protege sola: un layout no protege a sus páginas.
describe("Inicio del club", () => {
  it("sin club (no existe o no es el tuyo), el 404, y no lee ningún dato", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(ClubHomePage(PARAMS)).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getHomeData).not.toHaveBeenCalled();
  });

  it("con club, pide Inicio para ese contexto y con la hora del servidor, y lo pinta", async () => {
    const ctx = clubContext("coach");
    mocks.getClubContext.mockResolvedValue(ctx);

    render(await ClubHomePage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Buenos días, Ana." })).toBeInTheDocument();
    expect(mocks.getHomeData).toHaveBeenCalledTimes(1);
    expect(mocks.getHomeData).toHaveBeenCalledWith(
      ctx,
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    );
  });

  it.each(["coach", "admin"] as const)(
    "un %s, que no tiene la identidad en la barra, la encuentra en Inicio con el nombre que le da el club",
    async (role) => {
      mocks.getClubContext.mockResolvedValue(clubContext(role));

      render(await ClubHomePage(PARAMS));

      const row = screen.getByRole("link", { name: /^Identidad/ });
      expect(row).toHaveAttribute("href", "/c/club-a/way");
      expect(row).toHaveTextContent("El camino del Club A");
    },
  );

  it.each(["player", "guardian"] as const)("un %s ya la tiene como pestaña: Inicio no la repite", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));

    render(await ClubHomePage(PARAMS));

    expect(screen.queryByRole("link", { name: /^Identidad/ })).not.toBeInTheDocument();
  });

  it("si el club no ha puesto nombre a su metodología, la fila no repite «Identidad» de subtítulo", async () => {
    const ctx = clubContext("coach");
    mocks.getClubContext.mockResolvedValue({ ...ctx, branding: { ...ctx.branding, wayName: "Identidad" } });

    render(await ClubHomePage(PARAMS));

    expect(screen.getByRole("link", { name: "Identidad" }).textContent).toBe("Identidad");
  });

  // Sin próximo entrenamiento, el aviso ofrece crear la sesión solo a quien puede gestionarlas.
  it.each(["coach", "admin"] as const)("sin entrenamiento a la vista, un %s ve «Preparar sesión»", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));
    mocks.getHomeData.mockResolvedValue({ ...HOME, hasTeams: true });

    render(await ClubHomePage(PARAMS));

    expect(screen.getByRole("link", { name: "Preparar sesión" })).toHaveAttribute("href", "/c/club-a/train/new");
  });

  it.each(["player", "guardian"] as const)("sin entrenamiento a la vista, un %s no ve «Preparar sesión»", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));
    mocks.getHomeData.mockResolvedValue({ ...HOME, hasTeams: true });

    render(await ClubHomePage(PARAMS));

    expect(screen.queryByRole("link", { name: "Preparar sesión" })).not.toBeInTheDocument();
  });
});
