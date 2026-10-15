import { afterEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";
import type { TeamSummary } from "./types";

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), listMyTeams: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("./queries", () => ({ listMyTeams: mocks.listMyTeams }));
// `cache()` de React solo memoriza dentro de una petición de servidor: aquí es la función tal cual.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

import { ACTIVE_TEAM_COOKIE, activeTeamCookiePath, getTeamScope, pickScope } from "./scope";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TEAM_A: TeamSummary = {
  id: "00000000-0000-4000-8000-0000000000a1",
  name: "Equipo A",
  categoryName: "Categoría 1",
  seasonName: "2026/27",
};
const TEAM_B: TeamSummary = {
  id: "00000000-0000-4000-8000-0000000000b1",
  name: "Equipo B",
  categoryName: "Categoría 2",
  seasonName: "2026/27",
};
const NOT_MINE = "00000000-0000-4000-8000-0000000000c1";

afterEach(() => vi.clearAllMocks());

describe("pickScope", () => {
  it("sin cookie se ven todos mis equipos, por nombre", () => {
    expect(pickScope([TEAM_B, TEAM_A], undefined)).toEqual({
      teams: [TEAM_A, TEAM_B],
      active: null,
      scoped: [TEAM_A, TEAM_B],
    });
  });

  it("con la cookie de uno de mis equipos, solo ese", () => {
    expect(pickScope([TEAM_A, TEAM_B], TEAM_B.id)).toEqual({
      teams: [TEAM_A, TEAM_B],
      active: TEAM_B,
      scoped: [TEAM_B],
    });
  });

  it("un equipo que no es mío se ignora: se ven todos, no una pantalla vacía", () => {
    const scope = pickScope([TEAM_A, TEAM_B], NOT_MINE);

    expect(scope.active).toBeNull();
    expect(scope.scoped).toEqual([TEAM_A, TEAM_B]);
  });

  it.each(["", "todos", "null", `${TEAM_A.id} or 1=1`, "../../etc"])(
    "un valor que no es un uuid (%j) se ignora",
    (cookie) => {
      expect(pickScope([TEAM_A, TEAM_B], cookie).active).toBeNull();
    },
  );

  it("sin equipos no hay nada que elegir, diga lo que diga la cookie", () => {
    expect(pickScope([], TEAM_A.id)).toEqual({ teams: [], active: null, scoped: [] });
  });

  it("no cambia la lista que recibe", () => {
    const teams = [TEAM_B, TEAM_A];
    pickScope(teams, undefined);

    expect(teams).toEqual([TEAM_B, TEAM_A]);
  });
});

describe("getTeamScope", () => {
  const CTX = clubContext("coach");

  function withCookie(value: string | undefined) {
    const get = vi.fn((name: string) => (name === ACTIVE_TEAM_COOKIE && value !== undefined ? { value } : undefined));
    mocks.cookies.mockResolvedValue({ get });
    return get;
  }

  it("lee mis equipos con el contexto y aplica la cookie del equipo activo", async () => {
    const get = withCookie(TEAM_A.id);
    mocks.listMyTeams.mockResolvedValue([TEAM_A, TEAM_B]);

    const scope = await getTeamScope(CTX);

    expect(mocks.listMyTeams).toHaveBeenCalledWith(CTX);
    expect(get).toHaveBeenCalledWith("active-team");
    expect(scope.active).toEqual(TEAM_A);
    expect(scope.scoped).toEqual([TEAM_A]);
  });

  it("sin cookie, todos", async () => {
    withCookie(undefined);
    mocks.listMyTeams.mockResolvedValue([TEAM_A, TEAM_B]);

    expect((await getTeamScope(CTX)).scoped).toEqual([TEAM_A, TEAM_B]);
  });

  it("la cookie de un equipo que ya no es mío no deja la app vacía", async () => {
    withCookie(TEAM_B.id);
    mocks.listMyTeams.mockResolvedValue([TEAM_A]);

    const scope = await getTeamScope(CTX);

    expect(scope.active).toBeNull();
    expect(scope.scoped).toEqual([TEAM_A]);
  });

  it("si mis equipos no se pueden leer, lanza", async () => {
    withCookie(undefined);
    mocks.listMyTeams.mockRejectedValue(new Error("team.staff-teams: no se pudo leer"));

    await expect(getTeamScope(CTX)).rejects.toThrow("no se pudo leer");
  });
});

describe("activeTeamCookiePath", () => {
  it("es la raíz del club: la cookie no sale de él", () => {
    expect(activeTeamCookiePath("club-a")).toBe("/c/club-a");
  });
});
