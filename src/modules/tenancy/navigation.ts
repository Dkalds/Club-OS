import type { Terminology } from "./branding";

export type NavKey = "home" | "way" | "train" | "games" | "team";

export type NavItem = { key: NavKey; label: string; href: string };

/** Etiqueta de la pestaña de metodología cuando el club no le ha puesto nombre. */
const DEFAULT_WAY_LABEL = "The Way";

/** Pestañas con ruta propia bajo `/c/{slug}/`. Inicio es la raíz del club. */
const SECTION_KEYS = ["way", "train", "games", "team"] as const satisfies ReadonlyArray<NavKey>;

function isSectionKey(segment: string | undefined): segment is (typeof SECTION_KEYS)[number] {
  return (SECTION_KEYS as ReadonlyArray<string>).includes(segment ?? "");
}

/**
 * Las cinco pestañas de la navegación principal de un club, en su orden.
 *
 * La de metodología lleva el nombre que el club le haya dado en su terminología.
 */
export function navItems(clubSlug: string, terminology: Terminology): NavItem[] {
  const base = `/c/${clubSlug}`;

  return [
    { key: "home", label: "Inicio", href: base },
    { key: "way", label: terminology.way?.trim() || DEFAULT_WAY_LABEL, href: `${base}/way` },
    { key: "train", label: "Entrenar", href: `${base}/train` },
    { key: "games", label: "Partidos", href: `${base}/games` },
    { key: "team", label: "Equipo", href: `${base}/team` },
  ];
}

/**
 * La pestaña a la que pertenece una ruta del club. Cuenta el primer segmento tras
 * `/c/{slug}`, entero: `/c/club/train/…` es Entrenar. Todo lo demás es Inicio.
 */
export function activeNavKey(pathname: string, clubSlug: string): NavKey {
  const [, root, club, section] = pathname.split("/");
  if (root !== "c" || club !== clubSlug) return "home";

  return isSectionKey(section) ? section : "home";
}
