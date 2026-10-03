import { requireAdmin, requireClub } from "@/lib/guards";
import { listPrinciplesForAdmin } from "@/modules/methodology/admin-queries";
import { WayIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { PrincipleEditor } from "../_components/principle-editor";

/**
 * Los principios de juego del club, todos, publicados o no, con sus puntos y en su orden: una
 * card por principio, desde la que se edita (título, resumen y puntos), se ordena y se publica,
 * y debajo se crea uno nuevo. Los entrenadores solo ven los publicados, en la sección de
 * principios de The Way.
 *
 * Cada card es un editor de cliente que se queda con lo que trae esta página al pintarse; al
 * guardar, ordenar o publicar, las acciones revalidan Gestión y la lista se repinta con lo nuevo.
 * Nada se borra: archivar un principio es pasarlo a borrador. Un principio nuevo no lleva puntos:
 * se le añaden desde su card.
 */
export default async function AdminPrinciplesPage({
  params,
}: PageProps<"/c/[club]/admin/principles">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  requireAdmin(ctx);

  const principles = await listPrinciplesForAdmin(ctx);
  const slug = ctx.org.slug;

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Principios</h1>
        <p className="text-ink-2">Los entrenadores solo ven lo publicado.</p>
      </header>

      {principles.length > 0 ? (
        <ul className="flex flex-col gap-(--space-4)">
          {principles.map((principle, index) => (
            <li key={principle.id}>
              <PrincipleEditor
                clubSlug={slug}
                principle={principle}
                isFirst={index === 0}
                isLast={index === principles.length - 1}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<WayIcon size={28} />}
          title="Aún no hay principios"
          body="Crea el primer principio de juego de tu club."
        />
      )}

      <PrincipleEditor clubSlug={slug} />
    </>
  );
}
