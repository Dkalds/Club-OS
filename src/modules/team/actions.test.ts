import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  requireClub: vi.fn(),
  listMyTeams: vi.fn(),
  revalidatePath: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({ requireClub: mocks.requireClub }));
vi.mock("./queries", () => ({ listMyTeams: mocks.listMyTeams }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.set, delete: mocks.remove, get: () => undefined }),
}));

import { setActiveTeam } from "./actions";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TEAM_A = "00000000-0000-4000-8000-0000000000a1";
const TEAM_B = "00000000-0000-4000-8000-0000000000b1";
const NOT_MINE = "00000000-0000-4000-8000-0000000000c1";
const NOT_FOUND = new Error("NEXT_HTTP_ERROR_FALLBACK;404");

const team = (id: string, name: string) => ({ id, name, categoryName: "Categoría", seasonName: "2026/27" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireClub.mockResolvedValue(clubContext("coach"));
  mocks.listMyTeams.mockResolvedValue([team(TEAM_A, "Equipo A"), team(TEAM_B, "Equipo B")]);
});

describe("setActiveTeam", () => {
  it("elegir uno de mis equipos deja la cookie del club y vuelve a pedir la app", async () => {
    const result = await setActiveTeam("club-a", { teamId: TEAM_B });

    expect(result).toEqual({ ok: true, data: null });
    expect(mocks.set).toHaveBeenCalledWith("active-team", TEAM_B, {
      path: "/c/club-a",
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 31_536_000,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/c/[club]/(app)", "layout");
  });

  it("la cookie va bajo el club del contexto, no bajo el texto que llega", async () => {
    await setActiveTeam("CLUB-A", { teamId: TEAM_A });

    expect(mocks.set.mock.calls[0]?.[2]).toMatchObject({ path: "/c/club-a" });
  });

  it("un equipo que no es mío es NOT_FOUND y no deja cookie", async () => {
    const result = await setActiveTeam("club-a", { teamId: NOT_MINE });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("quien no tiene equipos (un jugador, una familia) no puede elegir ninguno", async () => {
    mocks.requireClub.mockResolvedValue(clubContext("player"));
    mocks.listMyTeams.mockResolvedValue([]);

    expect(await setActiveTeam("club-a", { teamId: TEAM_A })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("`null` borra la cookie del club, sin leer equipos", async () => {
    const result = await setActiveTeam("club-a", { teamId: null });

    expect(result).toEqual({ ok: true, data: null });
    expect(mocks.remove).toHaveBeenCalledWith({ name: "active-team", path: "/c/club-a" });
    expect(mocks.listMyTeams).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/c/[club]/(app)", "layout");
  });

  it("un id que no es un uuid no consulta el club ni deja cookie", async () => {
    const result = await setActiveTeam("club-a", { teamId: "todos" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { teamId: "No encontramos este contenido." },
    });
    expect(mocks.requireClub).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("un club que no existe lanza el 404, no lo traga", async () => {
    mocks.requireClub.mockRejectedValue(NOT_FOUND);

    await expect(setActiveTeam("club-x", { teamId: TEAM_A })).rejects.toBe(NOT_FOUND);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("si mis equipos no se pueden leer, lanza y no deja cookie", async () => {
    mocks.listMyTeams.mockRejectedValue(new Error("team.staff-teams: no se pudo leer"));

    await expect(setActiveTeam("club-a", { teamId: TEAM_A })).rejects.toThrow("no se pudo leer");
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
