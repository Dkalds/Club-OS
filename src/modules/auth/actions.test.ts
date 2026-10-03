import { beforeEach, describe, expect, it, vi } from "vitest";

// Emails neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const EMAIL = "coach@club-a.test";
const CODE_SENT = "Si tu email tiene acceso, te hemos enviado un código de 6 dígitos.";
const INVALID_EMAIL = "Escribe un email válido.";
const INVALID_CODE = "El código no es válido o ha caducado. Pide uno nuevo.";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAnonClient: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
  createAnonClient: mocks.createAnonClient,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requestLoginCode, verifyLoginCode, type LoginState } from "./actions";

/** Como el `redirect()` real: corta la ejecución lanzando. */
class RedirectSignal extends Error {
  constructor(readonly path: string) {
    super(`NEXT_REDIRECT ${path}`);
  }
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const emailStep: LoginState = { step: "email" };
const codeStep: LoginState = { step: "code", email: EMAIL };

beforeEach(() => {
  vi.resetAllMocks();
  // Cada cliente solo sabe hacer lo suyo: si una acción usa el que no toca, el test falla.
  mocks.createAnonClient.mockReturnValue({ auth: { signInWithOtp: mocks.signInWithOtp } });
  mocks.createClient.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp } });
  mocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  mocks.redirect.mockImplementation((path: string) => {
    throw new RedirectSignal(path);
  });
});

describe("requestLoginCode", () => {
  it("pide el código sin crear usuarios", async () => {
    const result = await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: EMAIL,
      options: { shouldCreateUser: false },
    });
    expect(result).toEqual({ step: "code", email: EMAIL, info: CODE_SENT });
  });

  it("misma respuesta si el email no existe", async () => {
    const invited = await requestLoginCode(emailStep, form({ email: EMAIL }));

    mocks.signInWithOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Signups not allowed for otp" },
    });
    const notInvited = await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(notInvited).toEqual(invited);
    expect(notInvited).toEqual({ step: "code", email: EMAIL, info: CODE_SENT });
  });

  it.each([
    ["límite de frecuencia", { message: "email rate limit exceeded", status: 429 }],
    ["error del servicio", { message: "Internal Server Error", status: 500 }],
    ["servicio inalcanzable", { message: "fetch failed", name: "AuthRetryableFetchError" }],
  ])("misma respuesta si Supabase devuelve un error: %s", async (_name, error) => {
    mocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error });

    const result = await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(result).toEqual({ step: "code", email: EMAIL, info: CODE_SENT });
  });

  it("misma respuesta si la petición lanza una excepción", async () => {
    mocks.signInWithOtp.mockRejectedValue(new Error("fetch failed"));

    const result = await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(result).toEqual({ step: "code", email: EMAIL, info: CODE_SENT });
  });

  it("no toca las cookies: pide el código con el cliente sin sesión", async () => {
    // El cliente con cookies guarda y borra cookies de PKCE según exista o no la cuenta:
    // la respuesta dejaría de ser idéntica para quien mire sus cookies.
    await requestLoginCode(emailStep, form({ email: EMAIL }));

    mocks.signInWithOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Signups not allowed for otp" },
    });
    await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(mocks.createAnonClient).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("misma respuesta si no se puede crear el cliente", async () => {
    mocks.createAnonClient.mockImplementation(() => {
      throw new Error("sin configuración");
    });

    const result = await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(result).toEqual({ step: "code", email: EMAIL, info: CODE_SENT });
  });

  it("email inválido", async () => {
    const result = await requestLoginCode(emailStep, form({ email: "no-es-email" }));

    expect(result).toEqual({ step: "email", error: INVALID_EMAIL });
    expect(mocks.createAnonClient).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("sin campo de email responde como email inválido", async () => {
    const result = await requestLoginCode(emailStep, new FormData());

    expect(result).toEqual({ step: "email", error: INVALID_EMAIL });
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("recorta el email y lo pasa a minúsculas", async () => {
    const result = await requestLoginCode(emailStep, form({ email: "  Coach@Club-A.TEST  " }));

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: EMAIL,
      options: { shouldCreateUser: false },
    });
    expect(result).toEqual({ step: "code", email: EMAIL, info: CODE_SENT });
  });
});

describe("verifyLoginCode", () => {
  it("código erróneo", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Token has expired or is invalid" },
    });

    const result = await verifyLoginCode(codeStep, form({ email: EMAIL, code: "123456" }));

    expect(result).toEqual({ step: "code", email: EMAIL, error: INVALID_CODE });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("código correcto", async () => {
    await expect(
      verifyLoginCode(codeStep, form({ email: EMAIL, code: "123456" })),
    ).rejects.toBeInstanceOf(RedirectSignal);

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "email" });
    expect(mocks.redirect).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).toHaveBeenCalledWith("/select-club");
  });

  it.each([
    ["vacío", ""],
    ["corto", "12345"],
    ["largo", "1234567"],
    ["con letras", "12a456"],
    ["con espacios dentro", "123 456"],
    ["con signo", "-12345"],
    ["con dígitos no ASCII", "１２３４５６"],
  ])("un código mal formado no llega a Supabase: %s", async (_name, code) => {
    const result = await verifyLoginCode(codeStep, form({ email: EMAIL, code }));

    expect(result).toEqual({ step: "code", email: EMAIL, error: INVALID_CODE });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sin campo de código responde como código erróneo", async () => {
    const result = await verifyLoginCode(codeStep, form({ email: EMAIL }));

    expect(result).toEqual({ step: "code", email: EMAIL, error: INVALID_CODE });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("acepta el código con espacios alrededor", async () => {
    await expect(
      verifyLoginCode(codeStep, form({ email: EMAIL, code: " 123456 " })),
    ).rejects.toBeInstanceOf(RedirectSignal);

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "email" });
  });

  it("valida de nuevo el email que llega del formulario", async () => {
    const result = await verifyLoginCode(codeStep, form({ email: "no-es-email", code: "123456" }));

    expect(result).toEqual({ step: "email", error: INVALID_EMAIL });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("usa el email del formulario normalizado, no el del estado anterior", async () => {
    await expect(
      verifyLoginCode(
        { step: "code", email: "otra@club-b.test" },
        form({ email: " Coach@Club-A.test ", code: "123456" }),
      ),
    ).rejects.toBeInstanceOf(RedirectSignal);

    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: "123456", type: "email" });
  });

  it("si la verificación lanza una excepción, responde como un código erróneo", async () => {
    mocks.verifyOtp.mockRejectedValue(new Error("fetch failed"));

    const result = await verifyLoginCode(codeStep, form({ email: EMAIL, code: "123456" }));

    expect(result).toEqual({ step: "code", email: EMAIL, error: INVALID_CODE });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
