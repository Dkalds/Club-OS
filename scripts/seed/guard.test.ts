import { describe, expect, it } from "vitest";
import { assertSeedTarget } from "./guard";

describe("assertSeedTarget", () => {
  it("acepta Supabase local", () => {
    expect(() => assertSeedTarget("http://127.0.0.1:54321", {})).not.toThrow();
    expect(() => assertSeedTarget("http://localhost:54321", {})).not.toThrow();
    expect(() => assertSeedTarget("http://[::1]:54321", {})).not.toThrow();
  });

  it("rechaza un remoto", () => {
    expect(() => assertSeedTarget("https://abc.supabase.co", {})).toThrow(
      /Seed bloqueado/,
    );
  });

  it("permite remoto con ALLOW_REMOTE_SEED=true", () => {
    expect(() =>
      assertSeedTarget("https://abc.supabase.co", { ALLOW_REMOTE_SEED: "true" }),
    ).not.toThrow();
  });

  it("solo el valor exacto 'true' desbloquea un remoto", () => {
    for (const value of ["1", "TRUE", "yes", "", undefined]) {
      expect(() =>
        assertSeedTarget("https://abc.supabase.co", { ALLOW_REMOTE_SEED: value }),
      ).toThrow(/Seed bloqueado/);
    }
  });

  it("no se deja engañar por un host que solo parece local", () => {
    for (const url of [
      "https://localhost.evil.test",
      "https://127.0.0.1.evil.test",
      "https://evil.test/localhost",
      "https://user@evil.test",
      "http://127.0.0.2:54321",
      "http://0.0.0.0:54321",
    ]) {
      expect(() => assertSeedTarget(url, {}), url).toThrow(/Seed bloqueado/);
    }
  });

  it("bloquea una URL que no se puede interpretar", () => {
    expect(() => assertSeedTarget("no-es-una-url", {})).toThrow(/Seed bloqueado/);
    expect(() => assertSeedTarget("", {})).toThrow(/Seed bloqueado/);
  });
});
