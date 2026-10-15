import { adminPage } from "@/lib/guards";
import { listCategories } from "@/modules/structure/queries";
import { BackLink } from "@/ui/back-link";
import { TeamIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { CategoryEditor } from "../../_components/category-editor";

/** El hueco que se deja entre el orden de una categoría y el de la siguiente, para intercalar. */
const SORT_STEP = 10;

/**
 * Las categorías del club, en su orden: una card por categoría, desde la que se edita y, si
 * ningún equipo la lleva, se borra; debajo, el alta de una nueva. Son del club, no de una
 * temporada: los equipos de todas las temporadas las comparten.
 */
export default adminPage(async (ctx) => {
  const categories = await listCategories(ctx);
  const slug = ctx.org.slug;
  const nextSort = Math.max(0, ...categories.map((category) => category.sort)) + SORT_STEP;

  return (
    <>
      <BackLink href={`/c/${slug}/admin/season`} label="Temporada" />
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Categorías</h1>
        <p className="text-ink-2">Las comparten los equipos de todas las temporadas.</p>
      </header>

      {categories.length > 0 ? (
        <ul className="flex flex-col gap-(--space-4)">
          {categories.map((category) => (
            <li key={category.id}>
              <CategoryEditor clubSlug={slug} category={category} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<TeamIcon size={28} />}
          title="Aún no hay categorías"
          body="Crea la primera para poder crear equipos."
        />
      )}

      <CategoryEditor clubSlug={slug} nextSort={nextSort} />
    </>
  );
});
