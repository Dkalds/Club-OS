import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { unstable_rethrow } from "next/navigation";
import { getTeamScope, type TeamScope } from "@/modules/team/scope";
import { hasIdentityTab, IDENTITY_LABEL, identityHref, navItems } from "@/modules/tenancy/navigation";
import { getViewerName } from "@/modules/tenancy/queries";
import type { AccountLink } from "@/ui/account-menu";
import { AppShell } from "@/ui/app-shell";
import { TopNavigation } from "@/ui/top-navigation";

/** «Mis equipos» y el activo, o `null` si no se pueden leer (el fallo ya queda registrado al leer). */
async function readTeamScope(ctx: Parameters<typeof getTeamScope>[0]): Promise<TeamScope | null> {
  try {
    return await getTeamScope(ctx);
  } catch (error) {
    // Lo que Next lanza para dirigir el flujo (un `notFound()`, el aviso de `cookies()`) sigue su camino.
    unstable_rethrow(error);
    return null;
  }
}

/**
 * Marco de la app móvil del club: cabecera con la marca y el menú de cuenta, y navegación
 * inferior con las pestañas del rol de quien entra (`navItems`). Los colores del club los pone
 * `../layout.tsx`.
 *
 * El layout de `/c/[club]` ya ha comprobado el club, pero un layout no protege al de
 * dentro: se vuelve a pedir el contexto, que con `cache()` es la misma consulta.
 *
 * La cabecera lleva el selector del equipo activo cuando quien entra tiene más de un equipo
 * (`getTeamScope`: «mis equipos» y el elegido; con `cache()`, la página que lo pide después no
 * vuelve a leerlos). Si «mis equipos» no se pueden leer, el marco se pinta sin selector: lo
 * que lance un layout no lo recoge el `error.tsx` de su mismo segmento, y Biblioteca o
 * Identidad no necesitan equipos. La pantalla que sí los necesite fallará en su propio límite.
 *
 * El menú de cuenta ofrece «Identidad» a quien no la tiene como pestaña (quien entrena y la
 * dirección) y «Gestión» solo a quien puede entrar (`can` solo muestra u oculta: el 404 de
 * `/admin` y RLS son lo que protege). Si el nombre no se puede leer,
 * `getViewerName` no falla: el avatar cae en «Tu cuenta».
 */
export default async function AppLayout({ children, params }: LayoutProps<"/c/[club]">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  const { org } = ctx;
  const { role } = ctx.membership;
  const [name, scope] = await Promise.all([getViewerName(ctx), readTeamScope(ctx)]);

  const links: AccountLink[] = [];
  if (!hasIdentityTab(role)) links.push({ label: IDENTITY_LABEL, href: identityHref(org.slug) });
  if (can(ctx, "admin.access")) links.push({ label: "Gestión", href: `/c/${org.slug}/admin` });

  return (
    <AppShell
      header={
        <TopNavigation
          brand={{ displayName: ctx.branding.displayName, wordmarkSub: ctx.branding.wordmarkSub }}
          account={{ name, links }}
          team={{
            clubSlug: org.slug,
            teams: (scope?.teams ?? []).map(({ id, name: teamName }) => ({ id, name: teamName })),
            activeId: scope?.active?.id ?? null,
          }}
        />
      }
      nav={navItems(org.slug, role)}
      clubSlug={org.slug}
    >
      {children}
    </AppShell>
  );
}
