import { describe, expect, it } from "vitest";
import { activeNavKey, navItems, standardsLabel, wayLabel } from "./navigation";

// Slug neutro: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const SLUG = "club-a";

describe("wayLabel", () => {
  it("sin término, «The Way»", () => {
    expect(wayLabel({})).toBe("The Way");
  });

  it("con término, el del club", () => {
    expect(wayLabel({ way: "Nuestra forma" })).toBe("Nuestra forma");
  });

  it("un término vacío o en blanco no deja la etiqueta vacía", () => {
    expect(wayLabel({ way: "" })).toBe("The Way");
    expect(wayLabel({ way: "   " })).toBe("The Way");
  });

  it("el término de Standards no la cambia", () => {
    expect(wayLabel({ standards: "Normas del club" })).toBe("The Way");
  });
});

describe("standardsLabel", () => {
  it("sin término, «Standards»", () => {
    expect(standardsLabel({})).toBe("Standards");
  });

  it("con término, el del club", () => {
    expect(standardsLabel({ standards: "Normas del club" })).toBe("Normas del club");
  });

  it("un término vacío o en blanco no deja la etiqueta vacía", () => {
    expect(standardsLabel({ standards: "" })).toBe("Standards");
    expect(standardsLabel({ standards: "   " })).toBe("Standards");
  });

  it("el término de la metodología no la cambia", () => {
    expect(standardsLabel({ way: "Nuestra forma" })).toBe("Standards");
  });
});

describe("navItems", () => {
  it("etiquetas por defecto", () => {
    const items = navItems(SLUG, {});

    expect(items).toHaveLength(5);
    expect(items.map((item) => item.key)).toEqual(["home", "way", "train", "games", "team"]);
    expect(items.map((item) => item.label)).toEqual([
      "Inicio",
      "The Way",
      "Entrenar",
      "Partidos",
      "Equipo",
    ]);
  });

  it("la terminología del club cambia la etiqueta", () => {
    const items = navItems(SLUG, { way: "Nuestra forma" });

    expect(items.map((item) => item.label)).toEqual([
      "Inicio",
      "Nuestra forma",
      "Entrenar",
      "Partidos",
      "Equipo",
    ]);
  });

  it("rutas con el slug", () => {
    expect(navItems(SLUG, {}).map((item) => item.href)).toEqual([
      "/c/club-a",
      "/c/club-a/way",
      "/c/club-a/train",
      "/c/club-a/games",
      "/c/club-a/team",
    ]);
  });

  it("un término vacío no deja la pestaña sin etiqueta", () => {
    expect(navItems(SLUG, { way: "   " })[1].label).toBe("The Way");
    expect(navItems(SLUG, { way: "" })[1].label).toBe("The Way");
  });

  it("el término de Standards no cambia ninguna pestaña", () => {
    expect(navItems(SLUG, { standards: "Normas del club" })).toEqual(navItems(SLUG, {}));
  });
});

describe("activeNavKey", () => {
  it("activeNavKey('/c/club-a/train/abc', 'club-a') === 'train'", () => {
    expect(activeNavKey("/c/club-a/train/abc", SLUG)).toBe("train");
  });

  it("activeNavKey('/c/club-a', 'club-a') === 'home'", () => {
    expect(activeNavKey("/c/club-a", SLUG)).toBe("home");
  });

  it.each([
    ["/c/club-a/", "home"],
    ["/c/club-a/way", "way"],
    ["/c/club-a/way/", "way"],
    ["/c/club-a/way/valores", "way"],
    ["/c/club-a/train", "train"],
    ["/c/club-a/games", "games"],
    ["/c/club-a/games/4b0c6c0e-5d0a-4a57-9f5e-0c3b3f1d2a10", "games"],
    ["/c/club-a/team", "team"],
  ] as const)("%s → %s", (pathname, key) => {
    expect(activeNavKey(pathname, SLUG)).toBe(key);
  });

  it("solo cuenta el segmento entero, no un prefijo", () => {
    expect(activeNavKey("/c/club-a/trainers", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a/teams", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a/wayfinder", SLUG)).toBe("home");
  });

  it("una sección que no es una pestaña cae en Inicio", () => {
    expect(activeNavKey("/c/club-a/admin", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a/home", SLUG)).toBe("home");
  });

  it("fuera del club cae en Inicio", () => {
    expect(activeNavKey("/select-club", SLUG)).toBe("home");
    expect(activeNavKey("/", SLUG)).toBe("home");
    expect(activeNavKey("", SLUG)).toBe("home");
  });

  it("no confunde un club con otro cuyo slug empieza igual", () => {
    expect(activeNavKey("/c/club-ab/train", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a-b/train", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-b/train", SLUG)).toBe("home");
  });
});
