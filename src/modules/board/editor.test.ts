import { describe, expect, it } from "vitest";
import {
  ballHeldBy,
  canAddStep,
  canAddToken,
  editorFrame,
  editorReducer,
  initialEditor,
  isHeld,
  movesFor,
  sameSavable,
  toSavable,
  type EditorAction,
  type EditorState,
} from "./editor";
import { boardFrames } from "./frames";
import { COURT_MAX, HISTORY_MAX, MAX_LABEL_NUMBER, MAX_MOVES, MAX_STEPS, MAX_TOKENS, NOTE_MAX } from "./limits";
import { parseBoard } from "./schema";
import type { Board, BoardMoveKind, BoardPoint, BoardToken, BoardTokenKind } from "./types";

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

const TOKEN_KINDS: readonly BoardTokenKind[] = ["attacker", "defender", "ball", "cone"];
const MOVE_KINDS: readonly BoardMoveKind[] = ["cut", "dribble", "pass", "screen"];
/** A menos de esto, en unidades de pista, una ficha nueva pisaría a otra. */
const CLEARANCE = 9;

const UNDO: EditorAction = { type: "undo" };
const REDO: EditorAction = { type: "redo" };
const ADD_STEP: EditorAction = { type: "add-step" };
const DUPLICATE_STEP: EditorAction = { type: "duplicate-step" };
const REMOVE_STEP: EditorAction = { type: "remove-step" };

const add = (kind: BoardTokenKind): EditorAction => ({ type: "add-token", kind });
const moveToken = (id: string, x: number, y: number): EditorAction => ({ type: "move-token", id, to: { x, y } });
const removeToken = (id: string): EditorAction => ({ type: "remove-token", id });
const setMove = (id: string, kind: BoardMoveKind, x: number, y: number): EditorAction => ({
  type: "set-move",
  id,
  kind,
  to: { x, y },
});
const clearMove = (id: string): EditorAction => ({ type: "clear-move", id });
const setNote = (note: string): EditorAction => ({ type: "set-note", note });
const select = (id: string | null): EditorAction => ({ type: "select", id });
const view = (to: number): EditorAction => ({ type: "view", view: to });
const times = (count: number, action: EditorAction): EditorAction[] => Array.from({ length: count }, () => action);

/** Aplica las acciones, una detrás de otra. */
function run(state: EditorState, ...actions: EditorAction[]): EditorState {
  return actions.reduce(editorReducer, state);
}

/** El editor recién abierto con esa pizarra (o vacío), tras esas acciones. */
function open(start: Board | null = null, ...actions: EditorAction[]): EditorState {
  return run(initialEditor(start), ...actions);
}

function tokenOf(state: EditorState, id: string): BoardToken | undefined {
  return state.board.tokens.find((token) => token.id === id);
}

function ids(state: EditorState): string[] {
  return state.board.tokens.map((token) => token.id);
}

function distance(a: BoardPoint, b: BoardPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** La acción no hace nada: devuelve el mismo estado, sin apilar historial. */
function expectNothing(state: EditorState, action: EditorAction) {
  expect(editorReducer(state, action)).toBe(state);
}

/** Congela un valor entero, por dentro: quien intente cambiarlo, lanza. */
function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

/** Números pseudoaleatorios entre 0 y 1, siempre los mismos para una semilla (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("initialEditor", () => {
  it("sin pizarra, una media pista vacía en «Inicio», sin ficha elegida ni historial", () => {
    expect(initialEditor(null)).toEqual({
      board: { version: 1, court: "half", tokens: [], steps: [] },
      view: 0,
      selected: null,
      past: [],
      future: [],
      merging: null,
    });
  });

  it("con una pizarra, esa misma, en «Inicio»", () => {
    const start = board();
    const state = initialEditor(start);

    expect(state.board).toBe(start);
    expect(state).toMatchObject({ view: 0, selected: null, past: [], future: [], merging: null });
  });
});

describe("add-token", () => {
  it("numera a los atacantes desde el 1", () => {
    const state = open(null, ...times(3, add("attacker")));

    expect(state.board.tokens.map(({ id, kind, label }) => ({ id, kind, label }))).toEqual([
      { id: "a1", kind: "attacker", label: "1" },
      { id: "a2", kind: "attacker", label: "2" },
      { id: "a3", kind: "attacker", label: "3" },
    ]);
  });

  it("los defensores llevan su propia cuenta", () => {
    const state = open(null, add("attacker"), add("defender"), add("defender"), add("attacker"));

    expect(state.board.tokens.map(({ kind, label }) => `${kind} ${label}`)).toEqual([
      "attacker 1",
      "defender 1",
      "defender 2",
      "attacker 2",
    ]);
  });

  it("usa el menor número libre: tras quitar el 2, el siguiente vuelve a ser el 2", () => {
    const state = open(null, ...times(3, add("attacker")), removeToken("a2"), add("attacker"));

    expect(state.board.tokens.map((token) => token.label)).toEqual(["1", "3", "2"]);
    expect(new Set(ids(state)).size).toBe(3);
    expect(editorReducer(state, add("attacker")).board.tokens.at(-1)?.label).toBe("4");
  });

  it("sigue la numeración de la pizarra que se abre", () => {
    const state = open(board(), add("attacker"), add("defender"));

    expect(state.board.tokens.slice(-2).map(({ kind, label }) => `${kind} ${label}`)).toEqual([
      "attacker 3",
      "defender 2",
    ]);
  });

  it("el balón y los conos no llevan etiqueta", () => {
    const state = open(null, add("ball"), add("cone"), add("cone"));

    expect(state.board.tokens.map((token) => token.kind)).toEqual(["ball", "cone", "cone"]);
    for (const token of state.board.tokens) expect(token).not.toHaveProperty("label");
  });

  it("los ids no se repiten, tampoco con los de la pizarra que se abre", () => {
    const kinds = Array.from({ length: MAX_TOKENS - board().tokens.length }, (_, n) => TOKEN_KINDS[n % 4]);
    const state = open(board(), ...kinds.map(add));

    expect(state.board.tokens).toHaveLength(MAX_TOKENS);
    expect(new Set(ids(state)).size).toBe(MAX_TOKENS);
  });

  it("la ficha nueva queda elegida y el cambio se puede deshacer", () => {
    const first = open(null, add("attacker"));
    const second = editorReducer(first, add("ball"));

    expect(first.selected).toBe("a1");
    expect(second.selected).toBe(second.board.tokens[1].id);
    expect(second.past).toEqual([initialEditor(null).board, first.board]);
  });

  it("aparece dentro de la pista, en coordenadas enteras", () => {
    const state = open(null, ...times(MAX_TOKENS, add("cone")));

    for (const { at } of state.board.tokens) {
      expect(Number.isInteger(at.x) && Number.isInteger(at.y)).toBe(true);
      expect(Math.min(at.x, at.y)).toBeGreaterThanOrEqual(0);
      expect(Math.max(at.x, at.y)).toBeLessThanOrEqual(COURT_MAX);
    }
  });

  it("aparece en un sitio que no pisa a otra, hasta llenar la pizarra", () => {
    let state = open();

    for (let n = 0; n < MAX_TOKENS; n += 1) {
      state = editorReducer(state, add(TOKEN_KINDS[n % 4]));
      const fresh = state.board.tokens[n];
      for (const other of state.board.tokens.slice(0, n)) {
        expect(distance(fresh.at, other.at), `${fresh.id} sobre ${other.id}`).toBeGreaterThanOrEqual(CLEARANCE);
      }
    }
    expect(state.board.tokens).toHaveLength(MAX_TOKENS);
  });

  it("si otra ficha ocupa el sitio que le tocaba, busca otro", () => {
    const one = open(null, add("cone"));
    // Dónde aparecería la segunda, y la primera arrastrada justo ahí.
    const spot = editorReducer(one, add("cone")).board.tokens[1].at;
    const state = run(one, moveToken("c1", spot.x + 2, spot.y - 2), add("cone"));

    expect(distance(state.board.tokens[1].at, state.board.tokens[0].at)).toBeGreaterThanOrEqual(CLEARANCE);
  });

  it("aunque las demás estén repartidas por toda la pista, la nueva no pisa a ninguna", () => {
    const next = prng(11);
    let state = open();

    for (let n = 0; n < MAX_TOKENS; n += 1) {
      state = editorReducer(state, add(n % 2 === 0 ? "cone" : "ball"));
      const fresh = state.board.tokens[n];
      for (const other of state.board.tokens.slice(0, n)) {
        expect(distance(fresh.at, other.at), `${fresh.id} sobre ${other.id}`).toBeGreaterThanOrEqual(CLEARANCE);
      }
      state = editorReducer(state, moveToken(fresh.id, next() * COURT_MAX, next() * COURT_MAX));
    }
  });

  it("en un paso no hace nada", () => {
    const state = open(board(), view(1));

    for (const kind of TOKEN_KINDS) expectNothing(state, add(kind));
  });

  it("con nueve atacantes no cabe otro, pero sí un defensor", () => {
    const state = open(null, ...times(MAX_LABEL_NUMBER, add("attacker")));

    expect(state.board.tokens.map((token) => token.label)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expectNothing(state, add("attacker"));
    expect(canAddToken(state.board, "attacker")).toBe(false);
    expect(canAddToken(state.board, "defender")).toBe(true);
    expect(editorReducer(state, add("defender")).board.tokens).toHaveLength(MAX_LABEL_NUMBER + 1);
  });

  it("con nueve defensores no cabe otro, pero sí un atacante", () => {
    const state = open(null, ...times(MAX_LABEL_NUMBER, add("defender")));

    expectNothing(state, add("defender"));
    expect(canAddToken(state.board, "defender")).toBe(false);
    expect(canAddToken(state.board, "attacker")).toBe(true);
  });

  it("con la pizarra llena no cabe ninguna ficha, del tipo que sea", () => {
    const state = open(
      null,
      ...times(MAX_LABEL_NUMBER, add("attacker")),
      ...times(MAX_LABEL_NUMBER, add("defender")),
      ...times(MAX_TOKENS - 2 * MAX_LABEL_NUMBER, add("cone")),
    );

    expect(state.board.tokens).toHaveLength(MAX_TOKENS);
    expect(state.past).toHaveLength(MAX_TOKENS);
    for (const kind of TOKEN_KINDS) {
      expectNothing(state, add(kind));
      expect(canAddToken(state.board, kind)).toBe(false);
    }
  });

  it("canAddToken dice lo mismo que hace el reductor", () => {
    const states = [
      open(),
      open(board()),
      open(null, ...times(MAX_LABEL_NUMBER, add("attacker"))),
      open(null, ...times(MAX_LABEL_NUMBER, add("defender")), add("ball")),
      open(null, ...times(MAX_TOKENS - 1, add("cone"))),
      open(null, ...times(MAX_TOKENS, add("ball"))),
    ];

    for (const state of states) {
      for (const kind of TOKEN_KINDS) {
        const added = editorReducer(state, add(kind)) !== state;
        expect(canAddToken(state.board, kind), `${state.board.tokens.length} fichas, ${kind}`).toBe(added);
      }
    }
  });
});

describe("move-token", () => {
  it("mueve la ficha, redondea a enteros y apila el cambio", () => {
    const start = open(board(), select("a1"));
    const state = editorReducer(start, moveToken("a1", 33.6, 12.4));

    expect(tokenOf(state, "a1")?.at).toEqual({ x: 34, y: 12 });
    expect(state.past).toEqual([start.board]);
    expect(state.selected).toBe("a1");
    // El balón que lleva (estaba a 3 de él) se mueve lo mismo: 16 a la izquierda y 68 arriba.
    expect(tokenOf(state, "ball")?.at).toEqual({ x: 37, y: 12 });
    // Las demás, y los pasos, siguen como estaban.
    const others = (tokens: BoardToken[]) => tokens.filter((token) => token.id !== "a1" && token.id !== "ball");
    expect(others(state.board.tokens)).toEqual(others(board().tokens));
    expect(state.board.steps).toEqual(board().steps);
  });

  it("mover a un jugador que no lleva el balón no mueve el balón; mover el balón no mueve a nadie", () => {
    const moved = editorReducer(open(board()), moveToken("a2", 60, 60));
    expect(tokenOf(moved, "ball")?.at).toEqual({ x: 53, y: 80 });

    const ballMoved = editorReducer(open(board()), moveToken("ball", 10, 10));
    expect(tokenOf(ballMoved, "a1")?.at).toEqual({ x: 50, y: 80 });
  });

  it("el balón que acompaña no se sale de la pista", () => {
    const state = editorReducer(open(board()), moveToken("a1", 99, 80));

    expect(tokenOf(state, "ball")?.at).toEqual({ x: 100, y: 80 });
  });

  it("varios toques de flecha seguidos a la misma ficha son un solo paso atrás; un arrastre, otro", () => {
    const start = open(board());
    const nudged = run(
      start,
      { type: "move-token", id: "a2", to: { x: 22, y: 60 }, nudge: true },
      { type: "move-token", id: "a2", to: { x: 24, y: 60 }, nudge: true },
      { type: "move-token", id: "a2", to: { x: 26, y: 60 }, nudge: true },
    );
    expect(nudged.past).toHaveLength(1);
    expect(tokenOf(editorReducer(nudged, UNDO), "a2")?.at).toEqual({ x: 20, y: 60 });

    // Un arrastre después (sin `nudge`) es otro cambio, y otra ficha a toques, también.
    const dragged = editorReducer(nudged, moveToken("a2", 40, 40));
    expect(dragged.past).toHaveLength(2);
    const other = editorReducer(nudged, { type: "move-token", id: "d1", to: { x: 52, y: 70 }, nudge: true });
    expect(other.past).toHaveLength(2);
  });

  it.each([
    [{ x: -4, y: 250 }, { x: 0, y: 100 }],
    [{ x: 140.2, y: -0.6 }, { x: 100, y: 0 }],
    [{ x: 99.5, y: 0.4 }, { x: 100, y: 0 }],
    [{ x: Infinity, y: -Infinity }, { x: 100, y: 0 }],
  ])("acota a la pista: %j queda en %j", (to, expected) => {
    const state = open(board(), { type: "move-token", id: "c1", to });

    expect(tokenOf(state, "c1")?.at).toEqual(expected);
  });

  it("mover a donde ya está no apila historial", () => {
    const state = open(board());

    expectNothing(state, moveToken("a1", 50, 80));
    // También si solo cambia en decimales que el redondeo se lleva.
    expectNothing(state, moveToken("a1", 50.3, 79.6));
  });

  it("un id que no existe no hace nada", () => {
    expectNothing(open(board()), moveToken("nadie", 10, 10));
  });

  it("en un paso no hace nada", () => {
    expectNothing(open(board(), view(1)), moveToken("a1", 10, 10));
  });
});

describe("remove-token", () => {
  it("quita la ficha y sus movimientos de todos los pasos, y deja sin elegir", () => {
    const withBoth = board({
      steps: [...board().steps, { note: "El 1 bloquea", moves: [{ token: "a1", kind: "screen", to: { x: 40, y: 40 } }] }],
    });
    const state = open(withBoth, select("a1"), removeToken("a1"));

    expect(ids(state)).toEqual(["a2", "d1", "ball", "c1"]);
    expect(state.board.steps).toEqual([
      { note: "El 1 pasa al 2 y corta", moves: [{ token: "ball", kind: "pass", to: { x: 23, y: 60 } }] },
      { moves: [{ token: "a2", kind: "dribble", to: { x: 30, y: 25 } }] },
      // El paso se queda, vacío: al guardar se descarta.
      { note: "El 1 bloquea", moves: [] },
    ]);
    expect(state.selected).toBeNull();
    expect(state.past).toEqual([withBoth]);
  });

  it("deja sin elegir aunque la elegida fuera otra", () => {
    expect(open(board(), select("a2"), removeToken("c1")).selected).toBeNull();
  });

  it("un id que no existe no hace nada", () => {
    expectNothing(open(board(), select("a1")), removeToken("nadie"));
  });

  it("en un paso no hace nada", () => {
    expectNothing(open(board(), view(2)), removeToken("a1"));
  });
});

describe("movesFor", () => {
  it("el balón se pasa, un jugador corta, bota o bloquea, y un cono no se mueve", () => {
    expect(movesFor("ball")).toEqual(["pass"]);
    expect(movesFor("attacker")).toEqual(["cut", "dribble", "screen"]);
    expect(movesFor("defender")).toEqual(["cut", "dribble", "screen"]);
    expect(movesFor("cone")).toEqual([]);
  });
});

describe("set-move", () => {
  it("añade el movimiento de esa ficha en el paso que se ve", () => {
    const start = open(board(), view(2));
    const state = editorReducer(start, setMove("a1", "cut", 10, 10));

    expect(state.board.steps[1].moves).toEqual([
      { token: "a2", kind: "dribble", to: { x: 30, y: 25 } },
      { token: "a1", kind: "cut", to: { x: 10, y: 10 } },
    ]);
    // El otro paso no se toca.
    expect(state.board.steps[0]).toEqual(board().steps[0]);
    expect(state.past).toEqual([start.board]);
    expect(state.view).toBe(2);
  });

  it("sustituye el que la ficha ya tenía en ese paso: nunca dos de la misma", () => {
    const state = open(board(), view(1), setMove("a1", "screen", 70, 20), setMove("a1", "dribble", 60, 15));
    const { moves } = state.board.steps[0];

    expect(moves).toHaveLength(2);
    expect(moves.filter((move) => move.token === "a1")).toEqual([{ token: "a1", kind: "dribble", to: { x: 60, y: 15 } }]);
    expect(moves.filter((move) => move.token === "ball")).toEqual([{ token: "ball", kind: "pass", to: { x: 23, y: 60 } }]);
    expect(state.board.steps[0].note).toBe("El 1 pasa al 2 y corta");
  });

  it("cada ficha solo hace lo que dice movesFor: lo demás no hace nada", () => {
    const state = open(board(), view(2));

    for (const token of state.board.tokens) {
      for (const kind of MOVE_KINDS) {
        const next = editorReducer(state, setMove(token.id, kind, 10, 10));
        if (movesFor(token.kind).includes(kind)) {
          expect(next.board.steps[1].moves, `${token.id} ${kind}`).toContainEqual({ token: token.id, kind, to: { x: 10, y: 10 } });
        } else {
          expect(next, `${token.id} ${kind}`).toBe(state);
        }
      }
    }
  });

  it("el balón solo se pasa, un jugador no pasa y un cono no se mueve", () => {
    const state = open(board(), view(1));

    expectNothing(state, setMove("ball", "cut", 10, 10));
    expectNothing(state, setMove("ball", "dribble", 10, 10));
    expectNothing(state, setMove("ball", "screen", 10, 10));
    expectNothing(state, setMove("a2", "pass", 10, 10));
    expectNothing(state, setMove("d1", "pass", 10, 10));
    for (const kind of MOVE_KINDS) expectNothing(state, setMove("c1", kind, 10, 10));
  });

  it("redondea y acota el destino", () => {
    const state = open(board(), view(2), setMove("d1", "cut", -3.2, 100.6), setMove("ball", "pass", 41.5, 250));

    expect(state.board.steps[1].moves.slice(1)).toEqual([
      { token: "d1", kind: "cut", to: { x: 0, y: 100 } },
      { token: "ball", kind: "pass", to: { x: 42, y: 100 } },
    ]);
  });

  it("un id que no existe no hace nada", () => {
    expectNothing(open(board(), view(1)), setMove("nadie", "cut", 10, 10));
  });

  it("en «Inicio» no hace nada", () => {
    expectNothing(open(board()), setMove("a1", "cut", 10, 10));
  });

  it("con el paso lleno se puede sustituir un movimiento, pero no añadir otro", () => {
    const players = [
      ...Array.from({ length: MAX_LABEL_NUMBER }, (_, n) => `a${n + 1}`),
      ...Array.from({ length: MAX_LABEL_NUMBER }, (_, n) => `d${n + 1}`),
    ];
    const full = open(
      null,
      ...times(MAX_LABEL_NUMBER, add("attacker")),
      ...times(MAX_LABEL_NUMBER, add("defender")),
      add("ball"),
      ADD_STEP,
      ...players.slice(0, MAX_MOVES).map((id, n) => setMove(id, "cut", n, n)),
    );

    expect(full.board.steps[0].moves).toHaveLength(MAX_MOVES);
    expectNothing(full, setMove(players[MAX_MOVES], "cut", 50, 50));
    expectNothing(full, setMove("b1", "pass", 50, 50));

    const replaced = editorReducer(full, setMove("a1", "screen", 77, 33));
    expect(replaced.board.steps[0].moves).toHaveLength(MAX_MOVES);
    expect(replaced.board.steps[0].moves.filter((move) => move.token === "a1")).toEqual([
      { token: "a1", kind: "screen", to: { x: 77, y: 33 } },
    ]);
    expect(toSavable(replaced.board)).not.toBeNull();
  });
});

describe("clear-move", () => {
  it("quita el movimiento de esa ficha en ese paso, y solo en ese", () => {
    const start = open(board(), view(2), setMove("a1", "screen", 40, 40), view(1));
    const state = editorReducer(start, clearMove("a1"));

    expect(state.board.steps[0]).toEqual({
      note: "El 1 pasa al 2 y corta",
      moves: [{ token: "ball", kind: "pass", to: { x: 23, y: 60 } }],
    });
    expect(state.board.steps[1].moves).toContainEqual({ token: "a1", kind: "screen", to: { x: 40, y: 40 } });
    expect(state.past.at(-1)).toBe(start.board);
    expect(state.past).toHaveLength(start.past.length + 1);
  });

  it("si la ficha no se movía en ese paso, no apila historial", () => {
    const state = open(board(), view(1));

    expectNothing(state, clearMove("a2"));
    expectNothing(state, clearMove("nadie"));
  });

  it("en «Inicio» no hace nada", () => {
    expectNothing(open(board()), clearMove("a1"));
  });
});

describe("pasos", () => {
  it("add-step desde «Inicio» pone un paso vacío el primero y pasa a verlo", () => {
    const start = open(board(), select("a1"));
    const state = editorReducer(start, ADD_STEP);

    expect(state.board.steps).toEqual([{ moves: [] }, ...board().steps]);
    expect(state.view).toBe(1);
    expect(state.selected).toBeNull();
    expect(state.past).toEqual([start.board]);
  });

  it("add-step desde un paso lo inserta detrás del que se ve", () => {
    const [first, second] = board().steps;

    const afterFirst = open(board(), view(1), ADD_STEP);
    expect(afterFirst.board.steps).toEqual([first, { moves: [] }, second]);
    expect(afterFirst.view).toBe(2);

    const afterLast = open(board(), view(2), ADD_STEP);
    expect(afterLast.board.steps).toEqual([first, second, { moves: [] }]);
    expect(afterLast.view).toBe(3);
  });

  it("add-step en una pizarra sin pasos crea el primero", () => {
    const state = open(null, add("attacker"), ADD_STEP);

    expect(state.board.steps).toEqual([{ moves: [] }]);
    expect(state.view).toBe(1);
  });

  it("duplicate-step copia el paso, con sus movimientos y su nota, detrás, y pasa a verlo", () => {
    const [first, second] = board().steps;
    const start = open(board(), view(1));
    const state = editorReducer(start, DUPLICATE_STEP);

    // La copia repite el gesto desde donde quedó cada ficha, acotado a la pista: el balón fue de
    // (53,80) a (23,60) y sigue otros 30 a la izquierda y 20 arriba; el 1, de (50,80) a (50,30),
    // sigue hacia el aro.
    const copy = {
      note: first.note,
      moves: [
        { token: "ball", kind: "pass", to: { x: 0, y: 40 } },
        { token: "a1", kind: "cut", to: { x: 50, y: 0 } },
      ],
    };
    expect(state.board.steps).toEqual([first, copy, second]);
    expect(state.view).toBe(2);
    expect(state.selected).toBeNull();
    expect(state.past).toEqual([start.board]);
  });

  it("duplicate-step copia también un paso sin nota, sin inventarle una", () => {
    const state = open(board(), view(2), DUPLICATE_STEP);

    expect(state.board.steps).toHaveLength(3);
    // El 2 botó de (20,60) a (30,25): en la copia sigue 10 a la derecha y 35 arriba, hasta el fondo.
    expect(state.board.steps[2]).toEqual({ moves: [{ token: "a2", kind: "dribble", to: { x: 40, y: 0 } }] });
    expect(state.board.steps[2]).not.toHaveProperty("note");
    expect(state.view).toBe(3);
  });

  it("duplicate-step hace una copia profunda: nada del original se comparte", () => {
    const state = open(board(), view(1), DUPLICATE_STEP);
    const [original, copy] = state.board.steps;

    expect(copy).not.toBe(original);
    expect(copy.moves).not.toBe(original.moves);
    copy.moves.forEach((move, index) => {
      expect(move).not.toBe(original.moves[index]);
      expect(move.to).not.toBe(original.moves[index].to);
    });
  });

  it("cambiar la copia no cambia el original, ni al revés", () => {
    const duplicated = open(board(), view(1), DUPLICATE_STEP);

    const copyChanged = run(duplicated, setMove("a1", "dribble", 5, 5), setNote("Otra cosa"), clearMove("ball"));
    expect(copyChanged.board.steps[0]).toEqual(board().steps[0]);
    expect(copyChanged.board.steps[1]).toEqual({
      note: "Otra cosa",
      moves: [{ token: "a1", kind: "dribble", to: { x: 5, y: 5 } }],
    });

    const originalChanged = run(duplicated, view(1), setMove("a1", "screen", 9, 9), setNote(""));
    expect(originalChanged.board.steps[1]).toEqual(duplicated.board.steps[1]);
  });

  it("remove-step quita el paso que se ve y enseña el que ocupa su sitio", () => {
    const start = open(board(), view(1), select("a1"));
    const state = editorReducer(start, REMOVE_STEP);

    expect(state.board.steps).toEqual([board().steps[1]]);
    expect(state.view).toBe(1);
    expect(state.selected).toBeNull();
    expect(state.past).toEqual([start.board]);
  });

  it("remove-step del último deja en el anterior; sin pasos, en «Inicio»", () => {
    const one = open(board(), view(2), REMOVE_STEP);
    expect(one.board.steps).toEqual([board().steps[0]]);
    expect(one.view).toBe(1);

    const none = editorReducer(one, REMOVE_STEP);
    expect(none.board.steps).toEqual([]);
    expect(none.view).toBe(0);
  });

  it("no pasa de MAX_STEPS, ni añadiendo ni duplicando", () => {
    const almost = open(null, add("attacker"), ...times(MAX_STEPS - 1, ADD_STEP));
    expect(canAddStep(almost.board)).toBe(true);

    const full = editorReducer(almost, ADD_STEP);
    expect(full.board.steps).toHaveLength(MAX_STEPS);
    expect(canAddStep(full.board)).toBe(false);
    expectNothing(full, ADD_STEP);
    expectNothing(full, DUPLICATE_STEP);
    expectNothing(run(full, view(0)), ADD_STEP);

    const duplicated = open(null, add("attacker"), ADD_STEP, ...times(MAX_STEPS - 1, DUPLICATE_STEP));
    expect(duplicated.board.steps).toHaveLength(MAX_STEPS);
    expectNothing(duplicated, DUPLICATE_STEP);
  });

  it("en «Inicio», duplicate-step y remove-step no hacen nada", () => {
    const state = open(board());

    expectNothing(state, DUPLICATE_STEP);
    expectNothing(state, REMOVE_STEP);
  });
});

describe("set-note", () => {
  it("pone la nota del paso que se ve", () => {
    const start = open(board(), view(2));
    const state = editorReducer(start, setNote("El 2 ataca el aro"));

    expect(state.board.steps[1]).toEqual({ ...board().steps[1], note: "El 2 ataca el aro" });
    expect(state.board.steps[0]).toEqual(board().steps[0]);
    expect(state.past).toEqual([start.board]);
  });

  it("la recorta a NOTE_MAX", () => {
    const state = open(board(), view(1), setNote("x".repeat(NOTE_MAX + 25)));

    expect(state.board.steps[0].note).toBe("x".repeat(NOTE_MAX));
  });

  it("vacía, quita la clave note y deja los movimientos", () => {
    const state = open(board(), view(1), setNote(""));

    expect(state.board.steps[0]).not.toHaveProperty("note");
    expect(state.board.steps[0].moves).toEqual(board().steps[0].moves);
  });

  it("la misma nota no hace nada", () => {
    expectNothing(open(board(), view(1)), setNote("El 1 pasa al 2 y corta"));
    expectNothing(open(board(), view(2)), setNote(""));
  });

  it("escribir varias veces seguidas en el mismo paso es un solo paso atrás", () => {
    const start = open(board(), view(1));
    const state = run(start, setNote("P"), setNote("Pa"), setNote("Pas"), setNote("Pase"));

    expect(state.board.steps[0].note).toBe("Pase");
    expect(state.past).toEqual([start.board]);

    const undone = editorReducer(state, UNDO);
    expect(undone.board).toBe(start.board);
    expect(undone.board.steps[0].note).toBe("El 1 pasa al 2 y corta");
    expect(editorReducer(undone, REDO).board.steps[0].note).toBe("Pase");
  });

  it("borrar la nota entera mientras se escribe sigue siendo el mismo paso atrás", () => {
    const start = open(board(), view(1));
    const state = run(start, setNote("El 1"), setNote(""), setNote("O"), setNote("Otra"));

    expect(state.past).toEqual([start.board]);
    expect(editorReducer(state, UNDO).board).toBe(start.board);
  });

  it("cambiar de paso entre medias rompe la unión", () => {
    const state = open(board(), view(1), setNote("A"), view(2), setNote("B"), view(1), setNote("AC"));

    expect(state.past).toHaveLength(3);
    const undone = editorReducer(state, UNDO);
    expect(undone.board.steps.map((step) => step.note)).toEqual(["A", "B"]);
  });

  it("salir del paso y volver a él también la rompe", () => {
    const state = open(board(), view(1), setNote("A"), view(0), view(1), setNote("AB"));

    expect(state.past).toHaveLength(2);
    expect(editorReducer(state, UNDO).board.steps[0].note).toBe("A");
  });

  it("otra acción entre medias rompe la unión", () => {
    const state = open(board(), view(1), setNote("A"), setMove("a2", "cut", 10, 10), setNote("AB"));

    expect(state.past).toHaveLength(3);
    const undone = editorReducer(state, UNDO);
    expect(undone.board.steps[0].note).toBe("A");
    expect(undone.board.steps[0].moves).toContainEqual({ token: "a2", kind: "cut", to: { x: 10, y: 10 } });
  });

  it("deshacer corta la unión: lo que se escribe después es otro cambio", () => {
    const start = open(board(), view(1));
    const state = run(start, setNote("A"), UNDO, setNote("B"), setNote("Bc"));

    expect(state.past).toEqual([start.board]);
    expect(state.future).toEqual([]);
    expect(editorReducer(state, UNDO).board).toBe(start.board);
  });

  it("en «Inicio» no hace nada", () => {
    expectNothing(open(board()), setNote("Nada"));
  });
});

describe("set-court", () => {
  it("cambia la pista, sin mover las fichas, y apila el cambio", () => {
    const start = open(board());
    const state = editorReducer(start, { type: "set-court", court: "full" });

    expect(state.board).toEqual(board({ court: "full" }));
    expect(state.past).toEqual([start.board]);
    expect(run(state, { type: "set-court", court: "half" }).board).toEqual(board());
  });

  it("la misma pista no hace nada", () => {
    expectNothing(open(board()), { type: "set-court", court: "half" });
    expectNothing(open(board({ court: "full" })), { type: "set-court", court: "full" });
  });
});

describe("select", () => {
  it("elige una ficha que existe, en «Inicio» o en un paso, sin apilar historial", () => {
    const start = open(board());
    const state = editorReducer(start, select("d1"));

    expect(state.selected).toBe("d1");
    expect(state.board).toBe(start.board);
    expect(state.past).toEqual([]);
    expect(run(start, view(2), select("ball")).selected).toBe("ball");
  });

  it("un id que no existe, o null, deja sin elegir", () => {
    const state = open(board(), select("a1"));

    expect(editorReducer(state, select("nadie")).selected).toBeNull();
    expect(editorReducer(state, select(null)).selected).toBeNull();
  });

  it("no vacía lo que se puede rehacer", () => {
    const state = open(board(), moveToken("a1", 5, 5), UNDO, select("a2"));

    expect(state.future).toHaveLength(1);
    expect(tokenOf(editorReducer(state, REDO), "a1")?.at).toEqual({ x: 5, y: 5 });
  });
});

describe("view", () => {
  it.each([
    [1, 1],
    [2, 2],
    [0, 0],
    [5, 2],
    [-3, 0],
    [1.4, 1],
    [1.6, 2],
    [2.6, 2],
    [-0.4, 0],
  ])("ver %s, con dos pasos, es ver %s", (asked, shown) => {
    expect(open(board(), view(asked)).view).toBe(shown);
  });

  it("sin pasos solo hay «Inicio»", () => {
    expect(open(board({ steps: [] }), view(1)).view).toBe(0);
  });

  it("deja sin elegir y no apila historial", () => {
    const start = open(board(), select("a1"));
    const state = editorReducer(start, view(1));

    expect(state.selected).toBeNull();
    expect(state.board).toBe(start.board);
    expect(state.past).toEqual([]);
  });

  it("no vacía lo que se puede rehacer", () => {
    const state = open(board(), moveToken("a1", 5, 5), UNDO, view(2));

    expect(state.future).toHaveLength(1);
  });
});

describe("undo y redo", () => {
  const CHANGES: [string, EditorAction[], EditorAction][] = [
    ["add-token", [], add("cone")],
    ["move-token", [], moveToken("a1", 5, 5)],
    ["remove-token", [], removeToken("a1")],
    ["set-move", [view(2)], setMove("a1", "cut", 10, 10)],
    ["clear-move", [view(1)], clearMove("a1")],
    ["add-step", [view(1)], ADD_STEP],
    ["duplicate-step", [view(1)], DUPLICATE_STEP],
    ["remove-step", [view(1)], REMOVE_STEP],
    ["set-note", [view(2)], setNote("El 2 ataca el aro")],
    ["set-court", [], { type: "set-court", court: "full" }],
  ];

  it.each(CHANGES)("deshace y rehace un %s", (_type, before, action) => {
    const start = open(board(), ...before);
    const changed = editorReducer(start, action);
    expect(changed.board).not.toEqual(start.board);

    const undone = editorReducer(changed, UNDO);
    expect(undone.board).toBe(start.board);
    expect(undone.board).toEqual(board());
    expect(undone.past).toEqual([]);
    expect(undone.future).toEqual([changed.board]);

    const redone = editorReducer(undone, REDO);
    expect(redone.board).toBe(changed.board);
    expect(redone.past).toEqual([start.board]);
    expect(redone.future).toEqual([]);
  });

  it("deshace varios cambios en orden, y los rehace en el contrario", () => {
    const state = open(board(), moveToken("a1", 1, 1), moveToken("a1", 2, 2), moveToken("a1", 3, 3));
    const at = (current: EditorState) => tokenOf(current, "a1")?.at.x;

    const back = run(state, UNDO, UNDO);
    expect(at(back)).toBe(1);
    expect(at(run(back, UNDO))).toBe(50);
    expect(at(run(back, REDO))).toBe(2);
    expect(at(run(back, REDO, REDO))).toBe(3);
    expectNothing(run(back, REDO, REDO), REDO);
  });

  it("un cambio nuevo tras deshacer vacía lo que se podía rehacer", () => {
    const state = open(board(), moveToken("a1", 1, 1), moveToken("a1", 2, 2), UNDO, moveToken("c1", 9, 9));

    expect(state.future).toEqual([]);
    expectNothing(state, REDO);
    expect(tokenOf(state, "a1")?.at).toEqual({ x: 1, y: 1 });
  });

  it("una acción que no hace nada no vacía lo que se podía rehacer", () => {
    const state = open(board(), moveToken("a1", 1, 1), UNDO);

    expect(run(state, moveToken("a1", 50, 80), removeToken("nadie"), setNote("Nada")).future).toHaveLength(1);
  });

  it("el historial no pasa de HISTORY_MAX: se olvidan los cambios más antiguos", () => {
    const extra = 10;
    const moves = Array.from({ length: HISTORY_MAX + extra }, (_, n) => moveToken("a1", n + 1, 0));
    const state = open(board(), ...moves);

    expect(state.past).toHaveLength(HISTORY_MAX);

    const back = run(state, ...times(HISTORY_MAX, UNDO));
    expect(tokenOf(back, "a1")?.at).toEqual({ x: extra, y: 0 });
    expect(back.past).toEqual([]);
    expect(back.future).toHaveLength(HISTORY_MAX);
    expectNothing(back, UNDO);

    const again = run(back, ...times(HISTORY_MAX, REDO));
    expect(again.board).toBe(state.board);
    expect(again.past).toHaveLength(HISTORY_MAX);
  });

  it("deshacer un add-step estando en ese paso vuelve a una vista que existe", () => {
    const empty = open(null, add("attacker"), ADD_STEP);
    expect(empty.view).toBe(1);
    expect(editorReducer(empty, UNDO).view).toBe(0);

    const last = open(board(), view(2), ADD_STEP);
    expect(last.view).toBe(3);
    expect(editorReducer(last, UNDO).view).toBe(2);
  });

  it("rehacer un remove-step estando en el último paso también", () => {
    const state = open(board(), view(1), REMOVE_STEP, UNDO, view(2), REDO);

    expect(state.board.steps).toHaveLength(1);
    expect(state.view).toBe(1);
  });

  it("deshacer un add-token deja sin elegir la ficha que ya no existe", () => {
    const added = open(board(), add("cone"));
    expect(added.selected).toBe(added.board.tokens.at(-1)?.id);

    expect(editorReducer(added, UNDO).selected).toBeNull();
  });

  it("rehacer un remove-token deja sin elegir la ficha que se va", () => {
    const state = open(board(), removeToken("a1"), UNDO, select("a1"), REDO);

    expect(tokenOf(state, "a1")).toBeUndefined();
    expect(state.selected).toBeNull();
  });

  it("deshacer no deselecciona una ficha que sigue existiendo", () => {
    const state = open(board(), select("a1"), moveToken("a1", 5, 5), UNDO);

    expect(state.selected).toBe("a1");
  });

  it("sin historial no hacen nada", () => {
    const state = open(board(), select("a1"), view(1));

    expectNothing(state, UNDO);
    expectNothing(state, REDO);
    expectNothing(open(), UNDO);
    expectNothing(open(board(), moveToken("a1", 5, 5)), REDO);
  });
});

describe("editorFrame", () => {
  it("en «Inicio» y en el paso 1, las posiciones iniciales", () => {
    const frames = boardFrames(board());

    expect(editorFrame(open(board()))).toEqual(frames[0]);
    expect(editorFrame(open(board(), view(1)))).toEqual(frames[0]);
    expect(editorFrame(open(board()))).toEqual(Object.fromEntries(board().tokens.map((token) => [token.id, token.at])));
  });

  it("en el paso 2, las de después del paso 1", () => {
    const frames = boardFrames(board());
    const frame = editorFrame(open(board(), view(2)));

    expect(frame).toEqual(frames[1]);
    expect(frame.a1).toEqual({ x: 50, y: 30 });
    expect(frame.ball).toEqual({ x: 23, y: 60 });
  });

  it("en un paso recién añadido al final, las de después de todos los anteriores", () => {
    const state = open(board(), view(2), ADD_STEP);
    const frames = boardFrames(state.board);

    expect(state.view).toBe(3);
    expect(editorFrame(state)).toEqual(frames[2]);
    // El balón acompañó al 2, que botaba.
    expect(editorFrame(state).ball).toEqual({ x: 33, y: 25 });
  });

  it("sigue a lo que se edita: mover una ficha en «Inicio» la mueve en el paso 1", () => {
    const state = open(board(), moveToken("c1", 10, 10), view(1));

    expect(editorFrame(state).c1).toEqual({ x: 10, y: 10 });
  });

  it("sin fichas, un fotograma vacío", () => {
    expect(editorFrame(open())).toEqual({});
  });
});

describe("toSavable", () => {
  it("sin fichas es null, tenga o no pasos", () => {
    expect(toSavable(open().board)).toBeNull();
    expect(toSavable(board({ tokens: [], steps: [] }))).toBeNull();
    expect(toSavable(open(null, ADD_STEP, setNote("Sin nadie")).board)).toBeNull();
  });

  it("una pizarra entera se guarda tal cual", () => {
    expect(toSavable(board())).toEqual(board());
    expect(toSavable(board({ steps: [] }))).toEqual(board({ steps: [] }));
  });

  it("descarta los pasos sin movimientos y las notas en blanco", () => {
    const move = { token: "a1", kind: "cut" as const, to: { x: 10, y: 10 } };
    const saved = toSavable(
      board({
        steps: [
          { moves: [] },
          { note: "   ", moves: [move] },
          { note: "  Con nota  ", moves: [move] },
          { note: "Sin movimientos", moves: [] },
        ],
      }),
    );

    expect(saved?.steps).toEqual([{ moves: [move] }, { note: "Con nota", moves: [move] }]);
    expect(saved?.steps[0]).not.toHaveProperty("note");
    expect(saved?.tokens).toEqual(board().tokens);
  });

  it("lo que devuelve es igual a parseBoard de sí mismo", () => {
    const boards = [
      board(),
      board({ court: "full", steps: [] }),
      open(board(), view(1), ADD_STEP, setNote("  ")).board,
      open(board(), removeToken("a2"), add("cone"), view(2), setNote(" Fin ")).board,
      open(null, add("attacker"), add("ball"), ADD_STEP, setMove("b1", "pass", 3.3, 120), DUPLICATE_STEP).board,
    ];

    for (const current of boards) {
      const saved = toSavable(current);
      expect(saved).not.toBeNull();
      expect(parseBoard(saved)).toEqual(saved);
      // Y guardarla otra vez no la cambia.
      expect(saved && toSavable(saved)).toEqual(saved);
    }
  });

  it("si lo que queda no cumple la forma, null", () => {
    const tokens: BoardToken[] = [{ id: "a1", kind: "attacker", label: "1", at: { x: 50.5, y: 80 } }];

    expect(toSavable(board({ tokens, steps: [] }))).toBeNull();
  });

  it("no cambia la pizarra que recibe", () => {
    const original = board({ steps: [{ note: "  ", moves: [] }, ...board().steps] });
    const copy = structuredClone(original);

    toSavable(deepFreeze(original));

    expect(original).toEqual(copy);
  });
});

describe("sameSavable", () => {
  it("una pizarra es igual a sí misma y a su copia", () => {
    expect(sameSavable(board(), board())).toBe(true);
    expect(sameSavable(board({ court: "full" }), board({ court: "full" }))).toBe(true);
  });

  it("iguales aunque una tenga un paso vacío de más, o una nota en blanco", () => {
    const withEmpty = open(board(), view(1), ADD_STEP, setNote("Todavía sin movimientos")).board;
    const withBlank = open(board(), view(2), setNote("   ")).board;

    expect(withEmpty.steps).toHaveLength(3);
    expect(sameSavable(board(), withEmpty)).toBe(true);
    expect(sameSavable(withEmpty, board())).toBe(true);
    expect(sameSavable(board(), withBlank)).toBe(true);
  });

  it("distintas si cambia una posición, un movimiento, una nota, la pista o una ficha", () => {
    const start = open(board());

    expect(sameSavable(board(), run(start, moveToken("c1", 81, 40)).board)).toBe(false);
    expect(sameSavable(board(), run(start, view(1), setMove("a1", "cut", 50, 31)).board)).toBe(false);
    expect(sameSavable(board(), run(start, view(2), setNote("Con nota")).board)).toBe(false);
    expect(sameSavable(board(), board({ court: "full" }))).toBe(false);
    expect(sameSavable(board(), run(start, add("cone")).board)).toBe(false);
    expect(sameSavable(board(), run(start, view(1), REMOVE_STEP).board)).toBe(false);
  });

  it("null y una pizarra sin fichas son lo mismo", () => {
    expect(sameSavable(null, null)).toBe(true);
    expect(sameSavable(null, open().board)).toBe(true);
    expect(sameSavable(open().board, null)).toBe(true);
    expect(sameSavable(null, open(null, ADD_STEP, { type: "set-court", court: "full" }).board)).toBe(true);
    // Poner una ficha y quitarla deja lo mismo que no haber dibujado nada.
    expect(sameSavable(null, open(null, add("ball"), removeToken("b1")).board)).toBe(true);
  });

  it("null y una pizarra con fichas no son lo mismo", () => {
    expect(sameSavable(null, board())).toBe(false);
    expect(sameSavable(board(), null)).toBe(false);
  });

  it("deshacer todo deja la pizarra como estaba guardada", () => {
    const state = open(board(), add("cone"), view(1), setNote("Otra"), ADD_STEP);

    expect(sameSavable(board(), state.board)).toBe(false);
    expect(sameSavable(board(), run(state, UNDO, UNDO, UNDO).board)).toBe(true);
  });
});

// ── Invariantes: secuencias largas de acciones al azar (siempre las mismas) ───────────────────

const NOTES: readonly string[] = [
  "",
  "   ",
  "Pase",
  " Pase ",
  "Bloqueo y continuación",
  "El 4 sube a bloquear y el 1 sale por el lado fuerte",
  "x".repeat(NOTE_MAX),
  "y".repeat(NOTE_MAX + 30),
];

/** Los tipos de acción que cambian la pizarra. */
const BOARD_CHANGES: readonly EditorAction["type"][] = [
  "add-token",
  "move-token",
  "remove-token",
  "set-move",
  "clear-move",
  "add-step",
  "duplicate-step",
  "remove-step",
  "set-note",
  "set-court",
  "undo",
  "redo",
];

/**
 * Una acción cualquiera para ese estado. Casi siempre con sentido (una ficha que existe, una
 * vista que existe), y a veces sin él: un id que no hay, un punto fuera de la pista o con
 * decimales, una vista que se sale.
 */
function randomAction(state: EditorState, next: () => number): EditorAction {
  const int = (max: number) => Math.floor(next() * max);
  const pick = <T>(items: readonly T[]): T => items[int(items.length)];
  const point = (): BoardPoint => ({ x: next() * 140 - 20, y: next() * 140 - 20 });
  const id = () => (state.board.tokens.length === 0 || int(12) === 0 ? "nadie" : pick(state.board.tokens).id);

  const roll = int(100);
  if (roll < 16) return { type: "add-token", kind: pick(TOKEN_KINDS) };
  if (roll < 23) return { type: "move-token", id: id(), to: point() };
  if (roll < 26) return { type: "remove-token", id: id() };
  if (roll < 48) return { type: "set-move", id: id(), kind: pick(MOVE_KINDS), to: point() };
  if (roll < 52) return { type: "clear-move", id: id() };
  if (roll < 60) return { type: "add-step" };
  if (roll < 64) return { type: "duplicate-step" };
  if (roll < 66) return { type: "remove-step" };
  if (roll < 74) return { type: "set-note", note: pick(NOTES) };
  if (roll < 77) return { type: "set-court", court: pick(["half", "full"] as const) };
  if (roll < 81) return { type: "select", id: int(4) === 0 ? null : id() };
  if (roll < 92) {
    // «Inicio» a menudo, que es donde se ponen las fichas; si no, cualquier vista, o una de más.
    if (int(5) < 2) return { type: "view", view: 0 };
    return { type: "view", view: int(state.board.steps.length + 3) - 1 + (int(4) === 0 ? 0.4 : 0) };
  }
  if (roll < 97) return { type: "undo" };
  return { type: "redo" };
}


/**
 * Lo que el estado del editor incumple, en frases; vacío si está bien. Se juntan en una lista
 * (y no en un `expect` por comprobación) porque se llama miles de veces.
 */
function problemsOf(state: EditorState): string[] {
  const { board: current } = state;
  const kinds = new Map(current.tokens.map((token) => [token.id, token.kind]));
  const problems: string[] = [];

  // La vista y la ficha elegida, dentro de lo que la pizarra tiene.
  if (!Number.isInteger(state.view) || state.view < 0 || state.view > current.steps.length) {
    problems.push(`la vista ${state.view} no existe: hay ${current.steps.length} pasos`);
  }
  if (state.selected !== null && !kinds.has(state.selected)) {
    problems.push(`la ficha elegida, ${state.selected}, no existe`);
  }

  // El historial, con su tope.
  if (state.past.length > HISTORY_MAX) problems.push(`se recuerdan ${state.past.length} cambios`);
  if (state.future.length > HISTORY_MAX) problems.push(`se pueden rehacer ${state.future.length} cambios`);

  // Los topes de la pizarra y los ids sin repetir.
  if (current.tokens.length > MAX_TOKENS) problems.push(`hay ${current.tokens.length} fichas`);
  if (kinds.size !== current.tokens.length) problems.push("hay ids de ficha repetidos");
  if (current.steps.length > MAX_STEPS) problems.push(`hay ${current.steps.length} pasos`);

  // Ningún paso mueve dos veces la misma ficha, ni una que no existe, ni como no puede.
  current.steps.forEach((step, index) => {
    const name = `el paso ${index + 1}`;
    const moved = new Set<string>();
    if (step.moves.length > MAX_MOVES) problems.push(`${name} tiene ${step.moves.length} movimientos`);
    for (const move of step.moves) {
      const kind = kinds.get(move.token);
      if (moved.has(move.token)) problems.push(`${name} mueve dos veces a ${move.token}`);
      moved.add(move.token);
      if (kind === undefined) problems.push(`${name} mueve a ${move.token}, que no existe`);
      else if (!movesFor(kind).includes(move.kind)) problems.push(`${name}: ${move.token} no puede hacer ${move.kind}`);
    }
    if ((step.note ?? "x").length === 0) problems.push(`${name} guarda una nota vacía`);
    if ((step.note ?? "").length > NOTE_MAX) problems.push(`${name} tiene una nota de ${step.note?.length} caracteres`);
  });

  // Lo que se ve tiene todas las fichas, y solo esas.
  const shown = Object.keys(editorFrame(state)).sort().join();
  if (shown !== [...kinds.keys()].sort().join()) problems.push(`se ven otras fichas: ${shown}`);

  // Lo que se guardaría: nada si no hay fichas; si las hay, una pizarra con todas ellas y con
  // los pasos que tienen movimientos.
  const saved = toSavable(current);
  if (current.tokens.length === 0) {
    if (saved !== null) problems.push("sin fichas, se guardaría algo");
  } else if (saved === null) {
    problems.push("con fichas, no hay nada que guardar: la pizarra no cumple la forma");
  } else {
    const withMoves = current.steps.filter((step) => step.moves.length > 0).length;
    if (saved.steps.length !== withMoves) problems.push(`se guardarían ${saved.steps.length} pasos de ${withMoves}`);
    if (JSON.stringify(saved.tokens) !== JSON.stringify(current.tokens)) problems.push("se guardarían otras fichas");
  }

  return problems;
}

/** El estado cumple todo lo anterior, y lo que se guardaría pasa `parseBoard` sin cambios. */
function expectSound(state: EditorState, where: string) {
  expect(problemsOf(state), where).toEqual([]);

  const saved = toSavable(state.board);
  if (saved !== null) expect(parseBoard(saved), where).toEqual(saved);
}

type Tally = { changed: Set<EditorAction["type"]>; tokens: number; steps: number; moves: number; past: number };

/** Aplica `length` acciones al azar desde esa pizarra, comprobando el estado tras cada una. */
function runSequence(seed: number, start: Board | null, length: number): Tally {
  const next = prng(seed);
  const tally: Tally = { changed: new Set(), tokens: 0, steps: 0, moves: 0, past: 0 };
  let state = initialEditor(start);
  expectSound(state, `semilla ${seed}, al abrir`);

  for (let n = 0; n < length; n += 1) {
    const action = randomAction(state, next);
    const where = `semilla ${seed}, acción ${n} ${JSON.stringify(action).slice(0, 120)}`;

    // El reductor no cambia lo que recibe: congelado, cualquier intento lanzaría.
    deepFreeze(state);
    deepFreeze(action);
    let after: EditorState;
    try {
      after = editorReducer(state, action);
    } catch (error) {
      throw new Error(`${where}: ${String(error)}`, { cause: error });
    }
    expectSound(after, where);

    const changed = after.board !== state.board;
    const trail: string[] = [];
    if (action.type === "select" || action.type === "view") {
      // Ni tocan la pizarra ni el historial.
      if (changed || after.past !== state.past || after.future !== state.future) trail.push("toca la pizarra o el historial");
    } else if (!changed) {
      // Lo que no cambia la pizarra no deja rastro: es el mismo estado.
      if (after !== state) trail.push("no cambia la pizarra, pero devuelve otro estado");
    } else if (action.type !== "undo" && action.type !== "redo") {
      // Un cambio apila la pizarra de antes (salvo la nota que se sigue escribiendo), vacía lo
      // rehacible, y se deshace y se rehace.
      const merged = after.merging !== null && after.merging === state.merging;
      const previous = merged ? state.past.at(-1) : state.board;
      if (after.past.at(-1) !== previous) trail.push("no apila la pizarra de antes");
      if (after.future.length > 0) trail.push("deja cambios por rehacer");

      const undone = editorReducer(after, UNDO);
      if (undone.board !== previous) trail.push("deshacer no vuelve a la pizarra de antes");
      trail.push(...problemsOf(undone).map((problem) => `deshecha, ${problem}`));
      if (editorReducer(undone, REDO).board !== after.board) trail.push("rehacer no vuelve a la pizarra de después");
    }

    // Una ficha nueva queda elegida y no pisa a ninguna de las que había.
    if (action.type === "add-token" && changed) {
      const fresh = after.board.tokens[after.board.tokens.length - 1];
      if (after.selected !== fresh.id) trail.push("la ficha nueva no queda elegida");
      for (const other of state.board.tokens) {
        if (distance(fresh.at, other.at) < CLEARANCE) trail.push(`la ficha nueva pisa a ${other.id}`);
      }
    }
    expect(trail, where).toEqual([]);

    if (changed) tally.changed.add(action.type);
    tally.tokens = Math.max(tally.tokens, after.board.tokens.length);
    tally.steps = Math.max(tally.steps, after.board.steps.length);
    tally.moves = Math.max(tally.moves, ...after.board.steps.map((step) => step.moves.length));
    tally.past = Math.max(tally.past, after.past.length);
    state = after;
  }

  return tally;
}

describe("invariantes del reductor", () => {
  const LENGTH = 700;
  // Unas empiezan de cero y otras, de una pizarra ya dibujada.
  const SEQUENCES: [number, "vacía" | "dibujada"][] = [
    [1, "vacía"],
    [2, "dibujada"],
    [7, "vacía"],
    [42, "dibujada"],
    [1011, "vacía"],
    [2026, "dibujada"],
    [31337, "vacía"],
    [90210, "dibujada"],
  ];
  // Lo que dio de sí cada secuencia, para no repetirlas en el último test.
  const tallies = new Map<number, Tally>();
  const sequence = (seed: number, kind: "vacía" | "dibujada"): Tally => {
    const tally = tallies.get(seed) ?? runSequence(seed, kind === "vacía" ? null : board(), LENGTH);
    tallies.set(seed, tally);
    return tally;
  };

  it.each(SEQUENCES)("semilla %i, desde una pizarra %s: el estado siempre es válido y nada se muta", (seed, kind) => {
    sequence(seed, kind);
  });

  it("entre todas las secuencias se prueba cada cambio y se llega a los topes", () => {
    const all = SEQUENCES.map(([seed, kind]) => sequence(seed, kind));
    const changed = new Set(all.flatMap((tally) => [...tally.changed]));

    expect([...changed].sort()).toEqual([...BOARD_CHANGES].sort());
    expect(Math.max(...all.map((tally) => tally.past))).toBe(HISTORY_MAX);
    expect(Math.max(...all.map((tally) => tally.tokens))).toBe(MAX_TOKENS);
    expect(Math.max(...all.map((tally) => tally.steps))).toBe(MAX_STEPS);
  }, 30_000);

  it("el generador de secuencias es determinista", () => {
    const first = prng(5);
    const second = prng(5);
    const one = Array.from({ length: 20 }, () => randomAction(initialEditor(board()), first));
    const other = Array.from({ length: 20 }, () => randomAction(initialEditor(board()), second));

    expect(one).toEqual(other);
    expect(new Set(one.map((action) => action.type)).size).toBeGreaterThan(3);
  });
});

// ── Lo que encontró la primera pasada de estos tests, ya arreglado ───────────────────────

describe("entradas que no son un punto ni un paso", () => {
  const drawn = (): Board => ({
    version: 1,
    court: "half",
    tokens: [
      { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
      { id: "b1", kind: "ball", at: { x: 53, y: 80 } },
    ],
    steps: [{ moves: [{ token: "a1", kind: "cut", to: { x: 50, y: 30 } }] }],
  });

  it("mover una ficha a un punto que no es un número no hace nada", () => {
    const state = initialEditor(drawn());

    expect(editorReducer(state, { type: "move-token", id: "a1", to: { x: Number.NaN, y: 10 } })).toBe(state);
  });

  it("un movimiento hacia un punto que no es un número no hace nada", () => {
    const state = editorReducer(initialEditor(drawn()), { type: "view", view: 1 });

    expect(editorReducer(state, { type: "set-move", id: "a1", kind: "cut", to: { x: 10, y: Number.NaN } })).toBe(state);
  });

  it("ir a un paso que no es un número no hace nada", () => {
    const state = initialEditor(drawn());

    expect(editorReducer(state, { type: "view", view: Number.NaN })).toBe(state);
  });
});

describe("set-move, retocar un movimiento", () => {
  const drawn = (): Board => ({
    version: 1,
    court: "half",
    tokens: [
      { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
      { id: "a2", kind: "attacker", label: "2", at: { x: 20, y: 60 } },
    ],
    steps: [
      {
        moves: [
          { token: "a1", kind: "cut", to: { x: 50, y: 30 } },
          { token: "a2", kind: "cut", to: { x: 30, y: 30 } },
        ],
      },
    ],
  });
  const atStep = () => editorReducer(initialEditor(drawn()), { type: "view", view: 1 });

  it("el mismo movimiento que ya tenía no es un cambio: ni historial ni cambios sin guardar", () => {
    const state = atStep();

    const next = editorReducer(state, { type: "set-move", id: "a1", kind: "cut", to: { x: 50, y: 30 } });

    expect(next).toBe(state);
    expect(sameSavable(next.board, drawn())).toBe(true);
  });

  it("cambiar uno lo deja en su sitio de la lista", () => {
    const next = editorReducer(atStep(), { type: "set-move", id: "a1", kind: "dribble", to: { x: 60, y: 40 } });

    expect(next.board.steps[0].moves).toEqual([
      { token: "a1", kind: "dribble", to: { x: 60, y: 40 } },
      { token: "a2", kind: "cut", to: { x: 30, y: 30 } },
    ]);
  });
});

describe("add-token, numeración con pizarras que no dibujó el editor", () => {
  it("no repite un número que ya lleva otro de su equipo, aunque su id sea otro", () => {
    const foreign: Board = {
      version: 1,
      court: "half",
      tokens: [
        { id: "p1", kind: "attacker", label: "1", at: { x: 10, y: 10 } },
        { id: "p2", kind: "attacker", label: "2", at: { x: 90, y: 10 } },
      ],
      steps: [],
    };

    const next = editorReducer(initialEditor(foreign), { type: "add-token", kind: "attacker" });

    expect(next.board.tokens.at(-1)).toMatchObject({ id: "a3", kind: "attacker", label: "3" });
    // Un defensor sí puede llevar el 1: los números son por equipo.
    expect(editorReducer(next, { type: "add-token", kind: "defender" }).board.tokens.at(-1)).toMatchObject({
      id: "d1",
      label: "1",
    });
  });
});

describe("set-note, un emoji en el corte", () => {
  it("no deja medio carácter al recortar", () => {
    const state = editorReducer(
      initialEditor({
        version: 1,
        court: "half",
        tokens: [{ id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } }],
        steps: [{ moves: [{ token: "a1", kind: "cut", to: { x: 50, y: 30 } }] }],
      }),
      { type: "view", view: 1 },
    );

    const note = editorReducer(state, { type: "set-note", note: `${"x".repeat(NOTE_MAX - 1)}🏀` }).board.steps[0].note;

    expect(note).toBe("x".repeat(NOTE_MAX - 1));
    expect(note?.isWellFormed()).toBe(true);
  });
});

describe("ballHeldBy e isHeld", () => {
  const drawn: Board = {
    version: 1,
    court: "half",
    tokens: [
      { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
      { id: "d1", kind: "defender", label: "1", at: { x: 50, y: 75 } },
      { id: "a2", kind: "attacker", label: "2", at: { x: 20, y: 40 } },
      { id: "b1", kind: "ball", at: { x: 53, y: 80 } },
      { id: "b2", kind: "ball", at: { x: 90, y: 90 } },
      { id: "c1", kind: "cone", at: { x: 53, y: 82 } },
    ],
    steps: [],
  };
  const frame = Object.fromEntries(drawn.tokens.map((token) => [token.id, token.at]));

  it("el balón lo lleva quien lo tiene al alcance", () => {
    expect(ballHeldBy(drawn, frame, "a1")).toBe("b1");
    // El defensor también lo tiene a menos de 6: el balón se pinta con el más cercano, pero a los dos se les ofrece pasar.
    expect(ballHeldBy(drawn, frame, "d1")).toBe("b1");
    expect(ballHeldBy(drawn, frame, "a2")).toBeNull();
  });

  it("un cono, un balón o una ficha que no existe no llevan balón", () => {
    expect(ballHeldBy(drawn, frame, "c1")).toBeNull();
    expect(ballHeldBy(drawn, frame, "b1")).toBeNull();
    expect(ballHeldBy(drawn, frame, "nadie")).toBeNull();
  });

  it("manda el fotograma, no dónde empezó cada ficha", () => {
    const moved = { ...frame, a2: { x: 88, y: 90 } };

    expect(ballHeldBy(drawn, moved, "a2")).toBe("b2");
  });

  it("isHeld dice si a un balón lo lleva alguien", () => {
    expect(isHeld(drawn, frame, "b1")).toBe(true);
    expect(isHeld(drawn, frame, "b2")).toBe(false);
  });
});
