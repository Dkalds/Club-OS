import { requireAdmin, requireClub } from "@/lib/guards";
import { listValuesForAdmin } from "@/modules/methodology/admin-queries";
import { WayIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { ValueEditor } from "../_components/value-editor";

/**
 * Los valores del club, todos, publicados o no, en su orden: una card por valor, desde la que se
 * edita, se ordena y se publica, y debajo se crea uno nuevo. Los entrenadores solo ven los
 * publicados, en la sección de valores de The Way.
 *
 * Cada card es un editor de cliente que se queda con lo que trae esta página al pintarse; al
 * guardar, ordenar o publicar, las acciones revalidan Gestión y la lista se repinta con lo nuevo.
 * Nada se borra: archivar un valor es pasarlo a borrador.
 */
export default async function AdminValuesPage({ params }: PageProps<"/c/[club]/admin/values">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  requireAdmin(ctx);

  const values = await listValuesForAdmin(ctx);
  const slug = ctx.org.slug;

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Valores</h1>
        <p className="text-ink-2">Los entrenadores solo ven lo publicado.</p>
      </header>

      {values.length > 0 ? (
        <ul className="flex flex-col gap-(--space-4)">
          {values.map((value, index) => (
            <li key={value.id}>
              <ValueEditor
                clubSlug={slug}
                value={value}
                isFirst={index === 0}
                isLast={index === values.length - 1}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<WayIcon size={28} />}
          title="Aún no hay valores"
          body="Crea el primer valor de tu club."
        />
      )}

      <ValueEditor clubSlug={slug} />
    </>
  );
}
