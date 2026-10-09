import { notFound } from "next/navigation";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { getGame } from "@/modules/games/queries";
import { BackLink } from "@/ui/back-link";
import { GamesIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { GameForm } from "../../_components/game-form";

/** Editar un partido. Uno cancelado ya no cambia ([D9]): lo dice y vuelve a su detalle. */
export default async function EditGamePage({ params }: PageProps<"/c/[club]/games/[eventId]/edit">) {
  const { club, eventId } = await params;
  const ctx = await requireClub(club);
  if (!can(ctx, "game.manage")) notFound();

  const game = await getGame(ctx, eventId, new Date().toISOString());
  if (!game) notFound();
  const detailHref = `/c/${ctx.org.slug}/games/${game.eventId}`;

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
      <BackLink href={detailHref} label="Partido" />
      <h1 className="font-display text-display-l uppercase">Editar partido</h1>
      {game.status === "cancelled" ? (
        <EmptyState
          icon={<GamesIcon size={28} />}
          title="Partido cancelado"
          body={ACTION_ERROR_COPY.GAME_CLOSED}
          action={{ label: "Volver al partido", href: detailHref }}
        />
      ) : (
        <GameForm
          clubSlug={ctx.org.slug}
          teams={[{ id: game.teamId, name: game.teamName }]}
          eventId={game.eventId}
          initial={{
            teamId: game.teamId,
            opponent: game.opponent,
            date: game.form.date,
            time: game.form.time,
            durationMinutes: String(game.form.durationMinutes),
            homeAway: game.homeAway ?? "",
            competition: game.competition ?? "",
            location: game.location ?? "",
            opponentNotes: game.opponentNotes ?? "",
          }}
        />
      )}
    </div>
  );
}
