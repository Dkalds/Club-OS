import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HomeGame } from "@/modules/home/types";
import { GameCard, teamAbbr } from "./game-card";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const GAME: HomeGame = {
  eventId: "g1",
  teamName: "Equipo A",
  slotLabel: "Sábado 10 oct · 10:30 · Local",
  opponent: "CB Rival",
  competition: "Liga",
};

describe("teamAbbr", () => {
  it("son las tres primeras letras de la última palabra, en mayúsculas", () => {
    expect(teamAbbr("CB Rival")).toBe("RIV");
    expect(teamAbbr("Club Norte")).toBe("NOR");
  });

  it("quita los acentos", () => {
    expect(teamAbbr("Ávila")).toBe("AVI");
    expect(teamAbbr("Peña Ñandú")).toBe("NAN");
  });

  it("una palabra de menos de tres letras se queda como está", () => {
    expect(teamAbbr("Zaragoza B")).toBe("B");
  });

  it("ignora espacios de más y signos sueltos", () => {
    expect(teamAbbr("  CB   Rival  ")).toBe("RIV");
    expect(teamAbbr("CB Rival -")).toBe("RIV");
  });

  it("un texto en blanco o sin letras devuelve «?»", () => {
    expect(teamAbbr("  ")).toBe("?");
    expect(teamAbbr("")).toBe("?");
    expect(teamAbbr("- .")).toBe("?");
  });
});

describe("GameCard", () => {
  it("muestra el kicker, «vs» y el momento del partido", () => {
    render(<GameCard game={GAME} ownShortName="CLB" />);

    expect(screen.getByText("Próximo partido")).toBeInTheDocument();
    expect(screen.getByText("vs")).toBeInTheDocument();
    expect(screen.getByText("Sábado 10 oct · 10:30 · Local")).toBeInTheDocument();
  });

  it("el lado propio lleva su sigla y el nombre del equipo; el rival, su abreviatura y su nombre", () => {
    render(<GameCard game={GAME} ownShortName="CLB" />);

    expect(screen.getByText("CLB")).toHaveClass("text-brand-accent");
    expect(screen.getByText("RIV")).toHaveClass("text-ink");
    expect(screen.getAllByText("Equipo A")).toHaveLength(1);
    expect(screen.getAllByText("CB Rival")).toHaveLength(1);
  });

  it("cada equipo se anuncia una sola vez: los avatares son decorativos", () => {
    render(<GameCard game={GAME} ownShortName="CLB" />);

    expect(screen.queryAllByRole("img")).toEqual([]);
    expect(screen.getByText("CLB").closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("con otra etiqueta y con marcador: el resultado en lugar de «vs», legible también al oído", () => {
    render(<GameCard game={GAME} ownShortName="CLB" label="Partido" score={{ for: 61, against: 58 }} />);

    expect(screen.getByText("Partido")).toBeInTheDocument();
    expect(screen.queryByText("Próximo partido")).not.toBeInTheDocument();
    expect(screen.queryByText("vs")).not.toBeInTheDocument();
    expect(screen.getByText("61–58")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("61 a 58")).toHaveClass("sr-only");
  });

  it("muestra la competición cuando existe", () => {
    render(<GameCard game={GAME} ownShortName="CLB" />);

    expect(screen.getByText("Liga")).toBeInTheDocument();
  });

  it("sin competición no deja un hueco con texto", () => {
    render(<GameCard game={{ ...GAME, competition: null }} ownShortName="CLB" />);

    expect(screen.queryByText("Liga")).not.toBeInTheDocument();
    expect(screen.getByText("Próximo partido")).toBeInTheDocument();
  });
});
