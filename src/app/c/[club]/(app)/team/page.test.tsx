import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamDetail, TeamSummary } from "@/modules/team/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), listMyTeams: vi.fn(), getTeam: vi.fn() }));

// La cookie del equipo activo (`getTeamScope`): sin ella se ven todos «mis equipos».
const activeTeam = vi.hoisted(() => ({ id: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (activeTeam.id === undefined ? undefined : { value: activeTeam.id }) }),
}));
vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/team/queries", () => ({ listMyTeams: mocks.listMyTeams, getTeam: mocks.getTeam }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import TeamDetailPage from "./[teamId]/page";
import TeamPage from "./page";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const summary = (n: number, name: string): TeamSummary => ({
  id: uuid(n),
  name,
  categoryName: "Categoría",
  seasonName: "2026/27",
});
const DETAIL: TeamDetail = {
  ...summary(1, "Equipo A"),
  staff: [
    { personId: uuid(20), firstName: "Bea", lastName: "Arco", role: "head_coach" },
    { personId: uuid(21), firstName: "Ana", lastName: "Zamora", role: "assistant" },
  ],
  players: [
    { personId: uuid(30), firstName: "Eloy", lastName: "Mar", jerseyNumber: 4, position: "Base" },
    { personId: uuid(31), firstName: "Ciro", lastName: "Luna", jerseyNumber: 12, position: null },
  ],
};

const params = <E extends Record<string, string>>(extra: E = {} as E) => ({
  params: Promise.resolve({ club: "club-a", ...extra }),
  searchParams: Promise.resolve({}),
});

beforeEach(() => {
  vi.resetAllMocks();
  activeTeam.id = undefined;
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.listMyTeams.mockResolvedValue([summary(1, "Equipo A")]);
  mocks.getTeam.mockResolvedValue(DETAIL);
});

describe("/team", () => {
  it("sin club, 404 sin leer equipos", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(TeamPage(params())).rejects.toThrow("NOT_FOUND");
    expect(mocks.listMyTeams).not.toHaveBeenCalled();
  });

  it("con un solo equipo, su plantilla aquí mismo: cuerpo técnico y jugadores por dorsal", async () => {
    render(await TeamPage(params()));

    expect(screen.getByRole("heading", { level: 1, name: "Equipo A" })).toBeInTheDocument();
    expect(screen.getByText("Categoría · 2026/27")).toBeInTheDocument();
    expect(screen.getByText("Bea Arco")).toBeInTheDocument();
    expect(screen.getByText(/Entrenador principal/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Plantilla · 2 jugadores" })).toBeInTheDocument();

    const rows = screen.getAllByRole("link");
    expect(rows.map((link) => link.getAttribute("href"))).toEqual([
      `/c/club-a/team/${uuid(1)}/players/${uuid(30)}`,
      `/c/club-a/team/${uuid(1)}/players/${uuid(31)}`,
    ]);
    expect(mocks.getTeam).toHaveBeenCalledWith(expect.objectContaining({ org: expect.anything() }), uuid(1));
  });

  it("ninguna URL lleva el nombre de un jugador", async () => {
    render(await TeamPage(params()));

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/Eloy|Mar|Ciro|Luna/);
    }
  });

  it("con varios equipos (dirección), la lista; cada uno lleva a su plantilla", async () => {
    mocks.getClubContext.mockResolvedValue({ ...clubContext("admin"), membership: { role: "admin", personId: null } });
    mocks.listMyTeams.mockResolvedValue([summary(1, "Equipo A"), summary(2, "Equipo B")]);

    render(await TeamPage(params()));

    expect(screen.getByRole("heading", { level: 1, name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Equipo B/ })).toHaveAttribute("href", `/c/club-a/team/${uuid(2)}`);
    expect(mocks.getTeam).not.toHaveBeenCalled();
  });

  it("con varios equipos y uno elegido en la cabecera, la plantilla de ese directamente", async () => {
    activeTeam.id = uuid(1);
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));
    mocks.listMyTeams.mockResolvedValue([summary(1, "Equipo A"), summary(2, "Equipo B")]);

    render(await TeamPage(params()));

    expect(screen.getByRole("heading", { level: 1, name: "Equipo A" })).toBeInTheDocument();
    expect(mocks.getTeam).toHaveBeenCalledWith(expect.anything(), uuid(1));
    expect(screen.queryByText("Equipo B")).not.toBeInTheDocument();
  });

  it("un equipo elegido que ya no es mío se ignora: la lista de los míos", async () => {
    activeTeam.id = uuid(9);
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));
    mocks.listMyTeams.mockResolvedValue([summary(1, "Equipo A"), summary(2, "Equipo B")]);

    render(await TeamPage(params()));

    expect(screen.getByRole("heading", { level: 1, name: "Equipo" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("sin equipos, lo dice según quién lo lee", async () => {
    mocks.listMyTeams.mockResolvedValue([]);

    render(await TeamPage(params()));

    expect(screen.getByRole("heading", { level: 2, name: "Aún no estás en ningún equipo" })).toBeInTheDocument();
    expect(screen.getByText("Cuando dirección te asigne un equipo, aquí verás su plantilla.")).toBeInTheDocument();
  });

  it("un equipo sin jugadores lo dice", async () => {
    mocks.getTeam.mockResolvedValue({ ...DETAIL, players: [] });

    render(await TeamPage(params()));

    expect(screen.getByRole("heading", { name: "Este equipo aún no tiene jugadores" })).toBeInTheDocument();
  });
});

describe("/team/[teamId]", () => {
  it("la plantilla del equipo, con la vuelta a Equipo", async () => {
    render(await TeamDetailPage(params({ teamId: uuid(1) })));

    expect(screen.getByRole("heading", { level: 1, name: "Equipo A" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Equipo/ })).toHaveAttribute("href", "/c/club-a/team");
    expect(mocks.getTeam).toHaveBeenCalledWith(expect.anything(), uuid(1));
  });

  it("un equipo que no se ve (de otro club, de otra temporada…): 404", async () => {
    mocks.getTeam.mockResolvedValue(null);

    await expect(TeamDetailPage(params({ teamId: uuid(9) }))).rejects.toThrow("NOT_FOUND");
  });
});
