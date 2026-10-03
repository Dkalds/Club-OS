import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signOut: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { POST } from "./route";

const ORIGIN = "http://localhost:3000";
const BROWSER_COOKIES = [
  { name: "sb-test-auth-token", value: "a" },
  { name: "sb-test-auth-token.0", value: "b" },
  { name: "sb-test-auth-token.1", value: "c" },
  { name: "sb-test-auth-token-code-verifier", value: "d" },
  { name: "otra-cookie", value: "e" },
];

/** Cookies que la ruta deja caducadas a mano: nombre → valor y atributos. */
let cleared: Map<string, { value: string; options: unknown }>;
/** Líneas escritas en el log del servidor. */
let logged: string[];

const CLEARED = { value: "", options: { ...SESSION_COOKIE_OPTIONS, maxAge: 0 } };

function post(): NextRequest {
  return new NextRequest(`${ORIGIN}/auth/sign-out`, { method: "POST" });
}

beforeEach(() => {
  vi.resetAllMocks();
  cleared = new Map();
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  mocks.cookies.mockResolvedValue({
    getAll: () => BROWSER_COOKIES,
    set: (name: string, value: string, options: unknown) => cleared.set(name, { value, options }),
  });
  mocks.createClient.mockResolvedValue({ auth: { signOut: mocks.signOut } });
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /auth/sign-out", () => {
  it("cierra la sesión de este dispositivo y redirige a /login con 303", async () => {
    const response = await POST(post());

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
    // Si Supabase ha cerrado la sesión, ya ha borrado él sus cookies.
    expect(cleared.size).toBe(0);
    expect(logged).toEqual([]);
  });

  it.each([
    ["Supabase devuelve un error", () => mocks.signOut.mockResolvedValue({ error: { message: "fetch failed" } })],
    ["Supabase lanza una excepción", () => mocks.signOut.mockRejectedValue(new Error("fetch failed"))],
    ["no se puede crear el cliente", () => mocks.createClient.mockRejectedValue(new Error("x"))],
  ])("si %s, borra a mano las cookies de sesión", async (_name, arrange) => {
    arrange();

    const response = await POST(post());

    // Con los mismos atributos con los que se escribieron, y caducadas.
    expect(Object.fromEntries(cleared)).toEqual({
      "sb-test-auth-token": CLEARED,
      "sb-test-auth-token.0": CLEARED,
      "sb-test-auth-token.1": CLEARED,
      "sb-test-auth-token-code-verifier": CLEARED,
    });
    expect(CLEARED.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
  });

  it("si Supabase no contesta, no se queda esperando: borra las cookies y sale", async () => {
    vi.useFakeTimers();
    mocks.signOut.mockReturnValue(new Promise(() => {}));
    let response: Response | undefined;
    const pending = POST(post()).then((res) => {
      response = res;
    });

    await vi.advanceTimersByTimeAsync(4_999);
    expect(response).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;

    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe(`${ORIGIN}/login`);
    expect(cleared.get("sb-test-auth-token")).toEqual(CLEARED);
    expect(cleared.has("otra-cookie")).toBe(false);
    expect(logged).toEqual(["[auth.sign-out] SignOutTimeout"]);
  });

  it("deja el fallo en el log sin el mensaje del error", async () => {
    mocks.signOut.mockResolvedValue({
      error: Object.assign(new Error("session a1b2 of coach@club-a.test not found"), {
        name: "AuthApiError",
        status: 500,
        code: "unexpected_failure",
      }),
    });

    await POST(post());

    expect(logged).toEqual(["[auth.sign-out] AuthApiError status=500 code=unexpected_failure"]);
  });
});
