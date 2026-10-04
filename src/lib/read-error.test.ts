import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { throwReadError } from "./read-error";

beforeEach(() => {
  mocks.logError.mockReset();
});

describe("throwReadError", () => {
  it("registra el error con su etiqueta y lanza uno propio que solo dice qué no se pudo hacer", () => {
    const failure = { name: "PostgrestError", code: "42501", message: "fila de ana@club-a.test" };

    let thrown: unknown;
    try {
      throwReadError("modulo.lectura", failure);
    } catch (error) {
      thrown = error;
    }

    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith("modulo.lectura", failure);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("modulo.lectura: no se pudo leer de la base de datos");
    // Ni el mensaje del error de la base de datos ni el error como causa: pueden llevar datos.
    expect((thrown as Error).message).not.toContain("ana@");
    expect((thrown as Error).cause).toBeUndefined();
  });
});
