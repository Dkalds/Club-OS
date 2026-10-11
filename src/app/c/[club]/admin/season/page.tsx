import { notFound } from "next/navigation";
import { adminPage } from "@/lib/guards";
import { defaultSeason, getSeason, listCategories, listSeasons } from "@/modules/structure/queries";
import { TeamIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { SeasonEditor } from "../_components/season-editor";
import { SeasonView } from "../_components/season-view";

/**
 * La temporada del club que toca enseñar sin decir cuál: la actual y, si no hay ninguna actual,
 * la más reciente. Un club sin temporadas ve el alta de la primera, que nace actual.
 *
 * Las demás temporadas tienen su URL (`season/[seasonId]`), con la misma vista.
 */
export default adminPage(async (ctx) => {
  const seasons = await listSeasons(ctx);
  const current = defaultSeason(seasons);

  if (!current) {
    return (
      <>
        <header className="flex flex-col gap-(--space-2)">
          <h1 className="font-display text-display-l uppercase">Temporada</h1>
          <p className="text-ink-2">Lo que ve el club en la app es siempre la temporada actual.</p>
        </header>
        <EmptyState
          icon={<TeamIcon size={28} />}
          title="Aún no hay temporadas"
          body="Crea la primera: será la temporada actual de tu club."
        />
        <SeasonEditor clubSlug={ctx.org.slug} />
      </>
    );
  }

  const [season, categories] = await Promise.all([getSeason(ctx, current.id), listCategories(ctx)]);
  // Borrada entre una lectura y la otra.
  if (!season) notFound();

  return <SeasonView clubSlug={ctx.org.slug} season={season} seasons={seasons} categories={categories} />;
});
