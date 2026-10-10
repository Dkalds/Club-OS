import { describe, expect, it } from "vitest";
import { activeNavKey, adminNavItems, navItems, standardsLabel, wayLabel } from "./navigation";

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
    const items = navItems(SLUG, { way: "Nuestro estilo" });

    expect(items.map((item) => item.label)).toEqual([
      "Inicio",
      "Nuestro estilo",
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

describe("adminNavItems", () => {
  it("por defecto: The Way, Valores, Principios, Standards, Club, Equipos, Personas e Invitaciones, con rutas bajo /admin", () => {
    expect(adminNavItems(SLUG, {})).toEqual([
      { label: "The Way", href: "/c/club-a/admin/way" },
      { label: "Valores", href: "/c/club-a/admin/values" },
      { label: "Principios", href: "/c/club-a/admin/principles" },
      { label: "Standards", href: "/c/club-a/admin/standards" },
      { label: "Club", href: "/c/club-a/admin/club" },
      { label: "Equipos", href: "/c/club-a/admin/teams" },
      { label: "Personas", href: "/c/club-a/admin/people" },
      { label: "Ejercicios pendientes", href: "/c/club-a/admin/drills" },
      { label: "Cobertura", href: "/c/club-a/admin/coverage" },
      { label: "Invitaciones", href: "/c/club-a/admin/invites" },
    ]);
  });

  it("la terminología del club cambia la primera y la de Standards", () => {
    const items = adminNavItems(SLUG, { way: "Nuestra forma", standards: "Normas" });

    expect(items.map((item) => item.label)).toEqual([
      "Nuestra forma",
      "Valores",
      "Principios",
      "Normas",
      "Club",
      "Equipos",
      "Personas",
      "Ejercicios pendientes",
      "Cobertura",
      "Invitaciones",
    ]);
    expect(items.map((item) => item.href)).toEqual(adminNavItems(SLUG, {}).map((item) => item.href));
  });

  it("un término vacío no deja un apartado sin etiqueta", () => {
    const items = adminNavItems(SLUG, { way: "   ", standards: "" });

    expect(items.map((item) => item.label)).toEqual([
      "The Way",
      "Valores",
      "Principios",
      "Standards",
      "Club",
      "Equipos",
      "Personas",
      "Ejercicios pendientes",
      "Cobertura",
      "Invitaciones",
    ]);
  });

  it("usa el slug del club en todas las rutas", () => {
    for (const item of adminNavItems("club-b", {})) {
      expect(item.href.startsWith("/c/club-b/admin/")).toBe(true);
    }
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

  it("activeNavKey('/c/club-a/drills/abc', 'club-a') === 'train'", () => {
    expect(activeNavKey("/c/club-a/drills/abc", SLUG)).toBe("train");
  });

  it.each([
    "/c/club-a/drills",
    "/c/club-a/drills/",
    "/c/club-a/drills/new",
    "/c/club-a/drills/4b0c6c0e-5d0a-4a57-9f5e-0c3b3f1d2a10",
    "/c/club-a/drills/4b0c6c0e-5d0a-4a57-9f5e-0c3b3f1d2a10/edit",
  ])("la biblioteca de ejercicios cuelga de Entrenar: %s → train", (pathname) => {
    expect(activeNavKey(pathname, SLUG)).toBe("train");
  });

  it("la biblioteca no es una pestaña: no aparece entre las de la navegación", () => {
    expect(navItems(SLUG, {}).map((item) => item.href)).not.toContain("/c/club-a/drills");
  });

  it("solo cuenta el segmento entero, no un prefijo", () => {
    expect(activeNavKey("/c/club-a/trainers", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a/teams", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a/wayfinder", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a/drillsx", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a/drill", SLUG)).toBe("home");
  });

  it("«drills» solo cuenta justo tras el club, no más adentro", () => {
    expect(activeNavKey("/c/club-a/admin/drills", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a/way/drills", SLUG)).toBe("way");
  });

  it("un segmento con el nombre de una propiedad de Object no se cuela", () => {
    expect(activeNavKey("/c/club-a/constructor", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a/__proto__", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-a/toString", SLUG)).toBe("home");
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

  it("la biblioteca de otro club no activa Entrenar en este", () => {
    expect(activeNavKey("/c/club-b/drills", SLUG)).toBe("home");
    expect(activeNavKey("/c/club-ab/drills/abc", SLUG)).toBe("home");
  });
});
