import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { GameList } from "@/modules/games/game-list";
import { listGames } from "@/modules/games/queries";

/**
 * Partidos: los de «mis equipos», próximos y jugados. La pestaña sale de la URL: solo
 * `?scope=played`, exacto, son los jugados. La hora se lee aquí, en el servidor, una sola vez.
 * `can` solo muestra u oculta «Nuevo partido»: lo que protege es RLS y la acción de crear.
 */
export default async function GamesPage({ params, searchParams }: PageProps<"/c/[club]/games">) {
  const { club } = await params;
  const ctx = await requireClub(club);

  const { scope: requested } = await searchParams;
  const scope = requested === "played" ? "played" : "upcoming";

  const { games, teamCount, truncated } = await listGames(ctx, scope, new Date().toISOString());

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
      <h1 className="font-display text-display-l uppercase">Partidos</h1>
      <GameList
        clubSlug={ctx.org.slug}
        scope={scope}
        games={games}
        teamCount={teamCount}
        canCreate={can(ctx, "game.manage")}
        role={ctx.membership.role}
        truncated={truncated}
      />
    </div>
  );
}
