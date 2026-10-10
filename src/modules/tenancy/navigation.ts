import type { Terminology } from "./branding";
import type { ClubContext } from "./queries";

type Role = ClubContext["membership"]["role"];

export type NavKey = "home" | "agenda" | "sessions" | "library" | "team" | "identity";

export type NavItem = { key: NavKey; label: string; href: string };

/**
 * Cómo se llama en la navegación la metodología del club: un término de plataforma, el mismo
 * en todos los clubes. Es también el título de sus pantallas cuando el club no les ha puesto
 * nombre propio.
 */
export const IDENTITY_LABEL = "Identidad";

/** Nombre de la página de los Standards cuando el club no le ha puesto uno. */
const DEFAULT_STANDARDS_LABEL = "Standards";

/**
 * El nombre que el club da a su metodología (títulos y migas de sus pantallas, y Gestión), o
 * «Identidad». Un término vacío o en blanco cuenta como ausente: la etiqueta nunca se queda
 * vacía. La entrada de navegación no lo usa: es siempre `IDENTITY_LABEL`.
 */
export function wayLabel(terminology: Terminology): string {
  return terminology.way?.trim() || IDENTITY_LABEL;
}

/** El nombre que el club da a sus Standards, o «Standards». Mismo criterio que `wayLabel`. */
export function standardsLabel(terminology: Terminology): string {
  return terminology.standards?.trim() || DEFAULT_STANDARDS_LABEL;
}

/** La etiqueta y el segmento de ruta de cada pestaña; Inicio es la raíz del club. */
const TABS: Record<NavKey, { label: string; segment: string }> = {
  home: { label: "Inicio", segment: "" },
  agenda: { label: "Agenda", segment: "agenda" },
  sessions: { label: "Sesiones", segment: "train" },
  library: { label: "Biblioteca", segment: "drills" },
  team: { label: "Equipo", segment: "team" },
  identity: { label: IDENTITY_LABEL, segment: "way" },
};

/**
 * Las pestañas de cada rol, en su orden. Cada rol ve solo lo que puede usar: quien entrena y la
 * dirección, la semana de un equipo; un jugador o una familia, que hoy no leen ni equipos ni
 * calendario (RLS), Inicio y la identidad del club. El compilador obliga a decidir un rol nuevo.
 */
const ROLE_TABS: Record<Role, readonly NavKey[]> = {
  admin: ["home", "agenda", "sessions", "library", "team"],
  coach: ["home", "agenda", "sessions", "library", "team"],
  player: ["home", "identity"],
  guardian: ["home", "identity"],
};

/**
 * La pestaña de cada primer segmento tras `/c/{slug}`. Los partidos (`/games/…`) no tienen
 * pestaña propia: viven en la Agenda.
 */
const SECTION_TAB: Record<string, NavKey> = {
  agenda: "agenda",
  games: "agenda",
  train: "sessions",
  drills: "library",
  team: "team",
  way: "identity",
};

/**
 * Las pestañas de la navegación principal de un club para quien tiene ese rol, en su orden.
 * Las URL son las de siempre (`/train`, `/drills`, `/way`…): solo cambian los nombres.
 */
export function navItems(clubSlug: string, role: Role): NavItem[] {
  const base = `/c/${clubSlug}`;

  return ROLE_TABS[role].map((key) => {
    const { label, segment } = TABS[key];
    return { key, label, href: segment ? `${base}/${segment}` : base };
  });
}

/** Si la identidad del club es una pestaña para ese rol. Si no, se llega desde Inicio y desde el menú de cuenta. */
export function hasIdentityTab(role: Role): boolean {
  return ROLE_TABS[role].includes("identity");
}

/** La entrada a la identidad del club: `/c/{slug}/way`. */
export function identityHref(clubSlug: string): string {
  return `/c/${clubSlug}/${TABS.identity.segment}`;
}

export type AdminNavItem = { label: string; href: string };

/**
 * Los apartados de Gestión (`/c/{slug}/admin/…`), en su orden: la metodología, los valores,
 * los principios de juego y los Standards. La metodología y los Standards llevan el nombre
 * que el club les haya dado en su terminología; «Valores» y «Principios» son siempre esos.
 */
export function adminNavItems(clubSlug: string, terminology: Terminology): AdminNavItem[] {
  const base = `/c/${clubSlug}/admin`;

  return [
    { label: wayLabel(terminology), href: `${base}/way` },
    { label: "Valores", href: `${base}/values` },
    { label: "Principios", href: `${base}/principles` },
    { label: standardsLabel(terminology), href: `${base}/standards` },
  ];
}

/**
 * La pestaña a la que pertenece una ruta del club, de entre las que tiene quien mira (`keys`).
 * Cuenta el primer segmento tras `/c/{slug}`, entero: `/c/club/train/…` es Sesiones y
 * `/c/club/games/…`, Agenda.
 *
 * Si la sección de la ruta no es una de sus pestañas (quien entrena, en `/way`: llega a la
 * identidad desde Inicio), o la ruta no es de este club, es Inicio. Siempre hay una pestaña
 * activa, y solo una.
 */
export function activeNavKey(pathname: string, clubSlug: string, keys: readonly NavKey[]): NavKey {
  const [, root, club, section] = pathname.split("/");
  if (root !== "c" || club !== clubSlug) return "home";

  const key = section !== undefined && Object.hasOwn(SECTION_TAB, section) ? SECTION_TAB[section] : undefined;
  return key !== undefined && keys.includes(key) ? key : "home";
}
