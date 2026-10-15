import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameDetail } from "@/modules/games/types";
import type { EventChange } from "@/modules/schedule/changes";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  getGame: vi.fn(),
  listMyTeams: vi.fn(),
  listVenueNames: vi.fn(),
  listEventChanges: vi.fn(),
}));

// Sin cookie de equipo activo: se ven todos «mis equipos» (`getTeamScope`).
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/games/queries", () => ({ getGame: mocks.getGame }));
vi.mock("@/modules/team/queries", () => ({ listMyTeams: mocks.listMyTeams }));
vi.mock("@/modules/calendar/queries", () => ({ listVenueNames: mocks.listVenueNames }));
vi.mock("@/modules/schedule/changes-queries", () => ({ listEventChanges: mocks.listEventChanges }));
vi.mock("@/modules/games/actions", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (href: string) => {
    throw new Error(`REDIRECT ${href}`);
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import GamePage from "./[eventId]/page";
import EditGamePage from "./[eventId]/edit/page";
import NewGamePage from "./new/page";
import GamesPage from "./page";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const GAME: GameDetail = {
  eventId: "e-1",
  teamId: "t-1",
  teamName: "Equipo A",
  opponent: "CB Rival",
  competition: "Liga",
  homeAway: "home",
  status: "done",
  started: true,
  slotLabel: "Sábado 10 oct · 10:30 · Local",
  dateChip: { dow: "Sáb", day: "10" },
  monthChip: { month: "oct", day: "10" },
  time: "10:30",
  location: "Pabellón",
  score: { for: 61, against: 58 },
  opponentNotes: "Defienden en zona",
  form: { date: "2026-10-10", time: "10:30", durationMinutes: 90 },
};

const props = <P extends Record<string, string>>(params: P, search: Record<string, string> = {}) => ({
  params: Promise.resolve({ club: "club-a", ...params }),
  searchParams: Promise.resolve(search),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getGame.mockResolvedValue(GAME);
  mocks.listMyTeams.mockResolvedValue([{ id: "t-1", name: "Equipo A", categoryName: "C", seasonName: "2026/27" }]);
  mocks.listVenueNames.mockResolvedValue([]);
  mocks.listEventChanges.mockResolvedValue([]);
});

/** El `<datalist>` al que apunta «Lugar»: lo que el campo sugiere al escribir. */
function suggestedPlaces(): string[] {
  const listId = screen.getByLabelText("Lugar").getAttribute("list");
  const list = listId ? document.getElementById(listId) : null;
  return [...(list?.querySelectorAll("option") ?? [])].map((option) => option.value);
}

describe("/games", () => {
  it("sin club, 404: no redirige a nadie", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(GamesPage(props({}))).rejects.toThrow("NOT_FOUND");
  });

  it("la lista de partidos es la de la Agenda, con su filtro puesto", async () => {
    await expect(GamesPage(props({}))).rejects.toThrow("REDIRECT /c/club-a/agenda?kind=game");
  });

  it("?scope=played, la antigua pestaña de jugados, lleva a los anteriores", async () => {
    await expect(GamesPage(props({}, { scope: "played" }))).rejects.toThrow(
      "REDIRECT /c/club-a/agenda?scope=past&kind=game",
    );
  });

  it("cualquier otro valor de scope son los próximos", async () => {
    await expect(GamesPage(props({}, { scope: "otra" }))).rejects.toThrow("REDIRECT /c/club-a/agenda?kind=game");
  });
});

describe("/games/new", () => {
  it("sin permiso, 404 sin leer las pistas", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("player"));

    await expect(NewGamePage(props({}))).rejects.toThrow("NOT_FOUND");
    expect(mocks.listVenueNames).not.toHaveBeenCalled();
  });

  it("«Lugar» sugiere las pistas del club, leídas con su contexto", async () => {
    const ctx = clubContext("coach");
    mocks.getClubContext.mockResolvedValue(ctx);
    mocks.listVenueNames.mockResolvedValue(["Pista 1", "Pista 2"]);

    render(await NewGamePage(props({})));

    expect(mocks.listVenueNames).toHaveBeenCalledWith(ctx);
    expect(suggestedPlaces()).toEqual(["Pista 1", "Pista 2"]);
  });

  it("sin pistas en el club, «Lugar» no sugiere nada", async () => {
    render(await NewGamePage(props({})));

    expect(screen.getByLabelText("Lugar")).not.toHaveAttribute("list");
  });

  it("el formulario con el primer equipo y 90 minutos", async () => {
    render(await NewGamePage(props({})));

    expect(screen.getByRole("heading", { level: 1, name: "Nuevo partido" })).toBeInTheDocument();
    expect(screen.getByLabelText("Duración (min)")).toHaveValue(90);
    expect(screen.getByLabelText("Hora")).toHaveValue("10:00");
  });
});

describe("/games/[eventId]", () => {
  it("el partido con su marcador y, para quien lo gestiona, sus notas y acciones", async () => {
    render(await GamePage(props({ eventId: "e-1" })));

    expect(screen.getByRole("heading", { level: 1, name: "Equipo A contra CB Rival" })).toBeInTheDocument();
    expect(screen.getByText("61 a 58")).toBeInTheDocument();
    expect(screen.getByText("Defienden en zona")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Corregir resultado" })).toBeInTheDocument();
  });

  it("sin permiso de partidos: ni notas del rival ni acciones", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("player"));

    render(await GamePage(props({ eventId: "e-1" })));

    expect(screen.queryByText("Defienden en zona")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("uno que no se ve: 404", async () => {
    mocks.getGame.mockResolvedValue(null);

    await expect(GamePage(props({ eventId: "e-9" }))).rejects.toThrow("NOT_FOUND");
  });

  describe("cambios", () => {
    const CHANGES: EventChange[] = [
      {
        id: "c-2",
        what: "cancelled",
        oldStartsAt: "2026-10-10T08:30:00+00:00",
        oldEndsAt: "2026-10-10T10:00:00+00:00",
        oldLocation: "Pista 1",
        changedAt: "2026-10-08T09:00:00+00:00",
      },
      {
        id: "c-1",
        what: "time",
        oldStartsAt: "2026-10-10T07:00:00+00:00",
        oldEndsAt: "2026-10-10T08:30:00+00:00",
        oldLocation: "Pista 1",
        changedAt: "2026-10-05T09:00:00+00:00",
      },
    ];

    it("lee los cambios del partido de la URL con el contexto del club", async () => {
      const ctx = clubContext("coach");
      mocks.getClubContext.mockResolvedValue(ctx);

      render(await GamePage(props({ eventId: "e-1" })));

      expect(mocks.listEventChanges).toHaveBeenCalledTimes(1);
      expect(mocks.listEventChanges).toHaveBeenCalledWith(ctx, "e-1");
    });

    it("los dice como cambios de un partido, con lo que había antes en el reloj del club y el día del cambio", async () => {
      mocks.listEventChanges.mockResolvedValue(CHANGES);

      render(await GamePage(props({ eventId: "e-1" })));

      expect(screen.getByRole("heading", { level: 2, name: "Cambios" })).toBeInTheDocument();
      const lines = screen
        .getAllByRole("listitem")
        .filter((item) => within(item).queryByText(/^Cambiado el/) !== null)
        .map((item) => [...item.children].map((child) => child.textContent));
      expect(lines).toEqual([
        ["Partido cancelado", "Era: Sábado 10 oct · 10:30–12:00", "Cambiado el jueves 8 oct"],
        ["Cambio de hora", "Antes: Sábado 10 oct · 09:00–10:30", "Cambiado el lunes 5 oct"],
      ]);
    });

    it("sin cambios no hay apartado, pero sí quién lo puede cambiar", async () => {
      render(await GamePage(props({ eventId: "e-1" })));

      expect(screen.queryByRole("heading", { name: "Cambios" })).not.toBeInTheDocument();
      expect(
        screen.getByText("Lo pueden cambiar o cancelar el cuerpo técnico de Equipo A y la dirección."),
      ).toBeInTheDocument();
    });

    it("quien solo lo ve también lee los cambios y quién lo puede cambiar", async () => {
      mocks.getClubContext.mockResolvedValue(clubContext("player"));
      mocks.listEventChanges.mockResolvedValue(CHANGES);

      render(await GamePage(props({ eventId: "e-1" })));

      expect(screen.getByText("Partido cancelado")).toBeInTheDocument();
      expect(
        screen.getByText("Lo pueden cambiar o cancelar el cuerpo técnico de Equipo A y la dirección."),
      ).toBeInTheDocument();
    });

    it("si no se pueden leer, lanza: lo recoge `error.tsx`", async () => {
      mocks.listEventChanges.mockRejectedValue(new Error("schedule.event-changes: no se pudo leer de la base de datos"));

      await expect(GamePage(props({ eventId: "e-1" }))).rejects.toThrow("schedule.event-changes");
    });
  });
});

describe("/games/[eventId]/edit", () => {
  it("uno cancelado no se edita: lo dice", async () => {
    mocks.getGame.mockResolvedValue({ ...GAME, status: "cancelled" });

    render(await EditGamePage(props({ eventId: "e-1" })));

    expect(screen.getByText("Este partido está cancelado y no se puede cambiar.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar partido" })).not.toBeInTheDocument();
  });

  it("el formulario con los datos del partido", async () => {
    render(await EditGamePage(props({ eventId: "e-1" })));

    expect(screen.getByLabelText("Rival")).toHaveValue("CB Rival");
    expect(screen.getByLabelText("Notas del rival")).toHaveValue("Defienden en zona");
  });

  it("«Lugar» conserva el del partido y sugiere las pistas del club", async () => {
    const ctx = clubContext("coach");
    mocks.getClubContext.mockResolvedValue(ctx);
    mocks.listVenueNames.mockResolvedValue(["Pista 1", "Pista 2"]);

    render(await EditGamePage(props({ eventId: "e-1" })));

    expect(mocks.listVenueNames).toHaveBeenCalledWith(ctx);
    expect(screen.getByLabelText("Lugar")).toHaveValue("Pabellón");
    expect(suggestedPlaces()).toEqual(["Pista 1", "Pista 2"]);
  });

  it("sin permiso, 404 sin leer las pistas", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("player"));

    await expect(EditGamePage(props({ eventId: "e-1" }))).rejects.toThrow("NOT_FOUND");
    expect(mocks.listVenueNames).not.toHaveBeenCalled();
  });
});
