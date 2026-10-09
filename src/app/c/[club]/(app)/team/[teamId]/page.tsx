import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { getTeam } from "@/modules/team/queries";
import { BackLink } from "@/ui/back-link";
import { TeamRoster } from "../_components/team-roster";

/**
 * La plantilla de un equipo de «mis equipos». Un equipo que no existe, de otro club, de otra
 * temporada o que no se ve: el mismo 404, que no distingue entre esos casos.
 */
export default async function TeamDetailPage({ params }: PageProps<"/c/[club]/team/[teamId]">) {
  const { club, teamId } = await params;
  const ctx = await requireClub(club);

  const team = await getTeam(ctx, teamId);
  if (!team) notFound();

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
      <BackLink href={`/c/${ctx.org.slug}/team`} label="Equipo" />
      <h1 className="font-display text-display-l uppercase">{team.name}</h1>
      <TeamRoster team={team} clubSlug={ctx.org.slug} />
    </div>
  );
}
