import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_OPTIONS } from "./cookie-options";

type CookieToSet = { name: string; value: string; options: Record<string, unknown> };
type CookieMethods = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: CookieToSet[], headers: Record<string, string>) => void;
};

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));

import { updateSession } from "./session";

const ORIGIN = "http://localhost:3000";
const SIGNED_IN = { data: { claims: { sub: "user-1" } }, error: null };
const SIGNED_OUT = { data: null, error: null };

/** Métodos de cookies que `updateSession` le pasa al cliente de Supabase. */
let cookieMethods: CookieMethods;
/** Líneas escritas en el log del servidor. */
let logged: string[];

function request(path: string, init?: { method?: string; cookie?: string }): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: init?.method ?? "GET",
    headers: init?.cookie ? { cookie: init.cookie } : undefined,
  });
}

function isPassThrough(response: Response): boolean {
  return response.status === 200 && response.headers.get("x-middleware-next") === "1";
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  mocks.createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: CookieMethods }) => {
      cookieMethods = options.cookies;
      return { auth: { getClaims: mocks.getClaims } };
    },
  );
  mocks.getClaims.mockResolvedValue(SIGNED_OUT);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("updateSession sin sesión", () => {
  it.each(["/c/club-a", "/c/club-a/train", "/c", "/select-club"])(
    "redirige %s a /login",
    async (path) => {
      const response = await updateSession(request(`${path}?x=1`));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
    },
  );

  it.each(["/login", "/", "/clubes", "/select-clubs", "/cualquier-cosa"])(
    "deja pasar %s",
    async (path) => {
      const response = await updateSession(request(path));

      expect(isPassThrough(response)).toBe(true);
    },
  );

  it("también corta las peticiones que no son GET", async () => {
    const response = await updateSession(request("/c/club-a", { method: "POST" }));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
  });
});

describe("updateSession con sesión", () => {
  beforeEach(() => {
    mocks.getClaims.mockResolvedValue(SIGNED_IN);
  });

  it.each(["/c/club-a", "/select-club", "/"])("deja pasar %s", async (path) => {
    const response = await updateSession(request(path));

    expect(isPassThrough(response)).toBe(true);
  });

  it("lleva /login al selector de club", async () => {
    const response = await updateSession(request("/login"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/select-club`);
  });

  it("no redirige un POST a /login (Server Actions del formulario)", async () => {
    const response = await updateSession(request("/login", { method: "POST" }));

    expect(isPassThrough(response)).toBe(true);
  });
});

describe("updateSession valida al usuario", () => {
  it("usa una comprobación verificada con las cookies de la petición", async () => {
    await updateSession(request("/c/club-a", { cookie: "sb-test-auth-token=abc" }));

    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(cookieMethods.getAll()).toEqual([{ name: "sb-test-auth-token", value: "abc" }]);
  });

  it("las cookies de sesión que escriba llevan los atributos de SESSION_COOKIE_OPTIONS", async () => {
    await updateSession(request("/c/club-a"));

    expect(mocks.createServerClient.mock.calls[0][2]).toMatchObject({
      cookieOptions: SESSION_COOKIE_OPTIONS,
    });
  });

  it.each([
    ["sin identificador de usuario", { data: { claims: {} }, error: null }],
    ["con error de Auth", { data: null, error: { message: "invalid JWT" } }],
    ["con claims y error a la vez", { data: { claims: { sub: "user-1" } }, error: { message: "x" } }],
  ])("no hay sesión %s", async (_name, result) => {
    mocks.getClaims.mockResolvedValue(result);

    const response = await updateSession(request("/c/club-a"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
  });

  it("si Supabase no responde, se trata como sin sesión", async () => {
    mocks.getClaims.mockRejectedValue(new TypeError("fetch failed"));

    const protectedRoute = await updateSession(request("/c/club-a"));
    const login = await updateSession(request("/login"));

    expect(protectedRoute.headers.get("location")).toBe(`${ORIGIN}/login`);
    expect(isPassThrough(login)).toBe(true);
  });

  it("si Supabase tarda demasiado, no espera: se trata como sin sesión", async () => {
    // Con el token caducado y Auth caído, auth-js reintenta el refresco durante ~30 s.
    vi.useFakeTimers();
    try {
      mocks.getClaims.mockReturnValue(new Promise(() => {}));
      let settled = false;
      const pending = updateSession(request("/c/club-a")).then((response) => {
        settled = true;
        return response;
      });

      await vi.advanceTimersByTimeAsync(4_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const response = await pending;

      expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("una respuesta a tiempo no deja temporizadores pendientes", async () => {
    vi.useFakeTimers();
    try {
      mocks.getClaims.mockResolvedValue(SIGNED_IN);

      const response = await updateSession(request("/c/club-a"));

      expect(isPassThrough(response)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("si no se puede crear el cliente, se trata como sin sesión", async () => {
    mocks.createServerClient.mockImplementation(() => {
      throw new Error("sin configuración");
    });

    const response = await updateSession(request("/select-club"));

    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
  });
});

describe("updateSession deja rastro en el log sin datos personales", () => {
  const COOKIE = "sb-test-auth-token=token-secreto";

  it("sin sesión no hay nada que registrar", async () => {
    await updateSession(request("/c/club-a"));
    mocks.getClaims.mockResolvedValue(SIGNED_IN);
    await updateSession(request("/c/club-a", { cookie: COOKIE }));

    expect(logged).toEqual([]);
  });

  it("un error de Auth: nombre, estado y código, sin el mensaje ni la cookie", async () => {
    mocks.getClaims.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Invalid Refresh Token: token-secreto"), {
        name: "AuthApiError",
        status: 400,
        code: "refresh_token_not_found",
      }),
    });

    await updateSession(request("/c/club-a", { cookie: COOKIE }));

    expect(logged).toEqual(["[auth.session] AuthApiError status=400 code=refresh_token_not_found"]);
  });

  it("una excepción de red", async () => {
    mocks.getClaims.mockRejectedValue(
      new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } }),
    );

    await updateSession(request("/c/club-a", { cookie: COOKIE }));

    expect(logged).toEqual(["[auth.session] TypeError cause=ECONNREFUSED"]);
  });

  it("el tope de tiempo", async () => {
    vi.useFakeTimers();
    try {
      mocks.getClaims.mockReturnValue(new Promise(() => {}));
      const pending = updateSession(request("/c/club-a", { cookie: COOKIE }));

      await vi.advanceTimersByTimeAsync(5_000);
      await pending;

      expect(logged).toEqual(["[auth.session] AuthCheckTimeout"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("updateSession pone las cabeceras de seguridad (C12)", () => {
  it.each(["/", "/login", "/c/club-a"])("la CSP lleva un nonce, en %s", async (path) => {
    mocks.getClaims.mockResolvedValue(SIGNED_IN);
    const response = await updateSession(request(path));

    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  });

  it("dos peticiones no comparten el mismo nonce", async () => {
    mocks.getClaims.mockResolvedValue(SIGNED_IN);
    const a = await updateSession(request("/c/club-a"));
    const b = await updateSession(request("/c/club-a"));

    expect(a.headers.get("Content-Security-Policy")).not.toBe(b.headers.get("Content-Security-Policy"));
  });

  it("también las lleva un redirect a /login", async () => {
    const response = await updateSession(request("/c/club-a"));

    expect(response.status).toBe(307);
    expect(response.headers.get("Content-Security-Policy")).toContain("strict-dynamic");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("Permissions-Policy no bloquea screen-wake-lock ni web-share", async () => {
    const response = await updateSession(request("/"));

    expect(response.headers.get("Permissions-Policy")).toContain("screen-wake-lock=(self)");
    expect(response.headers.get("Permissions-Policy")).toContain("web-share=(self)");
  });
});

describe("updateSession refresca la sesión", () => {
  const refreshed: CookieToSet = {
    name: "sb-test-auth-token",
    value: "nuevo",
    options: { path: "/", maxAge: 3600, httpOnly: true, sameSite: "lax" },
  };
  const cacheHeaders = { "Cache-Control": "private, no-store" };

  it("escribe las cookies nuevas en la respuesta y en la petición que sigue", async () => {
    mocks.getClaims.mockImplementation(async () => {
      cookieMethods.setAll([refreshed], cacheHeaders);
      return SIGNED_IN;
    });
    const req = request("/c/club-a", { cookie: "sb-test-auth-token=viejo" });

    const response = await updateSession(req);

    expect(isPassThrough(response)).toBe(true);
    expect(response.cookies.get("sb-test-auth-token")).toMatchObject({
      value: "nuevo",
      path: "/",
      maxAge: 3600,
      httpOnly: true,
      sameSite: "lax",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    // Lo que verán los Server Components de esta misma petición.
    expect(req.cookies.get("sb-test-auth-token")?.value).toBe("nuevo");
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "sb-test-auth-token=nuevo",
    );
  });

  it("conserva las cookies y cabeceras de escrituras anteriores", async () => {
    const verifier: CookieToSet = { name: "sb-test-otra", value: "1", options: { path: "/" } };
    mocks.getClaims.mockImplementation(async () => {
      cookieMethods.setAll([refreshed], cacheHeaders);
      cookieMethods.setAll([verifier], {});
      return SIGNED_IN;
    });

    const response = await updateSession(request("/c/club-a"));

    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("nuevo");
    expect(response.cookies.get("sb-test-otra")?.value).toBe("1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("no pierde las cookies al redirigir", async () => {
    const cleared: CookieToSet = {
      name: "sb-test-auth-token",
      value: "",
      options: { path: "/", maxAge: 0 },
    };
    mocks.getClaims.mockImplementation(async () => {
      cookieMethods.setAll([cleared], cacheHeaders);
      return SIGNED_OUT;
    });

    const response = await updateSession(
      request("/c/club-a", { cookie: "sb-test-auth-token=caducado" }),
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
    expect(response.cookies.get("sb-test-auth-token")).toMatchObject({ value: "", maxAge: 0 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
