import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logError } from "./log";

const EMAIL = "coach@club-a.test";

let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function authError(message: string, fields: Record<string, unknown>): Error {
  return Object.assign(new Error(message), fields);
}

describe("logError", () => {
  it("escribe una línea con la etiqueta y el nombre, estado y código del error", () => {
    logError(
      "auth.request-code",
      authError("Signups not allowed for otp", {
        name: "AuthApiError",
        status: 422,
        code: "otp_disabled",
      }),
    );

    expect(lines).toEqual(["[auth.request-code] AuthApiError status=422 code=otp_disabled"]);
  });

  it("nunca escribe el mensaje: puede llevar el email, el código o un token", () => {
    logError(
      "auth.request-code",
      authError(`Email address "${EMAIL}" is invalid`, {
        name: "AuthApiError",
        status: 400,
        code: "email_address_invalid",
      }),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain(EMAIL);
    expect(lines[0]).not.toContain("invalid\"");
    expect(lines[0]).toBe("[auth.request-code] AuthApiError status=400 code=email_address_invalid");
  });

  it("descarta un nombre o un código que no parezcan un identificador", () => {
    logError("x", authError("m", { name: `Error de ${EMAIL}`, code: `${EMAIL}\ninyectado` }));

    expect(lines).toEqual(["[x] ? code=?"]);
  });

  it("añade la causa de red cuando la hay", () => {
    logError("auth.session", new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }));

    expect(lines).toEqual(["[auth.session] TypeError cause=ECONNREFUSED"]);
  });

  it("acepta objetos de error que no son Error", () => {
    logError("select-club", { message: `fila de ${EMAIL}`, code: "42501", details: EMAIL });

    expect(lines).toEqual(["[select-club] error code=42501"]);
  });

  it.each([
    ["una cadena", `falló ${EMAIL}`, "[x] string"],
    ["undefined", undefined, "[x] undefined"],
    ["null", null, "[x] null"],
  ])("con %s solo dice de qué tipo es", (_name, value, expected) => {
    logError("x", value);

    expect(lines).toEqual([expected]);
  });
});
