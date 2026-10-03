import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { getWayIndex } from "@/modules/methodology/queries";
import { WayIndexView } from "@/ui/way-index-view";

/**
 * The Way del entrenador: el índice de las secciones publicadas de la metodología del club.
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Lo que se lee es solo lo publicado (`getWayIndex` filtra por club y estado aunque
 * RLS deje ver más). Si los datos no se pueden leer, `getWayIndex` lanza y lo recoge
 * `error.tsx`; mientras llegan, se ve `loading.tsx`.
 *
 * Si el club no ha publicado nada, quien administra puede ir a Gestión a escribirlo (`can`
 * solo muestra u oculta: el 404 de `/admin` y RLS son lo que protege) y el resto vuelve a Inicio.
 */
export default async function WayPage({ params }: PageProps<"/c/[club]/way">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  const { org, branding } = ctx;

  const sections = await getWayIndex(ctx);

  return (
    <WayIndexView
      wayName={branding.wayName}
      tagline={branding.tagline}
      sections={sections}
      clubSlug={org.slug}
      emptyAction={
        can(ctx, "admin.access")
          ? { label: "Ir a Gestión", href: `/c/${org.slug}/admin/way` }
          : { label: "Volver a Inicio", href: `/c/${org.slug}` }
      }
    />
  );
}
