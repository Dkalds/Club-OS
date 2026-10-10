import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), listAgenda: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
// Solo la lectura es de pega: los `parse…` son los de verdad.
vi.mock("@/modules/schedule/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/schedule/queries")>()),
  listAgenda: mocks.listAgenda,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import AgendaPage from "./page";

const props = (search: Record<string, string | string[]> = {}) => ({
  params: Promise.resolve({ club: "club-a" }),
  searchParams: Promise.resolve(search),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.listAgenda.mockResolvedValue({ weeks: [], teamCount: 1, truncated: false });
});

describe("/agenda", () => {
  it("sin club, 404 sin leer la agenda", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(AgendaPage(props())).rejects.toThrow("NOT_FOUND");
    expect(mocks.listAgenda).not.toHaveBeenCalled();
  });

  it("el único <h1> es «Agenda»", async () => {
    render(await AgendaPage(props()));

    expect(screen.getAllByRole("heading", { level: 1 }).map((heading) => heading.textContent)).toEqual(["Agenda"]);
  });

  it("sin query, los próximos y todo; la hora es la del servidor", async () => {
    const ctx = clubContext("coach");
    mocks.getClubContext.mockResolvedValue(ctx);

    render(await AgendaPage(props()));

    expect(mocks.listAgenda).toHaveBeenCalledWith(
      ctx,
      { scope: "upcoming", kind: "all" },
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    );
  });

  it("?scope=past y ?kind=game, exactos, cambian la pestaña y el filtro", async () => {
    render(await AgendaPage(props({ scope: "past", kind: "game" })));

    expect(mocks.listAgenda).toHaveBeenCalledWith(expect.anything(), { scope: "past", kind: "game" }, expect.any(String));
  });

  it("un valor que no vale, o el parámetro repetido, cae en lo de por defecto", async () => {
    render(await AgendaPage(props({ scope: ["past", "past"], kind: "todo" })));

    expect(mocks.listAgenda).toHaveBeenCalledWith(
      expect.anything(),
      { scope: "upcoming", kind: "all" },
      expect.any(String),
    );
  });

  it("quien gestiona sesiones y partidos puede añadir", async () => {
    render(await AgendaPage(props()));

    expect(screen.getByRole("button", { name: "Añadir" })).toBeInTheDocument();
  });

  it.each(["player", "guardian"] as const)("un %s no puede añadir nada", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));

    render(await AgendaPage(props()));

    expect(screen.queryByRole("button", { name: "Añadir" })).not.toBeInTheDocument();
  });

  it("si la agenda no se puede leer, lanza: lo recoge `error.tsx`", async () => {
    mocks.listAgenda.mockRejectedValue(new Error("schedule.agenda: no se pudo leer de la base de datos"));

    await expect(AgendaPage(props())).rejects.toThrow("schedule.agenda");
  });
});
