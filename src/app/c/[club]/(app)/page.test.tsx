import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeData } from "@/modules/home/types";
import type { RecentChange } from "@/modules/schedule/changes";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  getHomeData: vi.fn(),
  getCoverageMatrix: vi.fn(),
  listRecentChanges: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/home/queries", () => ({ getHomeData: mocks.getHomeData }));
vi.mock("@/modules/coverage/queries", () => ({
  DEFAULT_COVERAGE_WEEKS: 6,
  getCoverageMatrix: mocks.getCoverageMatrix,
}));
vi.mock("@/modules/schedule/changes-queries", () => ({ listRecentChanges: mocks.listRecentChanges }));
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

const EVENT = "00000000-0000-4000-8000-000000000041";

/** Un evento que ha cambiado hace poco, como lo entrega `listRecentChanges`. */
const CHANGE: RecentChange = {
  eventId: EVENT,
  href: `/c/club-a/train/${EVENT}`,
  label: "Cancelada",
  title: "Sesión A",
  subtitle: "Martes 13 oct · 19:00–20:15 · Sesión A",
  cancelled: true,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getHomeData.mockResolvedValue(HOME);
  mocks.getCoverageMatrix.mockResolvedValue({ standards: [], rows: [] });
  mocks.listRecentChanges.mockResolvedValue({ items: [], more: 0 });
});

// La página se protege sola: un layout no protege a sus páginas.
describe("Inicio del club", () => {
  it("sin club (no existe o no es el tuyo), el 404, y no lee ningún dato", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(ClubHomePage(PARAMS)).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getHomeData).not.toHaveBeenCalled();
    expect(mocks.listRecentChanges).not.toHaveBeenCalled();
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

  describe("cambios recientes", () => {
    it("pide los tres últimos con el contexto y la misma hora que Inicio", async () => {
      const ctx = clubContext("coach");
      mocks.getClubContext.mockResolvedValue(ctx);

      render(await ClubHomePage(PARAMS));

      expect(mocks.listRecentChanges).toHaveBeenCalledTimes(1);
      const [homeCall] = mocks.getHomeData.mock.calls;
      expect(mocks.listRecentChanges).toHaveBeenCalledWith(ctx, homeCall?.[1], 3);
    });

    it("los pinta lo primero, con su enlace, y lleva a la Agenda a por los que no caben", async () => {
      mocks.getClubContext.mockResolvedValue(clubContext("coach"));
      mocks.getHomeData.mockResolvedValue({ ...HOME, hasTeams: true });
      mocks.listRecentChanges.mockResolvedValue({ items: [CHANGE], more: 4 });

      render(await ClubHomePage(PARAMS));

      const heading = screen.getByRole("heading", { level: 2, name: "Cambios recientes" });
      const row = screen.getByRole("link", { name: /Cancelada/ });
      expect(row).toHaveAttribute("href", `/c/club-a/train/${EVENT}`);
      expect(row).toHaveTextContent("Martes 13 oct · 19:00–20:15 · Sesión A");
      expect(screen.getByRole("link", { name: "Ver 4 más" })).toHaveAttribute("href", "/c/club-a/agenda");
      // Lo primero: antes que el aviso del próximo entrenamiento.
      const prepare = screen.getByRole("link", { name: "Preparar sesión" });
      expect(heading.compareDocumentPosition(prepare) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("sin cambios no hay apartado", async () => {
      mocks.getClubContext.mockResolvedValue(clubContext("coach"));
      mocks.getHomeData.mockResolvedValue({ ...HOME, hasTeams: true });

      render(await ClubHomePage(PARAMS));

      expect(screen.queryByRole("heading", { name: "Cambios recientes" })).not.toBeInTheDocument();
    });

    it("si no se pueden leer, lanza: lo recoge `error.tsx`", async () => {
      mocks.getClubContext.mockResolvedValue(clubContext("coach"));
      mocks.listRecentChanges.mockRejectedValue(new Error("schedule.recent-changes: no se pudo leer de la base de datos"));

      await expect(ClubHomePage(PARAMS)).rejects.toThrow("schedule.recent-changes");
    });
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
