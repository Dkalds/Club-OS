import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { defaultSessionDate } from "@/lib/time";
import { DEFAULT_GAME_MINUTES } from "@/modules/games/limits";
import { noTeamsState } from "@/modules/team/no-teams";
import { listMyTeams } from "@/modules/team/queries";
import { BackLink } from "@/ui/back-link";
import { TeamIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { GameForm } from "../_components/game-form";

/** La hora a la que se propone un partido nuevo: la mañana del sábado es lo habitual. */
const DEFAULT_GAME_TIME = "10:00";

/** Nuevo partido de uno de «mis equipos». Sin permiso, el mismo 404 que cualquier página que no se ve. */
export default async function NewGamePage({ params }: PageProps<"/c/[club]/games/new">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  if (!can(ctx, "game.manage")) notFound();

  const teams = await listMyTeams(ctx);
  const gamesHref = `/c/${ctx.org.slug}/games`;
  const first = teams[0];

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
      <BackLink href={gamesHref} label="Partidos" />
      <h1 className="font-display text-display-l uppercase">Nuevo partido</h1>
      {first ? (
        <GameForm
          clubSlug={ctx.org.slug}
          teams={teams}
          initial={{
            teamId: first.id,
            opponent: "",
            date: defaultSessionDate(new Date().toISOString(), ctx.org.timezone, DEFAULT_GAME_TIME),
            time: DEFAULT_GAME_TIME,
            durationMinutes: String(DEFAULT_GAME_MINUTES),
            homeAway: "",
            competition: "",
            location: "",
            opponentNotes: "",
          }}
        />
      ) : (
        <EmptyState icon={<TeamIcon size={28} />} {...noTeamsState(ctx.membership.role, ctx.org.slug, "games")} />
      )}
    </div>
  );
}
