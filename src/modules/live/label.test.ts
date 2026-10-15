import { describe, expect, it } from "vitest";
import { liveEntry } from "./label";

describe("liveEntry", () => {
  it("sin empezar: «Iniciar entrenamiento», sin más", () => {
    expect(liveEntry({ started: false, position: null }, 5)).toEqual({
      label: "Iniciar entrenamiento",
      caption: null,
    });
  });

  it("sin empezar, una posición suelta no cuenta", () => {
    expect(liveEntry({ started: false, position: 3 }, 5).label).toBe("Iniciar entrenamiento");
  });

  it("en curso: «Continuar entrenamiento» y el ejercicio por el que va, contando desde 1", () => {
    expect(liveEntry({ started: true, position: 2 }, 5)).toEqual({
      label: "Continuar entrenamiento",
      caption: "Ejercicio 3 de 5",
    });
  });

  it("en curso y sin posición guardada: el primero", () => {
    expect(liveEntry({ started: true, position: null }, 4).caption).toBe("Ejercicio 1 de 4");
  });

  it("una posición más allá del último ejercicio se acota al último", () => {
    expect(liveEntry({ started: true, position: 9 }, 3).caption).toBe("Ejercicio 3 de 3");
  });

  it("sin ejercicios no hay nada que contar", () => {
    expect(liveEntry({ started: true, position: 0 }, 0).caption).toBeNull();
  });
});
