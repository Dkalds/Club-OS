import { describe, expect, it } from "vitest";
import { boardFrames, boardLabel } from "./frames";
import { MAX_MOVES, MAX_STEPS, MAX_TOKENS, NOTE_MAX } from "./limits";
import { parseBoard } from "./schema";
import type { Board } from "./types";

/** Una pizarra válida y pequeña: el 1 pasa al 2 y corta; después el 2 bota hacia el aro. */
function board(overrides: Partial<Board> = {}): Board {
  return {
    version: 1,
    court: "half",
    tokens: [
      { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
      { id: "a2", kind: "attacker", label: "2", at: { x: 20, y: 60 } },
      { id: "d1", kind: "defender", label: "1", at: { x: 50, y: 70 } },
      { id: "ball", kind: "ball", at: { x: 53, y: 80 } },
      { id: "c1", kind: "cone", at: { x: 80, y: 40 } },
    ],
    steps: [
      {
        note: "El 1 pasa al 2 y corta",
        moves: [
          { token: "ball", kind: "pass", to: { x: 23, y: 60 } },
          { token: "a1", kind: "cut", to: { x: 50, y: 30 } },
        ],
      },
      { moves: [{ token: "a2", kind: "dribble", to: { x: 30, y: 25 } }] },
    ],
    ...overrides,
  };
}

describe("parseBoard", () => {
  it("devuelve la pizarra cuando cumple la forma", () => {
    expect(parseBoard(board())).toEqual(board());
  });

  it("acepta una foto fija: fichas sin pasos", () => {
    expect(parseBoard(board({ steps: [] }))).toEqual(board({ steps: [] }));
  });

  it("acepta la pista completa", () => {
    expect(parseBoard(board({ court: "full" }))?.court).toBe("full");
  });

  it("se queda con lo que conoce: una clave de más no viaja", () => {
    const parsed = parseBoard({ ...board(), autor: "alguien", tokens: board().tokens.map((t) => ({ ...t, color: "x" })) });

    expect(parsed).toEqual(board());
  });

  it.each([null, undefined, "una pizarra", 7, [], {}])("lo que no es una pizarra es null: %j", (value) => {
    expect(parseBoard(value)).toBeNull();
  });

  it("otra versión es null", () => {
    expect(parseBoard({ ...board(), version: 2 })).toBeNull();
  });

  it("una pista que no existe es null", () => {
    expect(parseBoard({ ...board(), court: "tres cuartos" })).toBeNull();
  });

  it("sin fichas es null: no hay nada que enseñar", () => {
    expect(parseBoard(board({ tokens: [] }))).toBeNull();
  });

  it.each([
    ["fuera por arriba", { x: 50, y: 101 }],
    ["negativa", { x: -1, y: 50 }],
    ["con decimales", { x: 50.5, y: 50 }],
    ["sin una coordenada", { x: 50 }],
  ])("una posición %s es null", (_name, at) => {
    const tokens = [{ id: "a1", kind: "attacker", label: "1", at }];

    expect(parseBoard({ ...board(), tokens, steps: [] })).toBeNull();
  });

  it("dos fichas con el mismo id es null", () => {
    const [first] = board().tokens;

    expect(parseBoard(board({ tokens: [first, { ...first, at: { x: 10, y: 10 } }], steps: [] }))).toBeNull();
  });

  it("un tipo de ficha que no existe es null", () => {
    expect(parseBoard({ ...board(), tokens: [{ id: "x", kind: "coach", at: { x: 1, y: 1 } }], steps: [] })).toBeNull();
  });

  it("una etiqueta de más de dos caracteres es null", () => {
    const tokens = [{ id: "a1", kind: "attacker" as const, label: "123", at: { x: 1, y: 1 } }];

    expect(parseBoard(board({ tokens, steps: [] }))).toBeNull();
  });

  it("un movimiento de una ficha que no existe es null", () => {
    const steps = [{ moves: [{ token: "nadie", kind: "cut" as const, to: { x: 1, y: 1 } }] }];

    expect(parseBoard(board({ steps }))).toBeNull();
  });

  it("un pase solo lo hace un balón, y un balón solo hace pases", () => {
    const passByPlayer = [{ moves: [{ token: "a1", kind: "pass" as const, to: { x: 1, y: 1 } }] }];
    const cutByBall = [{ moves: [{ token: "ball", kind: "cut" as const, to: { x: 1, y: 1 } }] }];

    expect(parseBoard(board({ steps: passByPlayer }))).toBeNull();
    expect(parseBoard(board({ steps: cutByBall }))).toBeNull();
  });

  it("un cono no se mueve", () => {
    const steps = [{ moves: [{ token: "c1", kind: "cut" as const, to: { x: 1, y: 1 } }] }];

    expect(parseBoard(board({ steps }))).toBeNull();
  });

  it("una ficha no se mueve dos veces en el mismo paso", () => {
    const steps = [
      {
        moves: [
          { token: "a1", kind: "cut" as const, to: { x: 1, y: 1 } },
          { token: "a1", kind: "screen" as const, to: { x: 2, y: 2 } },
        ],
      },
    ];

    expect(parseBoard(board({ steps }))).toBeNull();
  });

  it("un paso sin movimientos es null: no pasa nada en él", () => {
    expect(parseBoard(board({ steps: [{ note: "Nada", moves: [] }] }))).toBeNull();
  });

  it("los topes: fichas, pasos, movimientos y nota", () => {
    const manyTokens = Array.from({ length: MAX_TOKENS + 1 }, (_, i) => ({
      id: `c${i}`,
      kind: "cone" as const,
      at: { x: i, y: i },
    }));
    const step = { moves: [{ token: "a1", kind: "cut" as const, to: { x: 1, y: 1 } }] };
    const players = Array.from({ length: MAX_MOVES + 1 }, (_, i) => ({
      id: `p${i}`,
      kind: "attacker" as const,
      at: { x: i, y: i },
    }));

    expect(parseBoard(board({ tokens: manyTokens, steps: [] }))).toBeNull();
    expect(parseBoard(board({ steps: Array.from({ length: MAX_STEPS + 1 }, () => step) }))).toBeNull();
    expect(parseBoard(board({ steps: Array.from({ length: MAX_STEPS }, () => step) }))).not.toBeNull();
    expect(
      parseBoard(
        board({
          tokens: players,
          steps: [{ moves: players.map((p) => ({ token: p.id, kind: "cut" as const, to: { x: 5, y: 5 } })) }],
        }),
      ),
    ).toBeNull();
    expect(parseBoard(board({ steps: [{ ...step, note: "x".repeat(NOTE_MAX + 1) }] }))).toBeNull();
    expect(parseBoard(board({ steps: [{ ...step, note: "x".repeat(NOTE_MAX) }] }))).not.toBeNull();
  });

  it("una nota en blanco se queda sin nota", () => {
    const step = { note: "   ", moves: [{ token: "a1", kind: "cut" as const, to: { x: 1, y: 1 } }] };

    expect(parseBoard(board({ steps: [step] }))?.steps[0].note).toBeUndefined();
  });
});

describe("boardFrames", () => {
  it("sin pasos hay un solo fotograma: donde está cada ficha", () => {
    expect(boardFrames(board({ steps: [] }))).toEqual([
      {
        a1: { x: 50, y: 80 },
        a2: { x: 20, y: 60 },
        d1: { x: 50, y: 70 },
        ball: { x: 53, y: 80 },
        c1: { x: 80, y: 40 },
      },
    ]);
  });

  it("hay un fotograma más que pasos", () => {
    expect(boardFrames(board())).toHaveLength(3);
  });

  it("un pase mueve el balón y un corte, al jugador; los demás se quedan", () => {
    const [, afterFirst] = boardFrames(board());

    expect(afterFirst).toEqual({
      a1: { x: 50, y: 30 },
      a2: { x: 20, y: 60 },
      d1: { x: 50, y: 70 },
      ball: { x: 23, y: 60 },
      c1: { x: 80, y: 40 },
    });
  });

  it("el balón acompaña a quien bota si está pegado a él al empezar el paso", () => {
    const frames = boardFrames(board());

    // Tras el pase el balón está junto al 2 (a 3 unidades); el 2 bota 10 a la derecha y 35 arriba.
    expect(frames[2].a2).toEqual({ x: 30, y: 25 });
    expect(frames[2].ball).toEqual({ x: 33, y: 25 });
  });

  it("el balón no acompaña a quien bota lejos de él", () => {
    const steps = [{ moves: [{ token: "a2", kind: "dribble" as const, to: { x: 30, y: 25 } }] }];
    const [, after] = boardFrames(board({ steps }));

    expect(after.ball).toEqual({ x: 53, y: 80 });
  });

  it("el balón no acompaña a un corte ni a un bloqueo, aunque esté pegado", () => {
    const steps = [{ moves: [{ token: "a1", kind: "cut" as const, to: { x: 10, y: 10 } }] }];
    const [, after] = boardFrames(board({ steps }));

    expect(after.ball).toEqual({ x: 53, y: 80 });
  });

  it("si en el mismo paso el balón se pasa, manda el pase y no el bote", () => {
    const steps = [
      {
        moves: [
          { token: "a1", kind: "dribble" as const, to: { x: 60, y: 60 } },
          { token: "ball", kind: "pass" as const, to: { x: 23, y: 60 } },
        ],
      },
    ];
    const [, after] = boardFrames(board({ steps }));

    expect(after.ball).toEqual({ x: 23, y: 60 });
  });

  it("el balón que acompaña no se sale de la pista", () => {
    const tokens = [
      { id: "a1", kind: "attacker" as const, label: "1", at: { x: 90, y: 50 } },
      { id: "ball", kind: "ball" as const, at: { x: 94, y: 50 } },
    ];
    const steps = [{ moves: [{ token: "a1", kind: "dribble" as const, to: { x: 100, y: 50 } }] }];
    const [, after] = boardFrames(board({ tokens, steps }));

    expect(after.ball).toEqual({ x: 100, y: 50 });
  });

  it("no cambia la pizarra que recibe", () => {
    const original = board();
    const copy = structuredClone(original);

    boardFrames(original);

    expect(original).toEqual(copy);
  });
});

describe("boardLabel", () => {
  it("nombra la pizarra y, si hay varios, el paso", () => {
    expect(boardLabel("3 calles", 0, 1)).toBe("Pizarra de 3 calles");
    expect(boardLabel("3 calles", 1, 4)).toBe("Pizarra de 3 calles, paso 2 de 4");
  });
});
