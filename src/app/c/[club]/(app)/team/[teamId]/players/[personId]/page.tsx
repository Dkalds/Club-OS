import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { getGoalFormOptions, getPlayerProfile } from "@/modules/development/queries";
import { BackLink } from "@/ui/back-link";
import { PlayerGoals } from "./_components/player-goals";
import { PlayerNotes } from "./_components/player-notes";

/**
 * La ficha de un jugador en un equipo: quién es (sin año de nacimiento, [D5]), sus objetivos y
 * las notas del cuerpo técnico que quien mira puede leer. La URL lleva ids opacos; el nombre del
 * jugador no sale en la URL ni en el título de la página.
 *
 * Un jugador que no está en la plantilla de ese equipo de esta temporada, de otro club o que
 * no se ve: el mismo 404. Qué objetivos y qué notas llegan lo decide RLS.
 */
export default async function PlayerPage({ params }: PageProps<"/c/[club]/team/[teamId]/players/[personId]">) {
  const { club, teamId, personId } = await params;
  const ctx = await requireClub(club);

  const profile = await getPlayerProfile(ctx, teamId, personId);
  if (!profile) notFound();

  const canManageGoals = can(ctx, "goal.manage");
  const options = canManageGoals ? await getGoalFormOptions(ctx) : { focusAreas: [], standards: [] };
  const slug = ctx.org.slug;

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
      <BackLink href={`/c/${slug}/team/${profile.team.id}`} label={profile.team.name} />

      <header className="flex items-center gap-(--space-4)">
        <span className="w-12 shrink-0 text-right font-display text-display-l text-brand-accent tabular-nums">
          {profile.jerseyNumber === null ? null : (
            <>
              <span aria-hidden="true">{profile.jerseyNumber}</span>
              <span className="sr-only">{`Dorsal ${profile.jerseyNumber}`}</span>
            </>
          )}
        </span>
        <div className="flex min-w-0 flex-col gap-(--space-1)">
          <h1 className="font-display text-display-m uppercase wrap-anywhere">{`${profile.firstName} ${profile.lastName}`}</h1>
          <p className="text-body-s text-ink-3">
            {[profile.position, profile.team.name, profile.team.categoryName].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      <PlayerGoals
        clubSlug={slug}
        teamId={profile.team.id}
        personId={profile.personId}
        activeGoals={profile.activeGoals}
        pastGoals={profile.pastGoals}
        options={options}
        canManage={canManageGoals}
      />

      <PlayerNotes
        clubSlug={slug}
        teamId={profile.team.id}
        personId={profile.personId}
        notes={profile.notes}
        canWrite={can(ctx, "note.manage")}
      />
    </div>
  );
}
