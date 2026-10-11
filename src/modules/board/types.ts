// La pizarra de un ejercicio como dato (`drills.board`, versión 1): dónde está cada ficha al
// empezar y qué se mueve en cada paso. Lo que cada tipo significa está en
// `docs/superpowers/specs/2026-10-11-pizarra-visual-design.md`.

/**
 * Un punto de la pista, de 0 a 100 en los dos ejes, en unidades de pista y no de pantalla: `x` a
 * lo ancho y `y` a lo largo, con el aro de ataque en `y = 0`. En media pista, `y = 100` es el
 * centro del campo; en pista completa, la otra línea de fondo.
 */
export type BoardPoint = { x: number; y: number };

export type BoardTokenKind = "attacker" | "defender" | "ball" | "cone";

/** Una ficha y dónde está al empezar. Solo los jugadores llevan etiqueta («1», «5»). */
export type BoardToken = { id: string; kind: BoardTokenKind; label?: string; at: BoardPoint };

/** Cómo se mueve una ficha: sin balón, botando, el balón por el aire o a bloquear. */
export type BoardMoveKind = "cut" | "dribble" | "pass" | "screen";

/** Un movimiento de un paso: qué ficha, cómo y hasta dónde. */
export type BoardMove = { token: string; kind: BoardMoveKind; to: BoardPoint };

/** Lo que pasa a la vez, y una nota corta que lo cuenta. */
export type BoardStep = { note?: string; moves: BoardMove[] };

export type Board = {
  version: 1;
  court: "half" | "full";
  tokens: BoardToken[];
  steps: BoardStep[];
};

/** Dónde está cada ficha en un momento de la pizarra, por su id. */
export type BoardFrame = Record<string, BoardPoint>;
