import { requireClub } from "@/lib/guards";
import { navItems } from "@/modules/tenancy/navigation";
import { AppShell } from "@/ui/app-shell";
import { TopNavigation } from "@/ui/top-navigation";

/**
 * Marco de la app móvil del club (Inicio, The Way, Entrenar, Partidos, Equipo): cabecera
 * con la marca y navegación inferior. La marca (colores) la pone `../layout.tsx`.
 *
 * El layout de `/c/[club]` ya ha comprobado el club, pero un layout no protege al de
 * dentro: se vuelve a pedir el contexto, que con `cache()` es la misma consulta.
 */
export default async function AppLayout({ children, params }: LayoutProps<"/c/[club]">) {
  const { club } = await params;
  const { org, branding } = await requireClub(club);

  return (
    <AppShell
      header={
        <TopNavigation
          brand={{ displayName: branding.displayName, wordmarkSub: branding.wordmarkSub }}
        />
      }
      nav={navItems(org.slug, branding.terminology)}
      clubSlug={org.slug}
    >
      {children}
    </AppShell>
  );
}
