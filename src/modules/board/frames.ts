import { BALL_REACH, COURT_MAX } from "./limits";
import type { Board, BoardFrame, BoardPoint } from "./types";

// Dónde está cada ficha tras cada paso. No se guarda: se calcula, aplicando los movimientos de
// cada paso sobre el fotograma anterior.

function clamp(value: number): number {
  return Math.min(COURT_MAX, Math.max(0, value));
}

function near(a: BoardPoint, b: BoardPoint): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) <= BALL_REACH;
}

/**
 * Los fotogramas de una pizarra: el primero es donde empieza cada ficha y hay uno más por cada
 * paso. Los movimientos de un paso pasan a la vez, sobre el fotograma anterior. Un corte, un
 * bote o un bloqueo llevan al jugador a su destino, y un pase, al balón. El balón acompaña a
 * quien bota: si al empezar el paso está pegado a ese jugador (`BALL_REACH`) y en ese paso no
 * se pasa, se desplaza lo mismo que él, sin salirse de la pista. No cambia `board`.
 */
export function boardFrames(board: Board): BoardFrame[] {
  const balls = board.tokens.filter((token) => token.kind === "ball").map((token) => token.id);
  let frame: BoardFrame = Object.fromEntries(board.tokens.map((token) => [token.id, { ...token.at }]));
  const frames = [frame];

  for (const step of board.steps) {
    const previous = frame;
    const next: BoardFrame = Object.fromEntries(
      Object.entries(previous).map(([id, at]) => [id, { ...at }]),
    );
    const passed = new Set(step.moves.filter((move) => move.kind === "pass").map((move) => move.token));

    for (const move of step.moves) {
      const from = previous[move.token];
      if (!from) continue;
      next[move.token] = { ...move.to };

      if (move.kind !== "dribble") continue;
      for (const ball of balls) {
        const at = previous[ball];
        if (passed.has(ball) || !at || !near(at, from)) continue;
        next[ball] = { x: clamp(at.x + move.to.x - from.x), y: clamp(at.y + move.to.y - from.y) };
      }
    }

    frames.push(next);
    frame = next;
  }

  return frames;
}

/** Cómo se nombra una pizarra para quien no la ve: «Pizarra de 3 calles, paso 2 de 4». */
export function boardLabel(title: string, step: number, total: number): string {
  const name = `Pizarra de ${title}`;
  return total > 1 ? `${name}, paso ${step + 1} de ${total}` : name;
}
