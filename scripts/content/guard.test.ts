import { describe, expect, it } from "vitest";
import { assertImportTarget } from "./guard";

describe("assertImportTarget", () => {
  const blocked = (host: string) =>
    `Importación bloqueada: NEXT_PUBLIC_SUPABASE_URL apunta a ${host}, que no es un Supabase local. ` +
    "Si es el destino que quieres, ejecuta con ALLOW_REMOTE_IMPORT=true.";

  it("acepta un Supabase local", () => {
    for (const url of ["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"]) {
      expect(() => assertImportTarget(url, {}), url).not.toThrow();
    }
  });

  it("rechaza un remoto, también con el permiso del seed", () => {
    const message = blocked("abc.supabase.co");

    expect(() => assertImportTarget("https://abc.supabase.co", {})).toThrow(message);
    expect(() => assertImportTarget("https://abc.supabase.co", { ALLOW_REMOTE_SEED: "true" })).toThrow(message);
    expect(() => assertImportTarget("https://abc.supabase.co", { ALLOW_REMOTE_IMPORT: "1" })).toThrow(message);
  });

  it("acepta un remoto con ALLOW_REMOTE_IMPORT=true", () => {
    expect(() =>
      assertImportTarget("https://abc.supabase.co", { ALLOW_REMOTE_IMPORT: "true" }),
    ).not.toThrow();
  });

  it("una URL que no se puede leer se rechaza diciéndolo", () => {
    expect(() => assertImportTarget("no-es-una-url", {})).toThrow(
      blocked("una URL que no se puede interpretar"),
    );
  });
});
