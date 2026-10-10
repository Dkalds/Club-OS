import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { noTeamsState } from "@/modules/team/no-teams";
import { getTeam } from "@/modules/team/queries";
import { getTeamScope } from "@/modules/team/scope";
import { Card } from "@/ui/card";
import { TeamIcon } from "@/ui/icons";
import { ListRow } from "@/ui/list-row";
import { EmptyState } from "@/ui/states";
import { TeamRoster } from "./_components/team-roster";

/**
 * Equipo: «mis equipos» de esta temporada, o el equipo activo si hay uno elegido en la
 * cabecera (`getTeamScope`). Con uno solo (lo normal en quien entrena, o tras elegir uno), su
 * plantilla aquí mismo; con varios (dirección, sin elegir), la lista, y cada uno lleva a la
 * suya. Sin ninguno, lo dice según quién lo lee.
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Si algo no se puede leer, la consulta lanza y lo recoge `error.tsx`.
 */
export default async function TeamPage({ params }: PageProps<"/c/[club]/team">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  const slug = ctx.org.slug;

  const { scoped: teams } = await getTeamScope(ctx);

  if (teams.length === 0) {
    return (
      <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
        <h1 className="font-display text-display-l uppercase">Equipo</h1>
        <EmptyState icon={<TeamIcon size={28} />} {...noTeamsState(ctx.membership.role, slug, "roster")} />
      </div>
    );
  }

  const only = teams.length === 1 ? teams[0] : undefined;
  if (only) {
    const team = await getTeam(ctx, only.id);
    // Entre la lista y el detalle el equipo ha dejado de verse: como cualquier otro que no se ve.
    if (!team) notFound();
    return (
      <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
        <h1 className="font-display text-display-l uppercase">{team.name}</h1>
        <TeamRoster team={team} clubSlug={slug} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
      <h1 className="font-display text-display-l uppercase">Equipo</h1>
      <Card variant="flush" as="ul">
        {teams.map((team) => (
          <ListRow
            key={team.id}
            href={`/c/${slug}/team/${team.id}`}
            lead={<TeamIcon size={24} />}
            title={team.name}
            subtitle={team.categoryName}
          />
        ))}
      </Card>
    </div>
  );
}
