import Link from "next/link";
import type { ReactNode } from "react";
import { noTeamsState } from "@/modules/team/no-teams";
import type { ClubContext } from "@/modules/tenancy/queries";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { GamesIcon, PlusIcon, TeamIcon } from "@/ui/icons";
import { DateChip, ListRow } from "@/ui/list-row";
import { EmptyState } from "@/ui/states";
import { gameStatusLabel, scoreLabel } from "./format";
import { LIST_LIMIT } from "./limits";
import type { GameListItem, GameScope } from "./types";

// Las dos pestañas son enlaces con la forma de los chips de `ui/filter.tsx`, como las de
// Entrenar (`practice-list.tsx`): la activa sale de `aria-current` del enlace.
const TAB_LINK = "group inline-flex min-h-(--target-min) shrink-0 items-center focus-visible:outline-hidden";
const TAB_PILL =
  "inline-flex h-9 items-center rounded-pill border border-line bg-surface-2 px-(--space-3) " +
  "text-body-s font-semibold whitespace-nowrap text-ink-2 " +
  "group-aria-[current=page]:border-brand-accent group-aria-[current=page]:bg-brand-accent-soft " +
  "group-aria-[current=page]:text-brand-accent " +
  "group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-focus-ring";

/** Lo de debajo del rival: el equipo si hay varios, local o visitante, y la competición. */
function subtitleOf(game: GameListItem, teamCount: number): string {
  const side = game.homeAway === "home" ? "Local" : game.homeAway === "away" ? "Visitante" : null;
  return [teamCount > 1 ? game.teamName : null, side, game.competition].filter(Boolean).join(" · ");
}

/** A la derecha: la hora de uno que viene; el marcador de uno jugado; si no, su estado. */
function trailOf(game: GameListItem, scope: GameScope): ReactNode {
  if (game.score) {
    return (
      <span className="font-display text-body-strong text-ink">
        <span aria-hidden="true">{scoreLabel(game.score)}</span>
        <span className="sr-only">{`${game.score.for} a ${game.score.against}`}</span>
      </span>
    );
  }
  return gameStatusLabel(game.status, game.started) ?? (scope === "upcoming" ? game.time : null);
}

/**
 * Los partidos de «mis equipos»: «Nuevo partido» con permiso, las pestañas «Próximos» y
 * «Jugados» y la lista de la abierta. Solo pinta: los partidos llegan ya leídos, con las horas
 * en la zona del club. El `<h1>` es de la página.
 */
export function GameList({
  clubSlug,
  scope,
  games,
  teamCount,
  canCreate,
  role,
  truncated,
}: {
  clubSlug: string;
  scope: GameScope;
  games: GameListItem[];
  teamCount: number;
  canCreate: boolean;
  role: ClubContext["membership"]["role"];
  truncated: boolean;
}) {
  const gamesHref = `/c/${clubSlug}/games`;
  const playedHref = `${gamesHref}?scope=played`;
  const newHref = `${gamesHref}/new`;

  if (teamCount === 0) {
    return <EmptyState icon={<TeamIcon size={28} />} {...noTeamsState(role, clubSlug, "games")} />;
  }

  const empty = games.length === 0;

  return (
    <div className="flex flex-col gap-(--space-3)">
      {canCreate ? (
        <CTAButton variant="primary" block href={newHref} icon={<PlusIcon size={20} />}>
          Nuevo partido
        </CTAButton>
      ) : null}

      <nav aria-label="Partidos" className="flex gap-(--space-2)">
        <Link href={gamesHref} prefetch={false} aria-current={scope === "upcoming" ? "page" : undefined} className={TAB_LINK}>
          <span className={TAB_PILL}>Próximos</span>
        </Link>
        <Link href={playedHref} prefetch={false} aria-current={scope === "played" ? "page" : undefined} className={TAB_LINK}>
          <span className={TAB_PILL}>Jugados</span>
        </Link>
      </nav>

      {!empty ? (
        <>
          <Card variant="flush" as="ul">
            {games.map((game) => (
              <ListRow
                key={game.eventId}
                href={`${gamesHref}/${game.eventId}`}
                lead={
                  scope === "played" ? (
                    <DateChip month={game.monthChip.month} day={game.monthChip.day} />
                  ) : (
                    <DateChip dow={game.dateChip.dow} day={game.dateChip.day} />
                  )
                }
                title={game.opponent}
                subtitle={subtitleOf(game, teamCount)}
                trail={trailOf(game, scope)}
              />
            ))}
          </Card>
          {truncated ? <p className="text-body-s text-ink-2">{`Mostrando los ${LIST_LIMIT} más recientes`}</p> : null}
        </>
      ) : scope === "played" ? (
        <EmptyState
          icon={<GamesIcon size={28} />}
          title="Aún no hay partidos jugados"
          body="Los partidos que pasen aparecerán aquí, con su resultado."
          action={{ label: "Ver próximos", href: gamesHref }}
        />
      ) : (
        <EmptyState
          icon={<GamesIcon size={28} />}
          title="No hay partidos programados"
          body={canCreate ? "Añade el próximo partido de tu equipo." : "Cuando haya un partido en el calendario, lo verás aquí."}
          action={{ label: "Ver jugados", href: playedHref }}
        />
      )}
    </div>
  );
}
