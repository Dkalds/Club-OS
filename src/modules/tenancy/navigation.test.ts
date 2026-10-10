import { describe, expect, it } from "vitest";
import {
  activeNavKey,
  adminNavItems,
  hasIdentityTab,
  IDENTITY_LABEL,
  identityHref,
  navItems,
  standardsLabel,
  wayLabel,
  type NavKey,
} from "./navigation";

// Slug neutro: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const SLUG = "club-a";

describe("wayLabel", () => {
  it("sin término, «Identidad»", () => {
    expect(wayLabel({})).toBe("Identidad");
    expect(IDENTITY_LABEL).toBe("Identidad");
  });

  it("con término, el del club", () => {
    expect(wayLabel({ way: "Nuestra forma" })).toBe("Nuestra forma");
  });

  it("un término vacío o en blanco no deja la etiqueta vacía", () => {
    expect(wayLabel({ way: "" })).toBe("Identidad");
    expect(wayLabel({ way: "   " })).toBe("Identidad");
  });

  it("el término de Standards no la cambia", () => {
    expect(wayLabel({ standards: "Normas del club" })).toBe("Identidad");
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
  it.each(["coach", "admin"] as const)("%s: Inicio, Agenda, Sesiones, Biblioteca y Equipo", (role) => {
    expect(navItems(SLUG, role)).toEqual([
      { key: "home", label: "Inicio", href: "/c/club-a" },
      { key: "agenda", label: "Agenda", href: "/c/club-a/agenda" },
      { key: "sessions", label: "Sesiones", href: "/c/club-a/train" },
      { key: "library", label: "Biblioteca", href: "/c/club-a/drills" },
      { key: "team", label: "Equipo", href: "/c/club-a/team" },
    ]);
  });

  it.each(["player", "guardian"] as const)("%s: solo Inicio e Identidad, lo que puede usar", (role) => {
    expect(navItems(SLUG, role)).toEqual([
      { key: "home", label: "Inicio", href: "/c/club-a" },
      { key: "identity", label: "Identidad", href: "/c/club-a/way" },
    ]);
  });

  it("nadie ve una pestaña de partidos ni de «The Way»: viven en Agenda y en Identidad", () => {
    for (const role of ["admin", "coach", "player", "guardian"] as const) {
      const labels = navItems(SLUG, role).map((item) => item.label);
      expect(labels).not.toContain("Partidos");
      expect(labels).not.toContain("The Way");
      expect(labels).not.toContain("Entrenar");
    }
  });

  it("usa el slug del club en todas las rutas", () => {
    for (const item of navItems("club-b", "coach")) {
      expect(item.href === "/c/club-b" || item.href.startsWith("/c/club-b/")).toBe(true);
    }
  });
});

describe("la identidad del club", () => {
  it("es una pestaña para jugador y familia; para quien entrena y la dirección, no", () => {
    expect(hasIdentityTab("player")).toBe(true);
    expect(hasIdentityTab("guardian")).toBe(true);
    expect(hasIdentityTab("coach")).toBe(false);
    expect(hasIdentityTab("admin")).toBe(false);
  });

  it("su entrada es la ruta de siempre", () => {
    expect(identityHref(SLUG)).toBe("/c/club-a/way");
  });
});

describe("adminNavItems", () => {
  it("por defecto: Identidad, Valores, Principios y Standards, con rutas bajo /admin", () => {
    expect(adminNavItems(SLUG, {})).toEqual([
      { label: "Identidad", href: "/c/club-a/admin/way" },
      { label: "Valores", href: "/c/club-a/admin/values" },
      { label: "Principios", href: "/c/club-a/admin/principles" },
      { label: "Standards", href: "/c/club-a/admin/standards" },
    ]);
  });

  it("la terminología del club cambia la primera y la última", () => {
    const items = adminNavItems(SLUG, { way: "Nuestra forma", standards: "Normas" });

    expect(items.map((item) => item.label)).toEqual(["Nuestra forma", "Valores", "Principios", "Normas"]);
    expect(items.map((item) => item.href)).toEqual(adminNavItems(SLUG, {}).map((item) => item.href));
  });

  it("un término vacío no deja un apartado sin etiqueta", () => {
    const items = adminNavItems(SLUG, { way: "   ", standards: "" });

    expect(items.map((item) => item.label)).toEqual(["Identidad", "Valores", "Principios", "Standards"]);
  });

  it("usa el slug del club en todas las rutas", () => {
    for (const item of adminNavItems("club-b", {})) {
      expect(item.href.startsWith("/c/club-b/admin/")).toBe(true);
    }
  });
});

describe("activeNavKey", () => {
  const STAFF: NavKey[] = ["home", "agenda", "sessions", "library", "team"];
  const MEMBER: NavKey[] = ["home", "identity"];
  const staff = (pathname: string) => activeNavKey(pathname, SLUG, STAFF);

  it("la raíz del club es Inicio", () => {
    expect(staff("/c/club-a")).toBe("home");
    expect(staff("/c/club-a/")).toBe("home");
  });

  it("cada sección y lo que cuelga de ella, su pestaña", () => {
    expect(staff("/c/club-a/agenda")).toBe("agenda");
    expect(staff("/c/club-a/train")).toBe("sessions");
    expect(staff("/c/club-a/train/abc/edit")).toBe("sessions");
    expect(staff("/c/club-a/drills")).toBe("library");
    expect(staff("/c/club-a/drills/abc")).toBe("library");
    expect(staff("/c/club-a/team/abc/players/def")).toBe("team");
  });

  it("los partidos no tienen pestaña: su ficha, su alta y su edición son Agenda", () => {
    expect(staff("/c/club-a/games")).toBe("agenda");
    expect(staff("/c/club-a/games/new")).toBe("agenda");
    expect(staff("/c/club-a/games/abc/edit")).toBe("agenda");
  });

  it("la identidad es su pestaña para quien la tiene", () => {
    expect(activeNavKey("/c/club-a/way", SLUG, MEMBER)).toBe("identity");
    expect(activeNavKey("/c/club-a/way/standards", SLUG, MEMBER)).toBe("identity");
  });

  it("quien no tiene la pestaña de la ruta en la que está ve marcado Inicio, nunca ninguna", () => {
    // Quien entrena llega a la identidad desde Inicio.
    expect(staff("/c/club-a/way")).toBe("home");
    expect(staff("/c/club-a/way/standards")).toBe("home");
    // Un jugador que entra por URL a una pantalla que su barra no ofrece.
    expect(activeNavKey("/c/club-a/train", SLUG, MEMBER)).toBe("home");
    expect(activeNavKey("/c/club-a/agenda", SLUG, MEMBER)).toBe("home");
  });

  it("el segmento cuenta entero: uno que solo empieza igual no es esa sección", () => {
    expect(staff("/c/club-a/training")).toBe("home");
    expect(staff("/c/club-a/teams")).toBe("home");
    expect(staff("/c/club-a/agenda-2")).toBe("home");
  });

  it("una sección desconocida, Gestión o un nombre de propiedad heredada son Inicio", () => {
    expect(staff("/c/club-a/admin")).toBe("home");
    expect(staff("/c/club-a/otra")).toBe("home");
    expect(staff("/c/club-a/constructor")).toBe("home");
    expect(staff("/c/club-a/toString")).toBe("home");
  });

  it("una ruta de otro club o de fuera de un club es Inicio", () => {
    expect(staff("/c/club-b/train")).toBe("home");
    expect(staff("/select-club")).toBe("home");
    expect(staff("/")).toBe("home");
    expect(staff("")).toBe("home");
  });

  it("devuelve siempre una de las pestañas que se le pasan", () => {
    for (const pathname of ["/c/club-a", "/c/club-a/way", "/c/club-a/games/x", "/c/club-a/drills", "/x"]) {
      expect(STAFF).toContain(staff(pathname));
      expect(MEMBER).toContain(activeNavKey(pathname, SLUG, MEMBER));
    }
  });
});
