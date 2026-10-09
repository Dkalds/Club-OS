import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { getGame } from "@/modules/games/queries";
import { BackLink } from "@/ui/back-link";
import { GameCard } from "@/ui/game-card";
import { GameActions } from "../_components/game-actions";

/**
 * El detalle de un partido: los dos equipos y, si se jugó, el marcador; cuándo, dónde y la
 * competición; y lo que se puede hacer con él. Uno que no existe, de otro club o de otra
 * temporada, o que no se ve: el mismo 404.
 */
export default async function GamePage({ params }: PageProps<"/c/[club]/games/[eventId]">) {
  const { club, eventId } = await params;
  const ctx = await requireClub(club);

  const game = await getGame(ctx, eventId, new Date().toISOString());
  if (!game) notFound();

  const manage = can(ctx, "game.manage");

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
      <BackLink href={`/c/${ctx.org.slug}/games`} label="Partidos" />
      <h1 className="sr-only">{`${game.teamName} contra ${game.opponent}`}</h1>

      <GameCard
        game={game}
        ownShortName={ctx.branding.shortName}
        label={game.status === "cancelled" ? "Partido cancelado" : "Partido"}
        score={game.score}
      />

      <dl className="flex flex-col gap-(--space-3)">
        {game.location ? (
          <div>
            <dt className="text-label text-ink-3 uppercase">Lugar</dt>
            <dd className="text-body">{game.location}</dd>
          </div>
        ) : null}
        {game.status === "scheduled" && game.started && !game.score ? (
          <div>
            <dt className="text-label text-ink-3 uppercase">Resultado</dt>
            <dd className="text-body text-ink-2">Aún sin apuntar.</dd>
          </div>
        ) : null}
        {manage && game.opponentNotes ? (
          <div>
            <dt className="text-label text-ink-3 uppercase">Notas del rival</dt>
            <dd className="text-body whitespace-pre-line">{game.opponentNotes}</dd>
          </div>
        ) : null}
      </dl>

      {manage ? <GameActions clubSlug={ctx.org.slug} game={game} teamLabel={game.teamName} /> : null}
    </div>
  );
}
