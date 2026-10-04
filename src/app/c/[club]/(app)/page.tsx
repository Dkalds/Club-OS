import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { HomeScreen } from "@/modules/home/home-screen";
import { getHomeData } from "@/modules/home/queries";

/**
 * Inicio del club: el próximo entrenamiento, el próximo partido y la semana de quien entra.
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Sin club (no existe o no es el tuyo), el mismo 404 de siempre.
 *
 * La hora se lee una sola vez, aquí, en el servidor. Con ella `getHomeData` decide qué es
 * «próximo» y qué es «esta semana», y formatea todas las horas en la zona del club: nada
 * se calcula en el navegador. Si los datos no se pueden leer, `getHomeData` lanza y lo
 * recoge `error.tsx`; mientras llegan, se ve `loading.tsx`.
 *
 * `can` solo muestra u oculta «Nueva sesión» en el aviso sin entrenamiento: lo que protege es
 * RLS y la acción de crear.
 */
export default async function ClubHomePage({ params }: PageProps<"/c/[club]">) {
  const { club } = await params;
  const ctx = await requireClub(club);

  const home = await getHomeData(ctx, new Date().toISOString());

  return (
    <HomeScreen
      home={home}
      clubSlug={ctx.org.slug}
      ownShortName={ctx.branding.shortName}
      canCreatePractice={can(ctx, "practice.manage")}
    />
  );
}
