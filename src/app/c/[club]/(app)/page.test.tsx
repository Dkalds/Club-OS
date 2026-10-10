import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeData } from "@/modules/home/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), getHomeData: vi.fn(), getCoverageMatrix: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/home/queries", () => ({ getHomeData: mocks.getHomeData }));
vi.mock("@/modules/coverage/queries", () => ({
  DEFAULT_COVERAGE_WEEKS: 6,
  getCoverageMatrix: mocks.getCoverageMatrix,
}));
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
  mocks.getCoverageMatrix.mockResolvedValue({ standards: [], rows: [] });
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

  // Sin próximo entrenamiento, el aviso ofrece crear la sesión solo a quien puede gestionarlas.
  it.each(["coach", "admin"] as const)("sin entrenamiento a la vista, un %s ve «Nueva sesión»", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));
    mocks.getHomeData.mockResolvedValue({ ...HOME, hasTeams: true });

    render(await ClubHomePage(PARAMS));

    expect(screen.getByRole("link", { name: "Nueva sesión" })).toHaveAttribute("href", "/c/club-a/train/new");
  });

  it.each(["player", "guardian"] as const)("sin entrenamiento a la vista, un %s no ve «Nueva sesión»", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));
    mocks.getHomeData.mockResolvedValue({ ...HOME, hasTeams: true });

    render(await ClubHomePage(PARAMS));

    expect(screen.queryByRole("link", { name: "Nueva sesión" })).not.toBeInTheDocument();
  });

  it("un admin ve el resumen de cobertura; un entrenador no", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));
    mocks.getCoverageMatrix.mockResolvedValue({
      standards: [{ id: "s1", number: 1, title: "x" }],
      rows: [{ team: { id: "t1", name: "Equipo A" }, covered: [true] }],
    });

    render(await ClubHomePage(PARAMS));

    expect(screen.getByRole("heading", { name: "Cobertura de The Way" })).toBeInTheDocument();
    expect(screen.getByText(/1 de 1 combinaciones/)).toBeInTheDocument();
    expect(mocks.getCoverageMatrix).toHaveBeenCalledTimes(1);
  });

  it("un entrenador no ve el resumen de cobertura, ni se consulta", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach"));

    render(await ClubHomePage(PARAMS));

    expect(screen.queryByRole("heading", { name: "Cobertura de The Way" })).not.toBeInTheDocument();
    expect(mocks.getCoverageMatrix).not.toHaveBeenCalled();
  });
});
