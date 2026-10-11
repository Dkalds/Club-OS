import { notFound } from "next/navigation";
import { adminPage } from "@/lib/guards";
import { getSeason, listCategories, listSeasons } from "@/modules/structure/queries";
import { SeasonView } from "../../_components/season-view";

/**
 * Una temporada del club, la actual o cualquier otra. Una que no existe, que es de otro club o
 * cuyo id no tiene forma de uuid da el mismo 404 (`getSeason` devuelve `null` en los tres casos).
 */
export default adminPage<{ club: string; seasonId: string }>(async (ctx, { seasonId }) => {
  const [season, seasons, categories] = await Promise.all([
    getSeason(ctx, seasonId),
    listSeasons(ctx),
    listCategories(ctx),
  ]);
  if (!season) notFound();

  return <SeasonView clubSlug={ctx.org.slug} season={season} seasons={seasons} categories={categories} />;
});
