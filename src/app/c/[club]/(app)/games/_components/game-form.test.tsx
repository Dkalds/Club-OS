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

  it("un fallo con campos los marca", async () => {
    mocks.createGame.mockResolvedValue({ ok: false, error: "INVALID", fieldErrors: { opponent: "Escribe el rival." } });
    render(<GameForm clubSlug="club-a" teams={[{ id: "t-1", name: "Equipo A" }]} initial={INITIAL} />);

    fireEvent.click(screen.getByRole("button", { name: "Crear partido" }));

    expect(await screen.findByText("Escribe el rival.")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
