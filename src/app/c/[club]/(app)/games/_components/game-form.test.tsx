import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createGame: vi.fn(), updateGame: vi.fn(), push: vi.fn() }));
vi.mock("@/modules/games/actions", () => ({ createGame: mocks.createGame, updateGame: mocks.updateGame }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));

import { GameForm, type GameFormValues } from "./game-form";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const INITIAL: GameFormValues = {
  teamId: "t-1",
  opponent: "",
  date: "2026-10-10",
  time: "10:00",
  durationMinutes: "90",
  homeAway: "",
  competition: "",
  location: "",
  opponentNotes: "",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createGame.mockResolvedValue({ ok: true, data: { eventId: "e-9" } });
  mocks.updateGame.mockResolvedValue({ ok: true, data: null });
});

describe("GameForm", () => {
  it("crear: manda el partido con la duración como número y va a su detalle", async () => {
    render(<GameForm clubSlug="club-a" teams={[{ id: "t-1", name: "Equipo A" }]} initial={INITIAL} />);

    expect(screen.queryByLabelText("Equipo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Notas del rival")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Rival"), { target: { value: "CB Rival" } });
    fireEvent.change(screen.getByLabelText("Local o visitante"), { target: { value: "home" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear partido" }));

    await waitFor(() =>
      expect(mocks.createGame).toHaveBeenCalledWith("club-a", {
        teamId: "t-1",
        opponent: "CB Rival",
        date: "2026-10-10",
        time: "10:00",
        durationMinutes: 90,
        homeAway: "home",
        competition: "",
        location: "",
      }),
    );
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/c/club-a/games/e-9"));
  });

  it("con varios equipos pregunta por el equipo", () => {
    render(
      <GameForm
        clubSlug="club-a"
        teams={[
          { id: "t-1", name: "Equipo A" },
          { id: "t-2", name: "Equipo B" },
        ]}
        initial={INITIAL}
      />,
    );

    expect(screen.getByLabelText("Equipo")).toHaveValue("t-1");
  });

  it("editar: lleva las notas del rival y guarda con el id del partido", async () => {
    render(<GameForm clubSlug="club-a" teams={[]} initial={{ ...INITIAL, opponent: "CB Rival" }} eventId="e-1" />);

    fireEvent.change(screen.getByLabelText("Notas del rival"), { target: { value: "Zona 2-3" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar partido" }));

    await waitFor(() =>
      expect(mocks.updateGame).toHaveBeenCalledWith("club-a", expect.objectContaining({ eventId: "e-1", opponentNotes: "Zona 2-3" })),
    );
  });

  describe("«Lugar» sugiere las pistas del club", () => {
    const TEAMS = [{ id: "t-1", name: "Equipo A" }];

    /** Lo que sugiere «Lugar»: las opciones del `<datalist>` al que apunta su `list`. */
    function suggestedPlaces(): string[] | null {
      const listId = screen.getByLabelText("Lugar").getAttribute("list");
      const list = listId ? document.getElementById(listId) : null;
      return list ? [...list.querySelectorAll("option")].map((option) => option.value) : null;
    }

    it("con pistas, las ofrece al escribir, en el orden en que llegan", () => {
      render(<GameForm clubSlug="club-a" teams={TEAMS} initial={INITIAL} venues={["Pista 1", "Pista 2"]} />);

      expect(suggestedPlaces()).toEqual(["Pista 1", "Pista 2"]);
    });

    it("sugiere, no obliga: un partido fuera se juega donde sea, y ese lugar es el que se manda", async () => {
      render(<GameForm clubSlug="club-a" teams={TEAMS} initial={INITIAL} venues={["Pista 1"]} />);

      fireEvent.change(screen.getByLabelText("Rival"), { target: { value: "CB Rival" } });
      fireEvent.change(screen.getByLabelText("Lugar"), { target: { value: "Pabellón del rival" } });
      fireEvent.click(screen.getByRole("button", { name: "Crear partido" }));

      await waitFor(() =>
        expect(mocks.createGame).toHaveBeenCalledWith("club-a", expect.objectContaining({ location: "Pabellón del rival" })),
      );
    });

    it("ningún otro campo sugiere nada", () => {
      const { container } = render(
        <GameForm clubSlug="club-a" teams={TEAMS} initial={INITIAL} venues={["Pista 1", "Pista 2"]} />,
      );

      expect(container.querySelectorAll("datalist")).toHaveLength(1);
      expect(screen.getByLabelText("Rival")).not.toHaveAttribute("list");
    });

    it.each([
      ["sin pistas en el club", []],
      ["sin que la página las pase", undefined],
    ] as Array<[string, string[] | undefined]>)("%s, «Lugar» es un campo de texto sin más", (_case, venues) => {
      const { container } = render(<GameForm clubSlug="club-a" teams={TEAMS} initial={INITIAL} venues={venues} />);

      expect(suggestedPlaces()).toBeNull();
      expect(container.querySelector("datalist")).toBeNull();
    });

    it("al editar también: «Lugar» conserva el del partido y sugiere las pistas", () => {
      render(
        <GameForm
          clubSlug="club-a"
          teams={[]}
          initial={{ ...INITIAL, opponent: "CB Rival", location: "Pabellón" }}
          eventId="e-1"
          venues={["Pista 1"]}
        />,
      );

      expect(screen.getByLabelText("Lugar")).toHaveValue("Pabellón");
      expect(suggestedPlaces()).toEqual(["Pista 1"]);
    });
  });

  it("un fallo con campos los marca", async () => {
    mocks.createGame.mockResolvedValue({ ok: false, error: "INVALID", fieldErrors: { opponent: "Escribe el rival." } });
    render(<GameForm clubSlug="club-a" teams={[{ id: "t-1", name: "Equipo A" }]} initial={INITIAL} />);

    fireEvent.click(screen.getByRole("button", { name: "Crear partido" }));

    expect(await screen.findByText("Escribe el rival.")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
