import { describe, expect, it } from "vitest";
import {
  builderMinutes,
  itemNumber,
  itemsLabel,
  minutesLabel,
  practiceMeta,
  practiceRowSubtitle,
  statusLabel,
} from "./format";
import type { PracticeListItem } from "./types";

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

describe("practiceRowSubtitle", () => {
  const practice: PracticeListItem = {
    eventId: "e-1",
    teamName: "Equipo A",
    dow: "Mar",
    day: "6",
    month: "",
    time: "18:00",
    title: "Salida de presión",
    totalMinutes: 75,
    itemCount: 5,
    status: "scheduled",
    location: "Pabellón 2",
  };

  it("con un solo equipo no repite su nombre: son los metadatos de la sesión", () => {
    expect(practiceRowSubtitle(practice, 1)).toBe("75 min · 5 ejercicios · Pabellón 2");
  });

  it("con varios equipos empieza por el de la sesión", () => {
    expect(practiceRowSubtitle(practice, 2)).toBe("Equipo A · 75 min · 5 ejercicios · Pabellón 2");
  });

  it("con varios equipos pero sin nombre para esa sesión, no deja un separador colgando", () => {
    expect(practiceRowSubtitle({ ...practice, teamName: "  " }, 3)).toBe("75 min · 5 ejercicios · Pabellón 2");
  });

  it("sin lugar tampoco", () => {
    expect(practiceRowSubtitle({ ...practice, location: null }, 2)).toBe("Equipo A · 75 min · 5 ejercicios");
  });
});
