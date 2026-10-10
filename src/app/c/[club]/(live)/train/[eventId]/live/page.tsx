import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { getLiveSession } from "@/modules/live/queries";
import { LiveScreen } from "./live-screen";

export const dynamic = "force-dynamic";

/**
 * El directo de una sesión de entrenamiento, a pantalla completa y sin navegación.
 *
 * La página pide el contexto ella misma, antes de leer nada. Una sesión que no existe, que es
 * de otro club o de otro equipo (RLS no la deja ver) o que está cancelada da el mismo 404. Una
 * ya hecha no tiene directo: su ficha es el resumen, y allí se va. Lo mismo una sin ejercicios,
 * que no tiene nada que dirigir.
 */
export default async function LivePage({ params }: { params: Promise<{ club: string; eventId: string }> }) {
  const { club, eventId } = await params;
  const ctx = await requireClub(club);

  const found = await getLiveSession(ctx, eventId);
  if (!found) notFound();

  const detailHref = `/c/${ctx.org.slug}/train/${eventId}`;
  if (found.status === "done" || found.session.items.length === 0) redirect(detailHref);

  return <LiveScreen session={found.session} clubSlug={ctx.org.slug} />;
}
