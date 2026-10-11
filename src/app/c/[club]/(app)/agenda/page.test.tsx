import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecentChange } from "@/modules/schedule/changes";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), listAgenda: vi.fn(), listRecentChanges: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
// Solo la lectura es de pega: los `parse…` son los de verdad.
vi.mock("@/modules/schedule/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/schedule/queries")>()),
  listAgenda: mocks.listAgenda,
}));
vi.mock("@/modules/schedule/changes-queries", () => ({ listRecentChanges: mocks.listRecentChanges }));
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

const EVENT = "00000000-0000-4000-8000-000000000041";

/** Un evento que ha cambiado hace poco, como lo entrega `listRecentChanges`. */
const CHANGE: RecentChange = {
  eventId: EVENT,
  href: `/c/club-a/train/${EVENT}`,
  label: "Cambio de hora",
  title: "Sesión A",
  subtitle: "Martes 13 oct · 19:00–20:15 · Sesión A",
  cancelled: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.listAgenda.mockResolvedValue({ weeks: [], teamCount: 1, truncated: false });
  mocks.listRecentChanges.mockResolvedValue({ items: [], more: 0 });
});

describe("/agenda", () => {
  it("sin club, 404 sin leer la agenda ni los cambios", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(AgendaPage(props())).rejects.toThrow("NOT_FOUND");
    expect(mocks.listAgenda).not.toHaveBeenCalled();
    expect(mocks.listRecentChanges).not.toHaveBeenCalled();
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

  describe("cambios recientes", () => {
    it("en «Próximos» pide los cinco últimos con el contexto y la misma hora que la agenda", async () => {
      const ctx = clubContext("coach");
      mocks.getClubContext.mockResolvedValue(ctx);

      render(await AgendaPage(props()));

      expect(mocks.listRecentChanges).toHaveBeenCalledTimes(1);
      const [agendaCall] = mocks.listAgenda.mock.calls;
      expect(mocks.listRecentChanges).toHaveBeenCalledWith(ctx, agendaCall?.[2], 5);
    });

    it("los pinta encima de la lista, cada uno con su enlace, lo que le ha pasado y cuándo es ahora", async () => {
      mocks.listRecentChanges.mockResolvedValue({ items: [CHANGE], more: 0 });

      render(await AgendaPage(props()));

      const heading = screen.getByRole("heading", { level: 2, name: "Cambios recientes" });
      const row = screen.getByRole("link", { name: /Cambio de hora/ });
      expect(row).toHaveAttribute("href", `/c/club-a/train/${EVENT}`);
      expect(row).toHaveTextContent("Martes 13 oct · 19:00–20:15 · Sesión A");
      // Encima de la lista: antes que las pestañas de la Agenda.
      const tabs = screen.getByRole("link", { name: "Anteriores" });
      expect(heading.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("con más de los que caben lo dice sin enlace: ya se está en la Agenda", async () => {
      mocks.listRecentChanges.mockResolvedValue({ items: [CHANGE], more: 2 });

      render(await AgendaPage(props()));

      expect(screen.getByText("Y 2 más, más adelante en el calendario.")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Ver 2 más/ })).not.toBeInTheDocument();
    });

    it("sin cambios no hay apartado", async () => {
      render(await AgendaPage(props()));

      expect(screen.queryByRole("heading", { name: "Cambios recientes" })).not.toBeInTheDocument();
    });

    it("en «Anteriores» no se piden ni se pintan: son de lo que viene", async () => {
      mocks.listRecentChanges.mockResolvedValue({ items: [CHANGE], more: 0 });

      render(await AgendaPage(props({ scope: "past" })));

      expect(mocks.listRecentChanges).not.toHaveBeenCalled();
      expect(screen.queryByRole("heading", { name: "Cambios recientes" })).not.toBeInTheDocument();
    });

    it("con un filtro de tipo se siguen pidiendo: el filtro es de la lista", async () => {
      render(await AgendaPage(props({ kind: "game" })));

      expect(mocks.listRecentChanges).toHaveBeenCalledTimes(1);
    });

    it("si no se pueden leer, lanza: lo recoge `error.tsx`", async () => {
      mocks.listRecentChanges.mockRejectedValue(new Error("schedule.recent-changes: no se pudo leer de la base de datos"));

      await expect(AgendaPage(props())).rejects.toThrow("schedule.recent-changes");
    });
  });

  it("si la agenda no se puede leer, lanza: lo recoge `error.tsx`", async () => {
    mocks.listAgenda.mockRejectedValue(new Error("schedule.agenda: no se pudo leer de la base de datos"));

    await expect(AgendaPage(props())).rejects.toThrow("schedule.agenda");
  });
});
