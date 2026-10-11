import { boardFrames } from "./frames";
import {
  BALL_REACH,
  COURT_MAX,
  HISTORY_MAX,
  MAX_LABEL_NUMBER,
  MAX_MOVES,
  MAX_STEPS,
  MAX_TOKENS,
  NOTE_MAX,
} from "./limits";
import { parseBoard } from "./schema";
import type { Board, BoardFrame, BoardMoveKind, BoardPoint, BoardToken, BoardTokenKind } from "./types";

// El editor de pizarra como dato: el estado de lo que se está dibujando y cada cosa que se le
// puede hacer, como una función pura de estado a estado. Sin React: quien lo pinta
// (`BoardEditor`) solo traduce toques a acciones. Así cada cambio se prueba sin pantalla y
// deshacer es volver a la pizarra anterior.
//
// La pizarra que se edita es la de la versión 1, la misma que lee el visor, con una licencia
// mientras se dibuja: un paso puede no tener todavía movimientos. `toSavable` los descarta al
// guardar, y lo que devuelve pasa siempre `parseBoard`.

/**
 * Lo que se ve: 0 es «Inicio» (dónde empieza cada ficha) y `n` es el paso `n`, con las fichas
 * donde están al empezarlo y sus movimientos.
 */
export type EditorState = {
  board: Board;
  view: number;
  /** La ficha elegida, si hay alguna. */
  selected: string | null;
  /** Las pizarras anteriores, de la más antigua a la más reciente, y las deshechas. */
  past: Board[];
  future: Board[];
  /**
   * Qué cambio seguido se junta en uno solo al deshacer (escribir una nota letra a letra):
   * mientras la clave no cambie, no se apila otra pizarra.
   */
  merging: string | null;
};

export type EditorAction =
  | { type: "add-token"; kind: BoardTokenKind }
  /**
   * Con `nudge` (un toque de flecha), varios seguidos de la misma ficha son un solo paso atrás:
   * llevarla a su sitio a toques no puede comerse el historial.
   */
  | { type: "move-token"; id: string; to: BoardPoint; nudge?: boolean }
  | { type: "remove-token"; id: string }
  | { type: "set-move"; id: string; kind: BoardMoveKind; to: BoardPoint }
  | { type: "clear-move"; id: string }
  | { type: "add-step" }
  | { type: "duplicate-step" }
  | { type: "remove-step" }
  | { type: "set-note"; note: string }
  | { type: "set-court"; court: Board["court"] }
  | { type: "select"; id: string | null }
  | { type: "view"; view: number }
  | { type: "undo" }
  | { type: "redo" };

const EMPTY: Board = { version: 1, court: "half", tokens: [], steps: [] };

/** El editor recién abierto: la pizarra del ejercicio, o una media pista vacía, en «Inicio». */
export function initialEditor(board: Board | null): EditorState {
  return { board: board ?? EMPTY, view: 0, selected: null, past: [], future: [], merging: null };
}

function clampPoint(point: BoardPoint): BoardPoint {
  const clamp = (value: number) => Math.min(COURT_MAX, Math.max(0, Math.round(value)));
  return { x: clamp(point.x), y: clamp(point.y) };
}

/** Un punto que no es un número (un toque medido sobre una pista de 0 px) no se acota: se ignora. */
function isPoint(point: BoardPoint): boolean {
  return !Number.isNaN(point.x) && !Number.isNaN(point.y);
}

/** Una nota recortada a su tope, sin partir por la mitad un carácter de dos unidades (un emoji). */
function clipNote(note: string): string {
  const clipped = note.slice(0, NOTE_MAX);
  const last = clipped.charCodeAt(clipped.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? clipped.slice(0, -1) : clipped;
}

/** Dónde aparece una ficha nueva: el primer sitio de estos que no esté ya ocupado. */
const SPOTS: readonly BoardPoint[] = [
  { x: 50, y: 70 },
  { x: 25, y: 55 },
  { x: 75, y: 55 },
  { x: 35, y: 30 },
  { x: 65, y: 30 },
  { x: 50, y: 45 },
  { x: 15, y: 25 },
  { x: 85, y: 25 },
  { x: 50, y: 88 },
  { x: 25, y: 80 },
  { x: 75, y: 80 },
  { x: 50, y: 15 },
];
/** A menos de esto, en unidades de pista, un sitio se da por ocupado. */
const SPOT_CLEARANCE = 9;

function freeSpot(tokens: readonly BoardToken[]): BoardPoint {
  const taken = (spot: BoardPoint) =>
    tokens.some((token) => Math.hypot(token.at.x - spot.x, token.at.y - spot.y) < SPOT_CLEARANCE);
  const free = SPOTS.find((spot) => !taken(spot));
  if (free) return free;

  // Todos ocupados: una rejilla, de arriba abajo, hasta dar con un hueco.
  for (let y = 10; y <= 90; y += 10) {
    for (let x = 10; x <= 90; x += 10) {
      if (!taken({ x, y })) return { x, y };
    }
  }
  return { x: 50, y: 50 };
}

const PREFIX: Record<BoardTokenKind, string> = { attacker: "a", defender: "d", ball: "b", cone: "c" };

/**
 * La ficha nueva de un tipo, o `null` si no cabe otra. Un jugador lleva el menor número libre,
 * del 1 al 9; el balón y los conos no llevan etiqueta.
 */
function newToken(board: Board, kind: BoardTokenKind): BoardToken | null {
  if (board.tokens.length >= MAX_TOKENS) return null;

  const ids = new Set(board.tokens.map((token) => token.id));
  // Los números que ya llevan los de su equipo, vengan con el id que vengan: una pizarra que no
  // dibujó el editor puede traer otros ids.
  const labels = new Set(board.tokens.filter((token) => token.kind === kind).map((token) => token.label));
  const numbered = kind === "attacker" || kind === "defender";
  const top = numbered ? MAX_LABEL_NUMBER : MAX_TOKENS;
  for (let n = 1; n <= top; n += 1) {
    const id = `${PREFIX[kind]}${n}`;
    if (ids.has(id) || (numbered && labels.has(String(n)))) continue;
    const at = freeSpot(board.tokens);
    return numbered ? { id, kind, label: String(n), at } : { id, kind, at };
  }
  return null;
}

/** Si en esta pizarra cabe otra ficha de ese tipo. */
export function canAddToken(board: Board, kind: BoardTokenKind): boolean {
  return newToken(board, kind) !== null;
}

/** Si cabe otro paso. */
export function canAddStep(board: Board): boolean {
  return board.steps.length < MAX_STEPS;
}

/** Lo que puede hacer una ficha en un paso: el balón se pasa, un jugador hace lo demás, un cono nada. */
export function movesFor(kind: BoardTokenKind): readonly BoardMoveKind[] {
  if (kind === "ball") return ["pass"];
  if (kind === "cone") return [];
  return ["cut", "dribble", "screen"];
}

/**
 * El balón que lleva un jugador en un fotograma: el más cercano de los que tiene a `BALL_REACH`
 * o menos. `null` si no lleva ninguno, o si `playerId` no es un jugador. De aquí sale que a
 * quien lleva el balón se le ofrezca «Pasar».
 */
export function ballHeldBy(board: Board, frame: BoardFrame, playerId: string): string | null {
  const player = board.tokens.find((token) => token.id === playerId);
  if (!player || (player.kind !== "attacker" && player.kind !== "defender")) return null;
  const at = frame[player.id] ?? player.at;

  let held: string | null = null;
  let closest = Infinity;
  for (const token of board.tokens) {
    if (token.kind !== "ball") continue;
    const ball = frame[token.id] ?? token.at;
    const distance = Math.hypot(ball.x - at.x, ball.y - at.y);
    if (distance <= BALL_REACH && distance < closest) {
      held = token.id;
      closest = distance;
    }
  }
  return held;
}

/** Si a un balón lo lleva algún jugador en ese fotograma. */
export function isHeld(board: Board, frame: BoardFrame, ballId: string): boolean {
  return board.tokens.some((token) => ballHeldBy(board, frame, token.id) === ballId);
}

/** Dónde está cada ficha en lo que se ve: al empezar («Inicio») o al empezar ese paso. */
export function editorFrame(state: EditorState): BoardFrame {
  const frames = boardFrames(state.board);
  return frames[Math.min(frames.length - 1, Math.max(0, state.view - 1))];
}

/** El paso que se ve, o `null` en «Inicio». */
function stepIndex(state: EditorState): number | null {
  return state.view >= 1 && state.view <= state.board.steps.length ? state.view - 1 : null;
}

/**
 * Aplica un cambio de pizarra: apila la anterior para deshacer (hasta `HISTORY_MAX`), olvida lo
 * deshecho y deja lo demás como diga `rest`. Con `merging`, un cambio seguido del mismo tipo no
 * apila otra: escribir una nota es un solo paso atrás.
 */
function commit(
  state: EditorState,
  board: Board,
  rest: Partial<Pick<EditorState, "view" | "selected">> = {},
  merging: string | null = null,
): EditorState {
  const merge = merging !== null && merging === state.merging;
  const past = merge ? state.past : [...state.past, state.board].slice(-HISTORY_MAX);
  return { ...state, ...rest, board, past, future: [], merging };
}

/** Deja la vista y la ficha elegida dentro de lo que la pizarra tiene. */
function settle(state: EditorState): EditorState {
  const view = Math.min(state.board.steps.length, Math.max(0, state.view));
  const selected = state.board.tokens.some((token) => token.id === state.selected) ? state.selected : null;
  return { ...state, view, selected };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { board } = state;
  const step = stepIndex(state);

  switch (action.type) {
    case "select": {
      const exists = action.id !== null && board.tokens.some((token) => token.id === action.id);
      return { ...state, selected: exists ? action.id : null, merging: null };
    }

    case "view":
      if (Number.isNaN(action.view)) return state;
      return settle({ ...state, view: Math.round(action.view), selected: null, merging: null });

    case "undo": {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return settle({
        ...state,
        board: previous,
        past: state.past.slice(0, -1),
        future: [board, ...state.future],
        merging: null,
      });
    }

    case "redo": {
      const [next, ...future] = state.future;
      if (!next) return state;
      return settle({ ...state, board: next, past: [...state.past, board], future, merging: null });
    }

    case "set-court":
      if (action.court === board.court) return state;
      return commit(state, { ...board, court: action.court });

    // ── Fichas: solo en «Inicio» ────────────────────────────────────────────────────────
    case "add-token": {
      if (state.view !== 0) return state;
      const token = newToken(board, action.kind);
      if (!token) return state;
      return commit(state, { ...board, tokens: [...board.tokens, token] }, { selected: token.id });
    }

    case "move-token": {
      if (state.view !== 0 || !isPoint(action.to)) return state;
      const to = clampPoint(action.to);
      const token = board.tokens.find((candidate) => candidate.id === action.id);
      if (!token || (token.at.x === to.x && token.at.y === to.y)) return state;

      // Quien lleva el balón se lo lleva: se mueve lo mismo que él, sin salirse de la pista.
      const start: BoardFrame = Object.fromEntries(board.tokens.map((candidate) => [candidate.id, candidate.at]));
      const held = ballHeldBy(board, start, token.id);
      const dx = to.x - token.at.x;
      const dy = to.y - token.at.y;
      return commit(
        state,
        {
          ...board,
          tokens: board.tokens.map((candidate) => {
            if (candidate.id === action.id) return { ...candidate, at: to };
            if (candidate.id === held) {
              return { ...candidate, at: clampPoint({ x: candidate.at.x + dx, y: candidate.at.y + dy }) };
            }
            return candidate;
          }),
        },
        {},
        action.nudge ? `move:${action.id}` : null,
      );
    }

    case "remove-token": {
      if (state.view !== 0 || !board.tokens.some((token) => token.id === action.id)) return state;
      // Con la ficha se van sus movimientos en todos los pasos.
      return commit(
        state,
        {
          ...board,
          tokens: board.tokens.filter((token) => token.id !== action.id),
          steps: board.steps.map((item) => ({ ...item, moves: item.moves.filter((move) => move.token !== action.id) })),
        },
        { selected: null },
      );
    }

    // ── Movimientos: solo en un paso ────────────────────────────────────────────────────
    case "set-move": {
      if (step === null || !isPoint(action.to)) return state;
      const token = board.tokens.find((candidate) => candidate.id === action.id);
      if (!token || !movesFor(token.kind).includes(action.kind)) return state;

      const current = board.steps[step];
      const move = { token: action.id, kind: action.kind, to: clampPoint(action.to) };
      const existing = current.moves.find((candidate) => candidate.token === action.id);
      // El mismo que ya tenía no es un cambio.
      if (existing && existing.kind === move.kind && existing.to.x === move.to.x && existing.to.y === move.to.y) {
        return state;
      }
      // Sustituir el que ya tenía no cuenta para el tope; añadir uno más, sí.
      if (!existing && current.moves.length >= MAX_MOVES) return state;

      // En su sitio: el orden de los movimientos de un paso no cambia al retocar uno.
      const moves = existing
        ? current.moves.map((candidate) => (candidate.token === action.id ? move : candidate))
        : [...current.moves, move];
      return commit(state, {
        ...board,
        steps: board.steps.map((item, index) => (index === step ? { ...item, moves } : item)),
      });
    }

    case "clear-move": {
      if (step === null || !board.steps[step].moves.some((move) => move.token === action.id)) return state;
      return commit(state, {
        ...board,
        steps: board.steps.map((item, index) =>
          index === step ? { ...item, moves: item.moves.filter((move) => move.token !== action.id) } : item,
        ),
      });
    }

    // ── Pasos ───────────────────────────────────────────────────────────────────────────
    case "add-step": {
      if (!canAddStep(board)) return state;
      // Detrás del que se ve; desde «Inicio», el primero.
      const at = state.view;
      const steps = [...board.steps.slice(0, at), { moves: [] }, ...board.steps.slice(at)];
      return commit(state, { ...board, steps }, { view: at + 1, selected: null });
    }

    case "duplicate-step": {
      if (step === null || !canAddStep(board)) return state;
      // El paso copiado repite el gesto, no el destino: cada ficha vuelve a moverse lo mismo y en
      // la misma dirección desde donde quedó. Con el mismo destino no se movería nadie.
      const from = boardFrames(board)[step];
      const copy = {
        ...board.steps[step],
        moves: board.steps[step].moves.map((move) => {
          const origin = from[move.token] ?? move.to;
          return { ...move, to: clampPoint({ x: 2 * move.to.x - origin.x, y: 2 * move.to.y - origin.y }) };
        }),
      };
      const steps = [...board.steps.slice(0, step + 1), copy, ...board.steps.slice(step + 1)];
      return commit(state, { ...board, steps }, { view: state.view + 1, selected: null });
    }

    case "remove-step": {
      if (step === null) return state;
      const steps = board.steps.filter((_, index) => index !== step);
      return commit(state, { ...board, steps }, { view: Math.min(state.view, steps.length), selected: null });
    }

    case "set-note": {
      if (step === null) return state;
      const note = clipNote(action.note);
      const current = board.steps[step];
      if ((current.note ?? "") === note) return state;
      const next = note === "" ? { moves: current.moves } : { ...current, note };
      return commit(
        state,
        { ...board, steps: board.steps.map((item, index) => (index === step ? next : item)) },
        {},
        `note:${step}`,
      );
    }
  }
}

/**
 * La pizarra tal como se guarda: sin los pasos que no tienen movimientos y sin notas en blanco.
 * `null` si no queda ninguna ficha (no hay pizarra que guardar) o si, por lo que sea, lo que
 * queda no cumple la forma: lo que se guarda pasa siempre `parseBoard`.
 */
export function toSavable(board: Board): Board | null {
  if (board.tokens.length === 0) return null;

  return parseBoard({
    ...board,
    steps: board.steps
      .filter((step) => step.moves.length > 0)
      .map((step) => {
        const note = step.note?.trim();
        return note ? { note, moves: step.moves } : { moves: step.moves };
      }),
  });
}

/** Si dos pizarras se guardarían igual: de ahí sale si hay cambios sin guardar. */
export function sameSavable(a: Board | null, b: Board | null): boolean {
  return JSON.stringify(a ? toSavable(a) : null) === JSON.stringify(b ? toSavable(b) : null);
}
