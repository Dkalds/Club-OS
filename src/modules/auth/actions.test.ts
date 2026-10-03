import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  after: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
  createAnonClient: mocks.createAnonClient,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/server", () => ({ after: mocks.after }));

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
const codeSent: LoginState = { step: "code", email: EMAIL, info: CODE_SENT };

/** Lo que la acción deja programado con `after()`: Next lo ejecuta tras responder. */
let scheduled: Array<() => unknown>;
/** Líneas escritas en el log del servidor. */
let logged: string[];

/** Hace de Next: ejecuta, ya con la respuesta enviada, lo que quedó programado. */
async function runScheduled(): Promise<void> {
  for (const task of scheduled.splice(0)) await task();
}

beforeEach(() => {
  vi.resetAllMocks();
  scheduled = [];
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  mocks.after.mockImplementation((task: () => unknown) => {
    scheduled.push(task);
  });
  // Cada cliente solo sabe hacer lo suyo: si una acción usa el que no toca, el test falla.
  mocks.createAnonClient.mockReturnValue({ auth: { signInWithOtp: mocks.signInWithOtp } });
  mocks.createClient.mockResolvedValue({ auth: { verifyOtp: mocks.verifyOtp } });
  mocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: null });
  mocks.redirect.mockImplementation((path: string) => {
    throw new RedirectSignal(path);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requestLoginCode", () => {
  it("pide el código sin crear usuarios", async () => {
    const result = await requestLoginCode(emailStep, form({ email: EMAIL }));
    await runScheduled();

    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1);
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: EMAIL,
      options: { shouldCreateUser: false },
    });
    expect(result).toEqual(codeSent);
  });

  it("responde sin esperar a Auth: la petición queda programada para después", async () => {
    // El tiempo de respuesta delataría si la cuenta existe (Auth envía un correo solo a
    // quien está invitado). Con una llamada que no termina nunca, la acción responde igual.
    mocks.signInWithOtp.mockReturnValue(new Promise(() => {}));

    const result = await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(result).toEqual(codeSent);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.createAnonClient).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();

    void scheduled[0]();
    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("misma respuesta si el email no existe", async () => {
    const invited = await requestLoginCode(emailStep, form({ email: EMAIL }));
    await runScheduled();

    mocks.signInWithOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Signups not allowed for otp" },
    });
    const notInvited = await requestLoginCode(emailStep, form({ email: EMAIL }));
    await runScheduled();

    expect(notInvited).toEqual(invited);
    expect(notInvited).toEqual(codeSent);
    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["límite de frecuencia", { message: "email rate limit exceeded", status: 429 }],
    ["error del servicio", { message: "Internal Server Error", status: 500 }],
    ["servicio inalcanzable", { message: "fetch failed", name: "AuthRetryableFetchError" }],
  ])("misma respuesta si Supabase devuelve un error: %s", async (_name, error) => {
    mocks.signInWithOtp.mockResolvedValue({ data: { user: null, session: null }, error });

    const result = await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(result).toEqual(codeSent);
    await expect(runScheduled()).resolves.toBeUndefined();
  });

  it("una llamada a Auth que lanza una excepción queda contenida", async () => {
    mocks.signInWithOtp.mockRejectedValue(new Error("fetch failed"));

    const result = await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(result).toEqual(codeSent);
    await expect(runScheduled()).resolves.toBeUndefined();
    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("no poder crear el cliente también queda contenido", async () => {
    mocks.createAnonClient.mockImplementation(() => {
      throw new Error("sin configuración");
    });

    const result = await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(result).toEqual(codeSent);
    await expect(runScheduled()).resolves.toBeUndefined();
  });

  it("misma respuesta si ni siquiera se puede programar la llamada", async () => {
    mocks.after.mockImplementation(() => {
      throw new Error("after() fuera de una petición");
    });

    const result = await requestLoginCode(emailStep, form({ email: EMAIL }));

    expect(result).toEqual(codeSent);
    expect(logged).toEqual(["[auth.request-code] Error"]);
  });

  it("no toca las cookies: pide el código con el cliente sin sesión", async () => {
    // El cliente con cookies guarda y borra cookies de PKCE según exista o no la cuenta:
    // la respuesta dejaría de ser idéntica para quien mire sus cookies.
    await requestLoginCode(emailStep, form({ email: EMAIL }));
    await runScheduled();

    mocks.signInWithOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Signups not allowed for otp" },
    });
    await requestLoginCode(emailStep, form({ email: EMAIL }));
    await runScheduled();

    expect(mocks.createAnonClient).toHaveBeenCalledTimes(2);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("email inválido", async () => {
    const result = await requestLoginCode(emailStep, form({ email: "no-es-email" }));

    expect(result).toEqual({ step: "email", error: INVALID_EMAIL });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.createAnonClient).not.toHaveBeenCalled();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it("sin campo de email responde como email inválido", async () => {
    const result = await requestLoginCode(emailStep, new FormData());

    expect(result).toEqual({ step: "email", error: INVALID_EMAIL });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("recorta el email y lo pasa a minúsculas", async () => {
    const result = await requestLoginCode(emailStep, form({ email: "  Coach@Club-A.TEST  " }));
    await runScheduled();

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: EMAIL,
      options: { shouldCreateUser: false },
    });
    expect(result).toEqual(codeSent);
  });

  it.each([
    [
      "un error de Auth",
      () =>
        mocks.signInWithOtp.mockResolvedValue({
          data: { user: null, session: null },
          error: Object.assign(new Error(`Email address "${EMAIL}" is invalid`), {
            name: "AuthApiError",
            status: 400,
            code: "email_address_invalid",
          }),
        }),
      "[auth.request-code] AuthApiError status=400 code=email_address_invalid",
    ],
    [
      "una excepción",
      () => mocks.signInWithOtp.mockRejectedValue(new TypeError(`no se pudo avisar a ${EMAIL}`)),
      "[auth.request-code] TypeError",
    ],
  ])("deja %s en el log sin el email", async (_name, arrange, line) => {
    arrange();

    await requestLoginCode(emailStep, form({ email: EMAIL }));
    await runScheduled();

    expect(logged).toEqual([line]);
    expect(logged.join("\n")).not.toContain(EMAIL);
  });

  it("si todo va bien no escribe nada en el log", async () => {
    await requestLoginCode(emailStep, form({ email: EMAIL }));
    await runScheduled();

    expect(logged).toEqual([]);
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

  it("deja el fallo de verificación en el log sin el email ni el código", async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: Object.assign(new Error(`Token 123456 for ${EMAIL} has expired or is invalid`), {
        name: "AuthApiError",
        status: 403,
        code: "otp_expired",
      }),
    });

    await verifyLoginCode(codeStep, form({ email: EMAIL, code: "123456" }));

    expect(logged).toEqual(["[auth.verify-code] AuthApiError status=403 code=otp_expired"]);
  });

  it("un código mal formado o un email inválido no llegan al log", async () => {
    await verifyLoginCode(codeStep, form({ email: EMAIL, code: "12" }));
    await verifyLoginCode(codeStep, form({ email: "no-es-email", code: "123456" }));

    expect(logged).toEqual([]);
  });
});
