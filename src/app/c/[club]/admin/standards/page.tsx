import { adminPage } from "@/lib/guards";
import { listStandardsForAdmin } from "@/modules/methodology/admin-queries";
import { standardsLabel } from "@/modules/tenancy/navigation";
import { WayIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { StandardEditor } from "../_components/standard-editor";

/**
 * Los Standards del club, todos, publicados o no, en su orden: una card por Standard, desde la
 * que se edita, se ordena y se publica, y debajo se crea uno nuevo. El título es el nombre que
 * el club da a sus Standards. Los entrenadores solo ven los publicados.
 *
 * El número de cada Standard lo elige dirección y es único por club: se pinta tal cual («03»),
 * no es la posición en la lista. El alta propone el siguiente al mayor que haya, borradores
 * incluidos.
 *
 * Cada card es un editor de cliente que se queda con lo que trae esta página al pintarse; al
 * guardar, ordenar o publicar, las acciones revalidan Gestión y la lista se repinta con lo nuevo.
 * Nada se borra: archivar un Standard es pasarlo a borrador.
 */
export default adminPage(async (ctx) => {
  const standards = await listStandardsForAdmin(ctx);
  const slug = ctx.org.slug;
  const defaultNumber = Math.max(0, ...standards.map((standard) => standard.number)) + 1;

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">
          {standardsLabel(ctx.branding.terminology)}
        </h1>
        <p className="text-ink-2">Los entrenadores solo ven lo publicado.</p>
      </header>

      {standards.length > 0 ? (
        <ul className="flex flex-col gap-(--space-4)">
          {standards.map((standard, index) => (
            <li key={standard.id}>
              <StandardEditor
                clubSlug={slug}
                standard={standard}
                isFirst={index === 0}
                isLast={index === standards.length - 1}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<WayIcon size={28} />}
          title="Aún no hay Standards"
          body="Crea el primer Standard de tu club."
        />
      )}

      <StandardEditor clubSlug={slug} defaultNumber={defaultNumber} />
    </>
  );
});
