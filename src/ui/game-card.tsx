import type { HomeGame } from "@/modules/home/types";
import { Avatar } from "./avatar";
import { Card } from "./card";

/**
 * La abreviatura de un equipo rival para su avatar: las tres primeras letras de la última
 * palabra, en mayúsculas y sin acentos (`'CB Rival'` → `'RIV'`, `'Ávila'` → `'AVI'`). Solo
 * cuentan letras y cifras; un texto sin ninguna devuelve `'?'`.
 */
export function teamAbbr(name: string): string {
  const words = name
    .split(/\s+/)
    // NFD separa cada letra de su acento y lo que no es letra ni cifra (el acento suelto
    // incluido) se descarta.
    .map((word) => word.normalize("NFD").replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word !== "");
  const last = words[words.length - 1];

  if (last === undefined) return "?";
  return Array.from(last).slice(0, 3).join("").toUpperCase();
}

const TEAM_NAME_CLASS =
  "line-clamp-2 max-w-full font-display text-title font-bold tracking-normal wrap-anywhere uppercase";

/**
 * Un partido (design/components/GameCard): los dos equipos cara a cara y cuándo se juega. En
 * Inicio es «Próximo partido»; en su detalle, con su marcador si ya se jugó.
 *
 * Sin escudo, cada lado es un `Avatar` grande. El propio lleva `ownShortName` (la sigla corta
 * del club, que viene de su marca) en el acento y debajo el nombre de su equipo; el rival lleva
 * su abreviatura en `ink`, que es lo que distingue «nosotros». Los avatares son decorativos: el
 * nombre de cada equipo ya se lee debajo, una sola vez. La competición va como la escribió el
 * club. Con `score`, el marcador (el propio primero) sustituye a «vs».
 *
 * `slotLabel` llega ya en la zona del club y con «Local»/«Visitante» si se sabe.
 */
export function GameCard({
  game,
  ownShortName,
  label = "Próximo partido",
  score = null,
}: {
  game: Pick<HomeGame, "teamName" | "opponent" | "competition" | "slotLabel">;
  ownShortName: string;
  label?: string;
  score?: { for: number; against: number } | null;
}) {
  return (
    <article>
      <Card>
        <div className="flex items-baseline justify-between gap-(--space-3)">
          <p className="shrink-0 text-label text-ink-2 uppercase">{label}</p>
          {game.competition ? (
            <p className="min-w-0 truncate text-body-s text-ink-3">{game.competition}</p>
          ) : null}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-(--space-3) text-center">
          <div className="flex flex-col items-center gap-(--space-2)">
            <Avatar name={game.teamName} size="lg" number={ownShortName} decorative />
            <span className={TEAM_NAME_CLASS}>{game.teamName}</span>
          </div>
          {score ? (
            <span className="font-display text-numeral tabular-nums">
              <span aria-hidden="true">{`${score.for}–${score.against}`}</span>
              <span className="sr-only">{`${score.for} a ${score.against}`}</span>
            </span>
          ) : (
            <span className="font-display text-body font-semibold text-ink-3 uppercase">vs</span>
          )}
          <div className="flex flex-col items-center gap-(--space-2)">
            <Avatar name={game.opponent} size="lg" number={teamAbbr(game.opponent)} tone="ink" decorative />
            <span className={TEAM_NAME_CLASS}>{game.opponent}</span>
          </div>
        </div>
        <p className="text-center text-body-strong tabular-nums">{game.slotLabel}</p>
      </Card>
    </article>
  );
}
