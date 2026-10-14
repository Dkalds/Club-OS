import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, generateNonce, securityHeaders } from "./security-headers";

const SUPABASE_URL = "https://abcxyz.supabase.co";

describe("generateNonce", () => {
  it("es un texto no vacío", () => {
    expect(generateNonce().length).toBeGreaterThan(0);
  });

  it("dos nonces seguidos no coinciden", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe("contentSecurityPolicy", () => {
  it("lleva el nonce en script-src, con strict-dynamic", () => {
    const csp = contentSecurityPolicy(SUPABASE_URL, "abc123");

    expect(csp).toContain(`script-src 'self' 'nonce-abc123' 'strict-dynamic'`);
  });

  it("img-src, worker-src, manifest-src y connect-src llevan lo que pide C12", () => {
    const csp = contentSecurityPolicy(SUPABASE_URL, "n");

    expect(csp).toContain(`img-src 'self' data: blob: ${SUPABASE_URL}`);
    expect(csp).toContain(`worker-src 'self'`);
    expect(csp).toContain(`manifest-src 'self'`);
    expect(csp).toContain(`connect-src 'self' ${SUPABASE_URL} wss://abcxyz.supabase.co`);
  });

  it("unsafe-eval solo en desarrollo", () => {
    expect(contentSecurityPolicy(SUPABASE_URL, "n", true)).toContain("'strict-dynamic' 'unsafe-eval'");
    expect(contentSecurityPolicy(SUPABASE_URL, "n", false)).not.toContain("unsafe-eval");
  });

  it("con Supabase local en http, el WebSocket es ws://, no wss://", () => {
    expect(contentSecurityPolicy("http://127.0.0.1:54321", "n")).toContain(
      "connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321",
    );
  });

  it("no se repite ningún directorio", () => {
    const csp = contentSecurityPolicy(SUPABASE_URL, "n");
    const names = csp.split("; ").map((d) => d.split(" ")[0]);

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("securityHeaders", () => {
  it("Permissions-Policy no bloquea screen-wake-lock ni web-share", () => {
    const headers = securityHeaders(SUPABASE_URL, "n");

    expect(headers["Permissions-Policy"]).toContain("screen-wake-lock=(self)");
    expect(headers["Permissions-Policy"]).toContain("web-share=(self)");
  });

  it("incluye X-Content-Type-Options y Referrer-Policy", () => {
    const headers = securityHeaders(SUPABASE_URL, "n");

    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});
