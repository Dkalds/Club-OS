import { createServerClient } from "@supabase/ssr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_COOKIE_OPTIONS } from "./cookie-options";

type CookieToSet = { name: string; value: string; options: Record<string, unknown> };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function optionsFor(nodeEnv: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.resetModules();
  return (await import("./cookie-options")).SESSION_COOKIE_OPTIONS;
}

describe("SESSION_COOKIE_OPTIONS", () => {
  it("la cookie de sesión no se puede leer desde JavaScript y no viaja entre sitios", () => {
    expect(SESSION_COOKIE_OPTIONS).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("en producción solo viaja por HTTPS", async () => {
    expect(await optionsFor("production")).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    });
  });

  it.each(["development", "test"])("en %s funciona por http://localhost", async (nodeEnv) => {
    expect(await optionsFor(nodeEnv)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
    });
  });
});

// Con el `@supabase/ssr` de verdad: lo que se le pasa en `cookieOptions` es lo que acaba
// en cada cookie que escribe y en cada cookie que borra.
describe("@supabase/ssr aplica SESSION_COOKIE_OPTIONS", () => {
  const session = {
    access_token: "access-token",
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "refresh-token",
    user: { id: "user-1", aud: "authenticated", email: "coach@club-a.test" },
  };

  function client(browserCookies: { name: string; value: string }[], written: CookieToSet[]) {
    return createServerClient("http://supabase.test", "publishable-key", {
      cookieOptions: SESSION_COOKIE_OPTIONS,
      cookies: {
        getAll: () => browserCookies,
        setAll: (cookies) => {
          written.push(...(cookies as CookieToSet[]));
        },
      },
      global: {
        fetch: async (input) =>
          String(input).includes("/logout")
            ? new Response(null, { status: 204 })
            : Response.json(session),
      },
    });
  }

  it("al iniciar sesión y al cerrarla", async () => {
    const signedIn: CookieToSet[] = [];
    const { error } = await client([], signedIn).auth.verifyOtp({
      email: "coach@club-a.test",
      token: "123456",
      type: "email",
    });

    expect(error).toBeNull();
    expect(signedIn.length).toBeGreaterThan(0);
    for (const cookie of signedIn) {
      expect(cookie.name).toMatch(/^sb-.+-auth-token/);
      expect(cookie.value).not.toBe("");
      expect(cookie.options).toMatchObject(SESSION_COOKIE_OPTIONS);
    }

    const signedOut: CookieToSet[] = [];
    const browserCookies = signedIn.map(({ name, value }) => ({ name, value }));
    await client(browserCookies, signedOut).auth.signOut({ scope: "local" });

    expect(signedOut.map((cookie) => cookie.name)).toEqual(signedIn.map((cookie) => cookie.name));
    for (const cookie of signedOut) {
      expect(cookie.value).toBe("");
      expect(cookie.options).toMatchObject({ ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
    }
  });
});
