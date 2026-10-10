import { notFound } from "next/navigation";
import { requireClub, requireTerms } from "@/lib/guards";
import { getLiveSession } from "@/modules/live/queries";
import { LiveScreen } from "./live-screen";

export const dynamic = "force-dynamic";

export default async function LivePage({ params }: { params: Promise<{ club: string; eventId: string }> }) {
  const { club, eventId } = await params;
  const ctx = await requireClub(club);
  await requireTerms(ctx);
  const session = await getLiveSession(ctx, eventId);
  if (!session) notFound();
  return <LiveScreen session={session} clubSlug={club} />;
}
