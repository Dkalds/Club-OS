import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  generateLoginCode: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("./login-code", () => ({ generateLoginCode: mocks.generateLoginCode }));
vi.mock("./admin-client", () => ({
  loadEnvLocal: vi.fn(),
  readSupabaseEnv: () => ({ url: "http://127.0.0.1:54321", serviceRoleKey: "service-key" }),
}));

import { signInAs } from "./user-client";

// `signInAs` es lo que usan los tests de integración para actuar como un usuario del seed. La
// parte que importa de verdad (que la sesión es la de ese usuario y que RLS la respeta) la
// prueban los propios tests de integración; aquí se fijan las reglas del helper: nunca crea
// cuentas, nunca usa la clave de servicio para el cliente que devuelve y falla alto.

const EMAIL = "alguien@club-a.test";
const SESSION = { access_token: "jwt", user: { email: EMAIL } };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  mocks.generateLoginCode.mockResolvedValue("123456");
  mocks.verifyOtp.mockResolvedValue({ data: { session: SESSION, user: SESSION.user }, error: null });
  mocks.createClient.mockReturnValue({ auth: { verifyOtp: mocks.verifyOtp } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signInAs", () => {
  it("entra con el código que da generateLoginCode y devuelve el cliente con la sesión", async () => {
    const client = await signInAs(EMAIL);

    expect(mocks.generateLoginCode).toHaveBeenCalledWith(EMAIL);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "email" });
    expect(client).toBe(mocks.createClient.mock.results[0].value);
  });

  it("el cliente usa la clave publicable, nunca la de servicio, y no guarda sesión", async () => {
    await signInAs(EMAIL);

    expect(mocks.createClient).toHaveBeenCalledTimes(1);
    expect(mocks.createClient).toHaveBeenCalledWith("http://127.0.0.1:54321", "publishable-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  it("cada llamada devuelve un cliente nuevo: dos usuarios no comparten sesión", async () => {
    mocks.createClient.mockImplementation(() => ({ auth: { verifyOtp: mocks.verifyOtp } }));

    const first = await signInAs(EMAIL);
    const second = await signInAs("otra@club-a.test");

    expect(first).not.toBe(second);
  });

  it("con un email sin cuenta falla antes de crear ningún cliente: nunca crea cuentas", async () => {
    mocks.generateLoginCode.mockRejectedValue(
      new Error(`No existe ningún usuario ${EMAIL}. Siembra primero con \`pnpm seed\`.`),
    );

    await expect(signInAs(EMAIL)).rejects.toThrow(/No existe ningún usuario.*pnpm seed/);

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("si verifyOtp falla, lanza un error que nombra al usuario y no lleva el código", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { message: "Token has expired" } });

    const error = await signInAs(EMAIL).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    // El mensaje entero: ni el código de 6 dígitos ni la sesión salen en un log de CI.
    expect((error as Error).message).toBe(`No se pudo entrar como ${EMAIL}: Token has expired`);
  });

  it("si verifyOtp no devuelve sesión, no entrega un cliente anónimo", async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: null });

    await expect(signInAs(EMAIL)).rejects.toThrow(`No se pudo entrar como ${EMAIL}`);
  });

  it("sin la clave publicable en el entorno, lo dice por su nombre y no pide ningún código", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    await expect(signInAs(EMAIL)).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);

    expect(mocks.generateLoginCode).not.toHaveBeenCalled();
  });
});
