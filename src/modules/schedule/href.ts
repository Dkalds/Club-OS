import type { AgendaFilters } from "./types";

/**
 * La URL de la agenda con esos filtros. Los valores por defecto (próximos, todo) no van en la
 * query: la URL más corta es la de la pantalla tal como se abre.
 */
export function agendaHref(clubSlug: string, { scope, kind }: AgendaFilters): string {
  const query = new URLSearchParams();
  if (scope !== "upcoming") query.set("scope", scope);
  if (kind !== "all") query.set("kind", kind);
  const search = query.toString();

  return `/c/${clubSlug}/agenda${search ? `?${search}` : ""}`;
}
