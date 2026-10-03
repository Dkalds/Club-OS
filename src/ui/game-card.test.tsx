import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HomeGame } from "@/modules/home/types";
import { GameCard, teamAbbr } from "./game-card";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const GAME: HomeGame = {
  eventId: "g1",
  teamName: "Equipo A",
  slotLabel: "Sábado 10 oct · 10:30 · Local",
  opponent: "CB Ribera",
  competition: "Liga",
};

describe("teamAbbr", () => {
  it("son las tres primeras letras de la última palabra, en mayúsculas", () => {
    expect(teamAbbr("CB Ribera")).toBe("RIB");
    expect(teamAbbr("Club Demo")).toBe("DEM");
  });

  it("quita los acentos", () => {
    expect(teamAbbr("Ávila")).toBe("AVI");
    expect(teamAbbr("Peña Ñandú")).toBe("NAN");
  });

  it("una palabra de menos de tres letras se queda como está", () => {
    expect(teamAbbr("Zaragoza B")).toBe("B");
  });

  it("ignora espacios de más y signos sueltos", () => {
    expect(teamAbbr("  CB   Ribera  ")).toBe("RIB");
    expect(teamAbbr("CB Ribera -")).toBe("RIB");
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

    expect(screen.getByRole("img", { name: "Equipo A" })).toHaveTextContent("CLB");
    expect(screen.getByRole("img", { name: "CB Ribera" })).toHaveTextContent("RIB");
    // El nombre de cada lado se ve también bajo su avatar.
    expect(screen.getAllByText("Equipo A")).toHaveLength(1);
    expect(screen.getAllByText("CB Ribera")).toHaveLength(1);
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
