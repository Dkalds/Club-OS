import { notFound } from "next/navigation";
import type { ComponentType } from "react";
import { requireClub } from "@/lib/guards";
import { navItems, type NavKey } from "@/modules/tenancy/navigation";
import { GamesIcon, TeamIcon, type IconProps } from "@/ui/icons";
import { EmptyState } from "@/ui/states";

/** Las pestañas que aún no tienen pantalla. Las demás ya pintan la suya. */
type Tab = Extract<NavKey, "games" | "team">;

/** El mismo icono que la pestaña lleva en la navegación. */
const ICONS: Record<Tab, ComponentType<IconProps>> = {
  games: GamesIcon,
  team: TeamIcon,
};

/**
 * Contenido provisional de una pestaña que todavía no tiene pantalla.
 *
 * El título usa la etiqueta que la pestaña lleva en la navegación, y es el `<h1>` de la
 * pantalla: aquí el estado vacío es todo el contenido. No lleva acción: no hay nada que crear
 * todavía, y la salida es la navegación del club.
 *
 * Pide el contexto ella misma antes de pintar nada: un layout no protege a sus páginas.
 */
export async function ComingSoon({ clubSlug, tab }: { clubSlug: string; tab: Tab }) {
  const context = await requireClub(clubSlug);

  const item = navItems(context.org.slug, context.branding.terminology).find(
    (candidate) => candidate.key === tab,
  );
  if (!item) notFound();

  const TabIcon = ICONS[tab];

  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <EmptyState
        headingLevel={1}
        icon={<TabIcon size={28} />}
        title={`${item.label} llega en una próxima fase`}
        body="Estamos preparando esta sección."
      />
    </div>
  );
}
