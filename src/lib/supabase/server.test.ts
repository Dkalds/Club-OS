import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseClient: vi.fn(),
  createServerClient: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createSupabaseClient }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { createAnonClient, createClient } from "./server";

type CookieToSet = { name: string; value: string; options: Record<string, unknown> };
type CookieMethods = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: CookieToSet[], headers: Record<string, string>) => void;
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
});

describe("createAnonClient", () => {
  it("no guarda sesión ni lee o escribe cookies", () => {
    const client = { auth: {} };
    mocks.createSupabaseClient.mockReturnValue(client);

    expect(createAnonClient()).toBe(client);

    expect(mocks.createSupabaseClient).toHaveBeenCalledWith(
      "http://supabase.test",
      "publishable-key",
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          flowType: "implicit",
        },
      },
    );
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});

describe("createClient", () => {
  function cookieMethods(): CookieMethods {
    return mocks.createServerClient.mock.calls[0][2].cookies as CookieMethods;
  }

  it("lee la sesión de las cookies de la petición con la clave pública", async () => {
    const stored = [{ name: "sb-test-auth-token", value: "abc" }];
    mocks.cookies.mockResolvedValue({ getAll: () => stored, set: vi.fn() });

    await createClient();

    expect(mocks.createServerClient).toHaveBeenCalledWith(
      "http://supabase.test",
      "publishable-key",
      expect.anything(),
    );
    expect(cookieMethods().getAll()).toEqual(stored);
  });

  it("escribe en las cookies la sesión nueva", async () => {
    const set = vi.fn();
    mocks.cookies.mockResolvedValue({ getAll: () => [], set });

    await createClient();
    cookieMethods().setAll(
      [{ name: "sb-test-auth-token", value: "nuevo", options: { path: "/" } }],
      {},
    );

    expect(set).toHaveBeenCalledWith("sb-test-auth-token", "nuevo", { path: "/" });
  });

  it("en un Server Component, que no puede escribir cookies, no falla", async () => {
    const set = vi.fn(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
    });
    mocks.cookies.mockResolvedValue({ getAll: () => [], set });

    await createClient();

    expect(() =>
      cookieMethods().setAll([{ name: "sb-test-auth-token", value: "x", options: {} }], {}),
    ).not.toThrow();
  });
});
