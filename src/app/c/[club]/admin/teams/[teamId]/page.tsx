import { notFound } from "next/navigation";
import { adminPage } from "@/lib/guards";
import { getAdminTeam, listCategories, listPeople } from "@/modules/structure/queries";
import { BackLink } from "@/ui/back-link";
import { RosterSection } from "../../_components/roster-section";
import { StaffSection } from "../../_components/staff-section";
import { Pill } from "../../_components/structure-shared";
import { TeamDelete, TeamEditor } from "../../_components/team-editor";

/**
 * Un equipo del club en Gestión, de la temporada que sea: sus datos, su cuerpo técnico, su
 * plantilla y borrarlo. Uno que no existe, que es de otro club o cuyo id no tiene forma de uuid
 * da el mismo 404 (`getAdminTeam` devuelve `null` en los tres casos).
 *
 * Los buscadores eligen entre las personas sin archivar del club, que viajan con la página.
 */
export default adminPage<{ club: string; teamId: string }>(async (ctx, { teamId }) => {
  const [team, categories, everyone] = await Promise.all([
    getAdminTeam(ctx, teamId),
    listCategories(ctx),
    listPeople(ctx),
  ]);
  if (!team) notFound();

  const slug = ctx.org.slug;
  const people = everyone
    .filter((person) => !person.archived)
    .map(({ id, firstName, lastName, birthYear }) => ({ id, firstName, lastName, birthYear }));

  return (
    <>
      <BackLink href={`/c/${slug}/admin/season/${team.season.id}`} label={`Temporada ${team.season.name}`} />
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="min-w-0 font-display text-display-l wrap-break-word uppercase">{team.name}</h1>
        <div className="flex flex-wrap items-center gap-(--space-2) text-ink-2">
          <p>{`${team.categoryName} · ${team.season.name}`}</p>
          {team.season.isCurrent ? null : <Pill tone="muted">Otra temporada</Pill>}
        </div>
      </header>

      <StaffSection clubSlug={slug} teamId={team.id} staff={team.staff} people={people} />
      <RosterSection clubSlug={slug} teamId={team.id} players={team.players} people={people} />
      <TeamEditor clubSlug={slug} seasonId={team.season.id} team={team} categories={categories} />
      <TeamDelete clubSlug={slug} team={team} seasonId={team.season.id} />
    </>
  );
});
