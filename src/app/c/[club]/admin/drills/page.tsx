import { adminPage } from "@/lib/guards";
import { listDraftDrillsForAdmin } from "@/modules/drills/admin-queries";
import { DrillsQueueScreen } from "./drills-queue-screen";

/**
 * Cola de revisión: los ejercicios en borrador de todo el club (no solo los propios, a
 * diferencia de la biblioteca normal), del más antiguo al más nuevo ([D11]). Publicar y
 * archivar reutilizan las acciones de la Fase 3.
 */
export default adminPage(async (ctx) => {
  const drafts = await listDraftDrillsForAdmin(ctx);

  return <DrillsQueueScreen clubSlug={ctx.org.slug} timezone={ctx.org.timezone} drafts={drafts} />;
});
