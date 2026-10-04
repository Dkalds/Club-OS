import { describe, expect, it } from "vitest";
import { builderMinutes, itemNumber, itemsLabel, minutesLabel, practiceMeta, statusLabel } from "./format";

describe("minutesLabel", () => {
  it("pone la unidad tras el número", () => {
    expect(minutesLabel(75)).toBe("75 min");
  });
});

describe("builderMinutes", () => {
  it("usa la prima, como el constructor", () => {
    expect(builderMinutes(15)).toBe("15'");
  });
});

describe("itemsLabel", () => {
  it("sin ejercicios dice que no hay todavía", () => {
    expect(itemsLabel(0)).toBe("Sin ejercicios todavía");
  });

  it("con uno lo dice en singular", () => {
    expect(itemsLabel(1)).toBe("1 ejercicio");
  });

  it("con varios lo dice en plural", () => {
    expect(itemsLabel(5)).toBe("5 ejercicios");
  });
});

describe("practiceMeta", () => {
  const practice = { totalMinutes: 75, itemCount: 5, location: "Pabellón 2" };

  it("junta duración, ejercicios y lugar con el separador de campos", () => {
    expect(practiceMeta(practice)).toBe("75 min · 5 ejercicios · Pabellón 2");
  });

  it("sin lugar no deja un separador colgando", () => {
    expect(practiceMeta({ ...practice, location: null })).toBe("75 min · 5 ejercicios");
  });

  it("un lugar en blanco cuenta como sin lugar", () => {
    expect(practiceMeta({ ...practice, location: "   " })).toBe("75 min · 5 ejercicios");
  });

  it("sin ejercicios lo dice en el segundo campo", () => {
    expect(practiceMeta({ ...practice, itemCount: 0 })).toBe(
      "75 min · Sin ejercicios todavía · Pabellón 2",
    );
  });
});

describe("itemNumber", () => {
  it("numera desde 01 a partir del índice 0", () => {
    expect(itemNumber(0)).toBe("01");
    expect(itemNumber(8)).toBe("09");
    expect(itemNumber(9)).toBe("10");
  });
});

describe("statusLabel", () => {
  it("nombra los estados que no son lo normal", () => {
    expect(statusLabel("done")).toBe("Hecho");
    expect(statusLabel("cancelled")).toBe("Cancelada");
  });

  it("un entrenamiento programado no lleva etiqueta", () => {
    expect(statusLabel("scheduled")).toBeNull();
  });
});
