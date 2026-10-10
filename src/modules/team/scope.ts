import { cookies } from "next/headers";
import { cache } from "react";
import { UUID_RE } from "@/lib/uuid";
import type { ClubContext } from "@/modules/tenancy/queries";
import { listMyTeams } from "./queries";
import type { TeamSummary } from "./types";

// El equipo activo: de «mis equipos», uno elegido o todos. Vale para toda la app (Inicio,
// Agenda, Sesiones y Equipo leen `scoped`) y se guarda en una cookie por club.
//
// La cookie solo filtra dentro de lo que la persona ya puede ver: nunca da acceso. Lo que
// decide qué equipos son suyos es `listMyTeams`, con su sesión y RLS; un valor que no es uno
// de ellos se ignora.

/**
 * El nombre de la cookie. No lleva el club: su `path` es `/c/{slug}`, así que cada club tiene
 * la suya y el navegador solo la manda dentro de ese club.
 */
export const ACTIVE_TEAM_COOKIE = "active-team";

/** La ruta de la cookie del equipo activo de un club. */
export function activeTeamCookiePath(clubSlug: string): string {
  return `/c/${clubSlug}`;
}

export type TeamScope = {
  /** «Mis equipos» de esta temporada, por nombre. */
  teams: TeamSummary[];
  /** El equipo elegido, o `null` si se ven todos. */
  active: TeamSummary | null;
  /** Los equipos que hay que enseñar: el elegido, o todos. */
  scoped: TeamSummary[];
};

function byName(a: TeamSummary, b: TeamSummary): number {
  return a.name.localeCompare(b.name, "es") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * El ámbito a partir de «mis equipos» y del valor de la cookie. Pura.
 *
 * Solo vale un uuid que sea de uno de esos equipos. Cualquier otra cosa (sin cookie, un texto
 * cualquiera, el equipo de otro club, uno que ya no es mío porque cambió la temporada o salí
 * de su cuerpo técnico) es como no tener cookie: se ven todos, no una pantalla vacía.
 */
export function pickScope(teams: readonly TeamSummary[], cookie: string | undefined): TeamScope {
  const sorted = [...teams].sort(byName);
  const active =
    cookie !== undefined && UUID_RE.test(cookie) ? (sorted.find((team) => team.id === cookie) ?? null) : null;

  return { teams: sorted, active, scoped: active ? [active] : sorted };
}

/**
 * El ámbito de equipos de quien tiene este contexto, en esta petición. Con `cache()`, el
 * layout y la página que lo piden hacen una sola lectura de «mis equipos».
 */
export const getTeamScope = cache(async (ctx: ClubContext): Promise<TeamScope> => {
  // Antes de leer nada: `cookies()` avisa a Next lanzando, y ese aviso tiene que subir tal cual.
  const store = await cookies();
  const teams = await listMyTeams(ctx);

  return pickScope(teams, store.get(ACTIVE_TEAM_COOKIE)?.value);
});
