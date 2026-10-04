import { describe, expect, it } from "vitest";
import { drillHeader, drillMeta, formatAge } from "./format";
import type { DrillSummary } from "./types";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
function summary(overrides: Partial<DrillSummary> = {}): DrillSummary {
  return {
    id: "drill-a",
    title: "Ejercicio de prueba",
    status: "published",
    createdBy: null,
    minAge: 12,
    maxAge: null,
    minPlayers: 6,
    maxPlayers: 12,
    minMinutes: 10,
    maxMinutes: 15,
    focus: [],
    ...overrides,
  };
}

describe("formatAge", () => {
  it.each([
    [12, null, "U12+"],
    [10, 14, "U10–U14"],
    [12, 12, "U12"],
    [8, 18, "U8–U18"],
    [18, null, "U18+"],
  ] as const)("formatAge(%i, %s) === %s", (min, max, expected) => {
    expect(formatAge(min, max)).toBe(expected);
  });

  it("el rango lleva raya corta, no guion", () => {
    expect(formatAge(10, 14)).toBe("U10–U14");
  });
});

describe("drillMeta", () => {
  it("edad abierta y rangos: «U12+ · 6–12 jug. · 10–15 min»", () => {
    expect(drillMeta(summary())).toBe("U12+ · 6–12 jug. · 10–15 min");
  });

  it("con rangos iguales enseña un solo número", () => {
    const d = summary({ minAge: 10, maxAge: null, minPlayers: 8, maxPlayers: 8, minMinutes: 12, maxMinutes: 12 });

    expect(drillMeta(d)).toBe("U10+ · 8 jug. · 12 min");
  });

  it("con edad acotada enseña el rango de categorías", () => {
    expect(drillMeta(summary({ minAge: 10, maxAge: 14 }))).toBe("U10–U14 · 6–12 jug. · 10–15 min");
    expect(drillMeta(summary({ minAge: 12, maxAge: 12 }))).toBe("U12 · 6–12 jug. · 10–15 min");
  });

  it("cada rango se resuelve por separado", () => {
    expect(drillMeta(summary({ minPlayers: 8, maxPlayers: 8 }))).toBe("U12+ · 8 jug. · 10–15 min");
    expect(drillMeta(summary({ minMinutes: 20, maxMinutes: 20 }))).toBe("U12+ · 6–12 jug. · 20 min");
  });

  it("separa con espacio, punto medio y espacio, y los rangos con raya corta", () => {
    expect(drillMeta(summary())).toBe(["U12+", "6–12 jug.", "10–15 min"].join(" · "));
  });
});

describe("drillHeader", () => {
  it("la cabecera de la ficha usa las palabras enteras", () => {
    expect(drillHeader(summary())).toEqual({
      age: "U12+",
      players: "6–12 jugadores",
      minutes: "10–15 minutos",
    });
  });

  it("con 1 y 1 usa el singular", () => {
    const d = summary({ minPlayers: 1, maxPlayers: 1, minMinutes: 1, maxMinutes: 1 });

    expect(drillHeader(d)).toEqual({ age: "U12+", players: "1 jugador", minutes: "1 minuto" });
  });

  it("con rangos iguales de más de uno usa el plural sin rango", () => {
    const d = summary({ minPlayers: 8, maxPlayers: 8, minMinutes: 12, maxMinutes: 12 });

    expect(drillHeader(d)).toEqual({ age: "U12+", players: "8 jugadores", minutes: "12 minutos" });
  });

  it("un rango que empieza en 1 sigue en plural", () => {
    const d = summary({ minPlayers: 1, maxPlayers: 4, minMinutes: 1, maxMinutes: 5 });

    expect(drillHeader(d)).toEqual({ age: "U12+", players: "1–4 jugadores", minutes: "1–5 minutos" });
  });

  it("la edad acotada sale como rango de categorías", () => {
    expect(drillHeader(summary({ minAge: 10, maxAge: 14 })).age).toBe("U10–U14");
  });
});
