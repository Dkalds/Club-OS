import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/session", () => ({ updateSession: vi.fn() }));

import { config } from "./proxy";

function runsOn(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}

describe("matcher del proxy", () => {
  it.each(["/", "/login", "/select-club", "/c/club-a", "/c/club-a/train", "/auth/sign-out"])(
    "pasa por el proxy: %s",
    (url) => {
      expect(runsOn(url)).toBe(true);
    },
  );

  it.each([
    "/_next/static/chunks/app.js",
    "/_next/image",
    "/favicon.ico",
    "/logo.png",
    "/x.png",
    "/x/foto.webp",
  ])(
    "no pasa por el proxy (estático): %s",
    (url) => {
      expect(runsOn(url)).toBe(false);
    },
  );

  // La exclusión es por extensión (con su punto), no por acabar en esas letras.
  it.each(["/musico", "/panel/medico", "/apng", "/c-svg", "/ajpg", "/faviconxico"])(
    "acabar en letras de extensión sin punto no libra del proxy: %s",
    (url) => {
      expect(runsOn(url)).toBe(true);
    },
  );

  it("el patrón general lleva el punto escapado", () => {
    const general = config.matcher.at(-1);

    expect(general).toContain(String.raw`.*\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$`);
  });

  // Un slug o un id con extensión de imagen no puede saltarse el filtro de sesión.
  it.each(["/c/club-a.png", "/c/club-a/escudo.svg", "/select-club/x.jpg"])(
    "una ruta de club nunca se libra por parecer una imagen: %s",
    (url) => {
      expect(runsOn(url)).toBe(true);
    },
  );
});
