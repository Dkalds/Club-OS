import { describe, expect, it } from "vitest";
import { gameStatusLabel, scoreLabel } from "./format";

describe("scoreLabel", () => {
  it("el propio primero, con raya corta", () => {
    expect(scoreLabel({ for: 61, against: 58 })).toBe("61–58");
  });
});

describe("gameStatusLabel", () => {
  it("cancelado lo dice siempre", () => {
    expect(gameStatusLabel("cancelled", false)).toBe("Cancelado");
    expect(gameStatusLabel("cancelled", true)).toBe("Cancelado");
  });

  it("uno programado que ya empezó y no tiene resultado lo avisa", () => {
    expect(gameStatusLabel("scheduled", true)).toBe("Sin resultado");
  });

  it("uno que aún no ha empezado, o ya jugado, no dice estado", () => {
    expect(gameStatusLabel("scheduled", false)).toBeNull();
    expect(gameStatusLabel("done", true)).toBeNull();
  });
});
