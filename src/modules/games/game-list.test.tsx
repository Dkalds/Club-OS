import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GameList } from "./game-list";
import type { GameListItem } from "./types";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const GAME: GameListItem = {
  eventId: "e-1",
  teamId: "t-1",
  teamName: "Equipo A",
  opponent: "CB Rival",
  competition: "Liga",
  homeAway: "home",
  status: "scheduled",
  started: false,
  slotLabel: "Sábado 10 oct · 10:30 · Local",
  dateChip: { dow: "Sáb", day: "10" },
  monthChip: { month: "oct", day: "10" },
  time: "10:30",
  location: null,
  score: null,
};

function renderList(props: Partial<Parameters<typeof GameList>[0]> = {}) {
  return render(
    <GameList clubSlug="club-a" scope="upcoming" games={[GAME]} teamCount={1} canCreate role="coach" truncated={false} {...props} />,
  );
}

describe("GameList", () => {
  it("con permiso, «Nuevo partido» es la acción principal; las pestañas dicen cuál está abierta", () => {
    renderList();

    expect(screen.getByRole("link", { name: "Nuevo partido" })).toHaveAttribute("href", "/c/club-a/games/new");
    const tabs = within(screen.getByRole("navigation", { name: "Partidos" }));
    expect(tabs.getByRole("link", { name: "Próximos" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "Jugados" })).toHaveAttribute("href", "/c/club-a/games?scope=played");
  });

  it("una fila por partido: el rival, local y competición, y la hora; lleva a su detalle", () => {
    renderList();

    const row = screen.getByRole("link", { name: /CB Rival/ });
    expect(row).toHaveAttribute("href", "/c/club-a/games/e-1");
    expect(row).toHaveTextContent("Local · Liga");
    expect(row).toHaveTextContent("10:30");
    expect(row).toHaveTextContent("Sáb");
  });

  it("con varios equipos, la fila empieza por el equipo", () => {
    renderList({ teamCount: 2 });

    expect(screen.getByRole("link", { name: /CB Rival/ })).toHaveTextContent("Equipo A · Local · Liga");
  });

  it("en jugados: el mes en el chip y el marcador, que se lee también al oído", () => {
    renderList({ scope: "played", games: [{ ...GAME, status: "done", started: true, score: { for: 61, against: 58 } }] });

    const row = screen.getByRole("link", { name: /CB Rival/ });
    expect(row).toHaveTextContent("oct");
    expect(within(row).getByText("61–58")).toHaveAttribute("aria-hidden", "true");
    expect(within(row).getByText("61 a 58")).toHaveClass("sr-only");
  });

  it("cancelado o sin resultado lo dice", () => {
    renderList({
      scope: "played",
      games: [
        { ...GAME, eventId: "e-1", status: "cancelled" },
        { ...GAME, eventId: "e-2", opponent: "Otro", started: true },
      ],
    });

    expect(screen.getByRole("link", { name: /CB Rival/ })).toHaveTextContent("Cancelado");
    expect(screen.getByRole("link", { name: /Otro/ })).toHaveTextContent("Sin resultado");
  });

  it("sin partidos, lo dice y ofrece la otra pestaña", () => {
    renderList({ games: [] });

    expect(screen.getByRole("heading", { name: "No hay partidos programados" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver jugados" })).toBeInTheDocument();
  });

  it("sin equipos, el estado de «mis equipos» y nada más", () => {
    renderList({ teamCount: 0, games: [] });

    expect(screen.getByRole("heading", { name: "Aún no estás en ningún equipo" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nuevo partido" })).not.toBeInTheDocument();
  });

  it("sin permiso no hay «Nuevo partido»", () => {
    renderList({ canCreate: false });

    expect(screen.queryByRole("link", { name: "Nuevo partido" })).not.toBeInTheDocument();
  });

  it("si hay más de 50, lo dice", () => {
    renderList({ truncated: true });

    expect(screen.getByText("Mostrando los 50 más recientes")).toBeInTheDocument();
  });
});
