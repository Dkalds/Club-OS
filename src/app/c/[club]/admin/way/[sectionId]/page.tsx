import { notFound } from "next/navigation";
import { requireAdmin, requireClub } from "@/lib/guards";
import { getSectionForAdmin } from "@/modules/methodology/admin-queries";
import { SectionEditor } from "../../_components/section-editor";

/**
 * El editor de una sección, sea cual sea su estado. Una sección que no existe, que es de otro
 * club o cuyo id no tiene forma de uuid da el mismo 404 (`getSectionForAdmin` devuelve `null`
 * en los tres casos); lo pinta `../../not-found.tsx`, dentro del marco de Gestión.
 *
 * El formulario es de cliente y se queda con lo que trae esta página al abrirla.
 */
export default async function AdminWaySectionPage({
  params,
}: PageProps<"/c/[club]/admin/way/[sectionId]">) {
  const { club, sectionId } = await params;
  const ctx = await requireClub(club);
  requireAdmin(ctx);

  const section = await getSectionForAdmin(ctx, sectionId);
  if (!section) notFound();

  return (
    <>
      <h1 className="font-display text-display-l uppercase">Editar sección</h1>
      <SectionEditor clubSlug={ctx.org.slug} section={section} />
    </>
  );
}
