import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { getTeamScope } from "@/modules/team/scope";
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
 * La cabecera lleva el selector del equipo activo cuando quien entra tiene más de un equipo
 * (`getTeamScope`: «mis equipos» y el elegido; con `cache()`, la página que lo pide después no
 * vuelve a leerlos). Si «mis equipos» no se pueden leer, lanza y lo recoge `error.tsx`.
 *
 * El menú de cuenta ofrece «Gestión» solo a quien puede entrar (`can` solo muestra u
 * oculta: el 404 de `/admin` y RLS son lo que protege). Si el nombre no se puede leer,
 * `getViewerName` no falla: el avatar cae en «Tu cuenta».
 */
export default async function AppLayout({ children, params }: LayoutProps<"/c/[club]">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  const { org, branding } = ctx;
  const [name, scope] = await Promise.all([getViewerName(ctx), getTeamScope(ctx)]);

  return (
    <AppShell
      header={
        <TopNavigation
          brand={{ displayName: branding.displayName, wordmarkSub: branding.wordmarkSub }}
          account={{ name, adminHref: can(ctx, "admin.access") ? `/c/${org.slug}/admin` : null }}
          team={{
            clubSlug: org.slug,
            teams: scope.teams.map(({ id, name: teamName }) => ({ id, name: teamName })),
            activeId: scope.active?.id ?? null,
          }}
        />
      }
      nav={navItems(org.slug, branding.terminology)}
      clubSlug={org.slug}
    >
      {children}
    </AppShell>
  );
}
