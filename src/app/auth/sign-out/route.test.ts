import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  signOut: vi.fn(),
  cookies: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { POST } from "./route";

const ORIGIN = "http://localhost:3000";
const BROWSER_COOKIES = [
  { name: "sb-test-auth-token", value: "a" },
  { name: "sb-test-auth-token.0", value: "b" },
  { name: "sb-test-auth-token.1", value: "c" },
  { name: "sb-test-auth-token-code-verifier", value: "d" },
  { name: "otra-cookie", value: "e" },
];

let deleted: string[];

function post(): NextRequest {
  return new NextRequest(`${ORIGIN}/auth/sign-out`, { method: "POST" });
}

beforeEach(() => {
  vi.resetAllMocks();
  deleted = [];
  mocks.cookies.mockResolvedValue({
    getAll: () => BROWSER_COOKIES,
    delete: (name: string) => deleted.push(name),
  });
  mocks.createClient.mockResolvedValue({ auth: { signOut: mocks.signOut } });
  mocks.signOut.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /auth/sign-out", () => {
  it("cierra la sesión de este dispositivo y redirige a /login con 303", async () => {
    const response = await POST(post());

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/login`);
    // Si Supabase ha cerrado la sesión, ya ha borrado él sus cookies.
    expect(deleted).toEqual([]);
  });

  it.each([
    ["Supabase devuelve un error", () => mocks.signOut.mockResolvedValue({ error: { message: "fetch failed" } })],
    ["Supabase lanza una excepción", () => mocks.signOut.mockRejectedValue(new Error("fetch failed"))],
    ["no se puede crear el cliente", () => mocks.createClient.mockRejectedValue(new Error("x"))],
  ])("si %s, borra a mano las cookies de sesión", async (_name, arrange) => {
    arrange();

    const response = await POST(post());

    expect(deleted).toEqual([
      "sb-test-auth-token",
      "sb-test-auth-token.0",
      "sb-test-auth-token.1",
      "sb-test-auth-token-code-verifier",
    ]);
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
    expect(deleted).toContain("sb-test-auth-token");
    expect(deleted).not.toContain("otra-cookie");
  });
});
