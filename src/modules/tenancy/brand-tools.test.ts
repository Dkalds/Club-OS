import { describe, expect, it } from "vitest";
import { contrastRatio, deriveBrandColors, validateAccent } from "./brand-tools";

describe("contrastRatio", () => {
  it("negro sobre blanco es 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("un color contra sí mismo es 1:1", () => {
    expect(contrastRatio("#5aa9e6", "#5aa9e6")).toBeCloseTo(1, 5);
  });

  it("no importa el orden de los dos colores", () => {
    expect(contrastRatio("#0a0a0b", "#f2eee6")).toBeCloseTo(contrastRatio("#f2eee6", "#0a0a0b"), 5);
  });
});

describe("validateAccent", () => {
  it("algo que no es #rrggbb es FORMAT", () => {
    expect(validateAccent("azul")).toEqual({ ok: false, reason: "FORMAT" });
    expect(validateAccent("#fff")).toEqual({ ok: false, reason: "FORMAT" });
  });

  it("un acento claro y saturado que ya cumple: ok", () => {
    // Un azul claro: de sobra 4.5:1 contra bg/surface-1/surface-2, y negro como on-accent.
    expect(validateAccent("#5aa9e6")).toEqual({ ok: true });
  });

  it("un acento oscuro, que no contrasta contra los fondos: CONTRAST, con un tono más claro de la misma tonalidad", () => {
    const result = validateAccent("#1a3550");

    expect(result).toMatchObject({ ok: false, reason: "CONTRAST" });
    if (result.ok || result.reason !== "CONTRAST") return;
    expect(result.suggested).toMatch(/^#[0-9a-f]{6}$/);

    // El tono sugerido sí cumple las dos cosas.
    const resuggested = validateAccent(result.suggested);
    expect(resuggested).toEqual({ ok: true });
  });

  it("el tono sugerido es más claro que el original: más contraste contra el negro", () => {
    const result = validateAccent("#1a3550");
    if (result.ok || result.reason !== "CONTRAST") throw new Error("se esperaba CONTRAST");

    expect(contrastRatio(result.suggested, "#000000")).toBeGreaterThan(contrastRatio("#1a3550", "#000000"));
  });

  it("es determinista: la misma entrada da siempre el mismo resultado", () => {
    expect(validateAccent("#1a3550")).toEqual(validateAccent("#1a3550"));
  });
});

describe("deriveBrandColors", () => {
  it("devuelve el propio acento sin tocarlo", () => {
    expect(deriveBrandColors("#5aa9e6").accent).toBe("#5aa9e6");
  });

  it("el pulsado es más oscuro que el acento", () => {
    const { accent, accentPressed } = deriveBrandColors("#5aa9e6");

    expect(contrastRatio(accentPressed, "#000000")).toBeLessThan(contrastRatio(accent, "#000000"));
  });

  it("on-accent contrasta al menos 4.5:1 contra el acento, para un acento válido", () => {
    const { accent, onAccent } = deriveBrandColors("#5aa9e6");

    expect(contrastRatio(accent, onAccent)).toBeGreaterThanOrEqual(4.5);
  });

  it("accent-soft es oscuro: sirve de fondo, no de texto", () => {
    const { accentSoft } = deriveBrandColors("#5aa9e6");

    expect(contrastRatio(accentSoft, "#000000")).toBeLessThan(3);
  });

  it("es determinista", () => {
    expect(deriveBrandColors("#5aa9e6")).toEqual(deriveBrandColors("#5aa9e6"));
  });
});
