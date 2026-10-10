import { z } from "zod";
import { COURT_MAX, LABEL_MAX, MAX_MOVES, MAX_STEPS, MAX_TOKENS, NOTE_MAX } from "./limits";
import type { Board } from "./types";

// La forma de una pizarra, comprobada al leer. Lo que llega de `drills.board` no es de fiar: la
// base solo mira que sea un objeto de la versión 1 y que no pase de 32 kB, y por la API directa
// un borrador puede traer cualquier cosa. Lo que no cumple se trata como si no hubiera pizarra.

const coordinate = z.number().int().min(0).max(COURT_MAX);
const point = z.object({ x: coordinate, y: coordinate });

const token = z.object({
  id: z.string().min(1).max(24),
  kind: z.enum(["attacker", "defender", "ball", "cone"]),
  label: z.string().trim().min(1).max(LABEL_MAX).optional(),
  at: point,
});

const move = z.object({
  token: z.string().min(1).max(24),
  kind: z.enum(["cut", "dribble", "pass", "screen"]),
  to: point,
});

const step = z.object({
  // Una nota en blanco es «sin nota».
  note: z
    .string()
    .trim()
    .max(NOTE_MAX)
    .optional()
    .transform((text) => (text ? text : undefined)),
  moves: z.array(move).min(1).max(MAX_MOVES),
});

const boardSchema = z
  .object({
    version: z.literal(1),
    court: z.enum(["half", "full"]),
    tokens: z.array(token).min(1).max(MAX_TOKENS),
    steps: z.array(step).max(MAX_STEPS),
  })
  .refine((board) => new Set(board.tokens.map((item) => item.id)).size === board.tokens.length)
  .refine((board) => {
    const kinds = new Map(board.tokens.map((item) => [item.id, item.kind]));

    return board.steps.every((item) => {
      const moved = new Set<string>();
      return item.moves.every((current) => {
        const kind = kinds.get(current.token);
        // Cada ficha se mueve una vez por paso; el balón solo se pasa, un jugador hace lo demás
        // y un cono no se mueve.
        if (kind === undefined || moved.has(current.token)) return false;
        moved.add(current.token);
        return current.kind === "pass" ? kind === "ball" : kind === "attacker" || kind === "defender";
      });
    });
  });

/**
 * La pizarra que hay en `value`, o `null` si no cumple la forma de la versión 1 (no es un objeto,
 * es de otra versión, le falta algo, pasa de sus topes, repite un id o mueve una ficha que no
 * existe). Nunca lanza: una pizarra rota no rompe la pantalla, se queda sin pizarra. Lo que no
 * conoce (claves de más) no viaja.
 */
export function parseBoard(value: unknown): Board | null {
  const parsed = boardSchema.safeParse(value);
  if (!parsed.success) return null;

  const { version, court, tokens, steps } = parsed.data;
  return {
    version,
    court,
    tokens: tokens.map(({ id, kind, label, at }) =>
      label === undefined ? { id, kind, at } : { id, kind, label, at },
    ),
    steps: steps.map(({ note, moves }) => (note === undefined ? { moves } : { note, moves })),
  };
}
