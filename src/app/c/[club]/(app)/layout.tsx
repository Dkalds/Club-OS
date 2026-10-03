import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { navItems } from "@/modules/tenancy/navigation";
import { getViewerName } from "@/modules/tenancy/queries";
import { AppShell } from "@/ui/app-shell";
import { TopNavigation } from "@/ui/top-navigation";

/**
 * Marco de la app móvil del club (Inicio, The Way, Entrenar, Partidos, Equipo): cabecera
 * con la marca y el menú de cuenta, y navegación inferior. Los colores del club los pone
 * `../layout.tsx`.
 *
 * El layout de `/c/[club]` ya ha comprobado el club, pero un layout no protege al de
 * dentro: se vuelve a pedir el contexto, que con `cache()` es la misma consulta.
 *
 * El menú de cuenta ofrece «Gestión» solo a quien puede entrar (`can` solo muestra u
 * oculta: el 404 de `/admin` y RLS son lo que protege). Si el nombre no se puede leer,
 * `getViewerName` no falla: el avatar cae en «Tu cuenta».
 */
export default async function AppLayout({ children, params }: LayoutProps<"/c/[club]">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  const { org, branding } = ctx;
  const name = await getViewerName(ctx);

  return (
    <AppShell
      header={
        <TopNavigation
          brand={{ displayName: branding.displayName, wordmarkSub: branding.wordmarkSub }}
          account={{ name, adminHref: can(ctx, "admin.access") ? `/c/${org.slug}/admin` : null }}
        />
      }
      nav={navItems(org.slug, branding.terminology)}
      clubSlug={org.slug}
    >
      {children}
    </AppShell>
  );
}
