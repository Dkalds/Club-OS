import type { GameStatus } from "./types";

/** «61–58»: el marcador del club primero, con raya corta (U+2013). */
export function scoreLabel(score: { for: number; against: number }): string {
  return `${score.for}–${score.against}`;
}

/**
 * Lo que dice la fila de un partido sobre su estado, si dice algo: «Cancelado», o «Sin
 * resultado» si ya empezó y nadie lo ha apuntado. Uno jugado enseña su marcador, no un estado.
 */
export function gameStatusLabel(status: GameStatus, started: boolean): string | null {
  if (status === "cancelled") return "Cancelado";
  if (status === "scheduled" && started) return "Sin resultado";
  return null;
}
