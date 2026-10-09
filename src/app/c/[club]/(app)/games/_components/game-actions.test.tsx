import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameDetail } from "@/modules/games/types";

const mocks = vi.hoisted(() => ({ recordResult: vi.fn(), cancelGame: vi.fn() }));
vi.mock("@/modules/games/actions", () => mocks);

import { GameActions } from "./game-actions";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const GAME: GameDetail = {
  eventId: "e-1",
  teamId: "t-1",
  teamName: "Equipo A",
  opponent: "CB Rival",
  competition: null,
  homeAway: null,
  status: "scheduled",
  started: true,
  slotLabel: "Sábado 10 oct · 10:30",
  dateChip: { dow: "Sáb", day: "10" },
  monthChip: { month: "oct", day: "10" },
  time: "10:30",
  location: null,
  score: null,
  opponentNotes: null,
  form: { date: "2026-10-10", time: "10:30", durationMinutes: 90 },
};

const renderActions = (game: Partial<GameDetail> = {}) =>
  render(<GameActions clubSlug="club-a" game={{ ...GAME, ...game }} teamLabel="Equipo A" />);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.recordResult.mockResolvedValue({ ok: true, data: null });
  mocks.cancelGame.mockResolvedValue({ ok: true, data: null });
});

describe("GameActions", () => {
  it("uno empezado sin resultado: apuntarlo manda el marcador del club primero", async () => {
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Apuntar resultado" }));
    const sheet = screen.getByRole("dialog", { name: "Resultado" });
    fireEvent.change(within(sheet).getByLabelText("Equipo A"), { target: { value: "61" } });
    fireEvent.change(within(sheet).getByLabelText("CB Rival"), { target: { value: "58" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar resultado" }));

    await waitFor(() =>
      expect(mocks.recordResult).toHaveBeenCalledWith("club-a", { eventId: "e-1", scoreFor: 61, scoreAgainst: 58 }),
    );
  });

  it("uno que no ha empezado no deja apuntar resultado", () => {
    renderActions({ started: false });

    expect(screen.queryByRole("button", { name: /resultado/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Editar partido" })).toHaveAttribute("href", "/c/club-a/games/e-1/edit");
  });

  it("uno jugado ofrece corregir el resultado y ya no se cancela", () => {
    renderActions({ status: "done", score: { for: 61, against: 58 } });

    expect(screen.getByRole("button", { name: "Corregir resultado" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar partido" })).not.toBeInTheDocument();
  });

  it("cancelar pide confirmación", async () => {
    renderActions({ started: false });

    fireEvent.click(screen.getByRole("button", { name: "Cancelar partido" }));
    const dialog = screen.getByRole("alertdialog", { name: "¿Cancelar este partido?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar partido" }));

    await waitFor(() => expect(mocks.cancelGame).toHaveBeenCalledWith("club-a", { eventId: "e-1" }));
  });

  it("uno cancelado no ofrece nada", () => {
    const { container } = renderActions({ status: "cancelled" });

    expect(container).toBeEmptyDOMElement();
  });
});
