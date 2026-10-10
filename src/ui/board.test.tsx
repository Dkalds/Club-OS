import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { boardFrames } from "@/modules/board/frames";
import type { Board as BoardData, BoardFrame, BoardPoint } from "@/modules/board/types";
import { BOARD_HOLD_MS, BOARD_MOVE_MS, Board } from "./board";
import { BOARD_VIEW, movePaths, toBox, tokenBox } from "./board-drawing";

const TITLE = "3 calles";
const REDUCE = "(prefers-reduced-motion: reduce)";
/** La clase que hace que una ficha se desplace en vez de saltar. */
const TRANSITION = "transition-transform";

/**
 * Una pizarra válida y pequeña, de tres pasos: el 1 pasa al 2 y corta; el 2 bota hacia el aro
 * (y el balón, que tiene pegado, le acompaña); el 1 sube a bloquear, sin nota.
 */
function board(overrides: Partial<BoardData> = {}): BoardData {
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
      { note: "El 2 bota hacia el aro", moves: [{ token: "a2", kind: "dribble", to: { x: 30, y: 25 } }] },
      { moves: [{ token: "a1", kind: "screen", to: { x: 35, y: 30 } }] },
    ],
    ...overrides,
  };
}

function setup(data: BoardData = board()) {
  const view = render(<Board board={data} title={TITLE} />);
  return { ...view, data, frames: boardFrames(data) };
}

/** Avanza el reloj. De temporizador en temporizador: cada uno deja programado el siguiente al repintar. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Un paso entero de la reproducción: se enseña y las fichas llegan a su sitio. */
function playStep() {
  advance(BOARD_HOLD_MS);
  advance(BOARD_MOVE_MS);
}

function button(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function press(name: string) {
  fireEvent.click(button(name));
}

function tokens(container: HTMLElement): SVGGElement[] {
  return Array.from(container.querySelectorAll<SVGGElement>("[data-token]"));
}

/** Dónde pinta el componente cada ficha: el `transform` de su estilo, por id. */
function positions(container: HTMLElement): Record<string, string> {
  return Object.fromEntries(tokens(container).map((token) => [token.getAttribute("data-token") ?? "", token.style.transform]));
}

/** Un punto de la caja con dos decimales como mucho, que es como va al estilo. */
function rounded(at: BoardPoint): BoardPoint {
  return { x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100 };
}

function translate(at: BoardPoint): string {
  const { x, y } = rounded(at);
  return `translate(${x}px, ${y}px)`;
}

/**
 * Dónde tiene que estar cada ficha en un fotograma, en la caja del dibujo: donde dice el
 * fotograma, salvo el balón que lleva un jugador, que va pegado a él (`tokenBox`).
 */
function placed(data: BoardData, frame: BoardFrame): Record<string, string> {
  return Object.fromEntries(
    data.tokens.map((token) => [token.id, translate(tokenBox(data.court, token, frame, data.tokens))]),
  );
}

/** Lo mismo, sin pegar el balón a nadie: donde dice el fotograma y nada más. */
function plain(data: BoardData, frame: BoardFrame): Record<string, string> {
  return Object.fromEntries(data.tokens.map((token) => [token.id, translate(toBox(data.court, frame[token.id]))]));
}

/** El trazo y el remate de un movimiento dibujado, por su tipo. */
function drawn(container: HTMLElement, kind: string): (string | null)[] {
  return Array.from(container.querySelectorAll(`[data-move="${kind}"] path`), (path) => path.getAttribute("d"));
}

/** Las regiones de estado: `true` si todas se anuncian (`polite`), `false` si ninguna (`off`). */
function announced(): boolean {
  const live = screen.getAllByRole("status").map((region) => region.getAttribute("aria-live"));
  if (live.length !== 2 || new Set(live).size !== 1) throw new Error(`Regiones de estado: ${live.join(", ")}`);
  if (live[0] !== "polite" && live[0] !== "off") throw new Error(`aria-live inesperado: ${live[0]}`);
  return live[0] === "polite";
}

/** Los movimientos dibujados, por tipo y en orden. */
function moves(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("[data-move]"), (move) => move.getAttribute("data-move"));
}

function note(container: HTMLElement): Element {
  const found = container.querySelector("[data-board-note]");
  if (!found) throw new Error("Falta la región de la nota");
  return found;
}

/** Las clases de transición de las fichas: `true` si todas la llevan, `false` si ninguna. */
function animated(container: HTMLElement): boolean {
  const flags = tokens(container).map((token) => token.classList.contains(TRANSITION));
  if (new Set(flags).size !== 1) throw new Error("Unas fichas llevan la transición y otras no");
  return flags[0];
}

/** Hace que el dispositivo pida (o no) menos movimiento. jsdom no trae `matchMedia`. */
function stubMotion(reduce: boolean) {
  const matchMedia = vi.fn((query: string) => ({ matches: reduce && query === REDUCE, media: query }));
  vi.stubGlobal("matchMedia", matchMedia);
  return matchMedia;
}

let errors: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.useFakeTimers();
  // Un aviso de React (un repintado fuera de `act`, un componente desmontado) llega por aquí.
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  // Antes de devolver el reloj de verdad: así el efecto limpia sus temporizadores de mentira.
  cleanup();
  expect(vi.getTimerCount()).toBe(0);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Board, foto fija (sin pasos)", () => {
  it("es una imagen con el nombre del ejercicio, sin controles ni «Paso…»", () => {
    const { container } = setup(board({ steps: [] }));

    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}` })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/Paso/)).not.toBeInTheDocument();
    expect(screen.queryByText("Final")).not.toBeInTheDocument();
    expect(container.querySelector("[data-board-note]")).toBeNull();
  });

  it("pinta cada ficha donde está, con su etiqueta, y ningún movimiento", () => {
    const { container, data, frames } = setup(board({ steps: [] }));
    const labels = Array.from(container.querySelectorAll("text"), (text) => text.textContent);

    expect(tokens(container)).toHaveLength(data.tokens.length);
    expect(positions(container)).toEqual(placed(data, frames[0]));
    // Los dos atacantes y el defensor; el balón y el cono no llevan.
    expect(labels).toEqual(["1", "2", "1"]);
    expect(moves(container)).toEqual([]);
  });

  it("no programa nada: no hay nada que reproducir", () => {
    setup(board({ steps: [] }));

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Board, con pasos", () => {
  it("empieza en el primer paso, y lo dice su nombre y su etiqueta", () => {
    const { container, data, frames } = setup();

    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}, paso 1 de 3` })).toBeInTheDocument();
    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    expect(positions(container)).toEqual(placed(data, frames[0]));
    // (50, 80) en media pista: 5 + 50·0,9 y 5 + 80·0,65.
    expect(positions(container).a1).toBe("translate(50px, 57px)");
  });

  it("enseña los movimientos del primer paso y su nota", () => {
    const { container } = setup();

    expect(moves(container)).toEqual(["pass", "cut"]);
    expect(note(container)).toHaveTextContent("El 1 pasa al 2 y corta");
  });

  it("lleva cuatro botones con nombre, de target-min", () => {
    setup();

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    for (const name of ["Reiniciar la pizarra", "Paso anterior", "Reproducir la pizarra", "Paso siguiente"]) {
      expect(button(name)).toHaveClass("size-(--target-min)");
      expect(button(name)).toHaveAttribute("type", "button");
    }
  });

  it("en el primer paso no se puede reiniciar ni ir atrás, y sí reproducir y avanzar", () => {
    setup();

    expect(button("Reiniciar la pizarra")).toBeDisabled();
    expect(button("Paso anterior")).toBeDisabled();
    expect(button("Reproducir la pizarra")).toBeEnabled();
    expect(button("Paso siguiente")).toBeEnabled();
  });

  it("«Paso siguiente» avanza sin animación: etiqueta, nota, movimientos y fichas", () => {
    const { container, data, frames } = setup();

    press("Paso siguiente");

    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}, paso 2 de 3` })).toBeInTheDocument();
    expect(note(container)).toHaveTextContent("El 2 bota hacia el aro");
    expect(moves(container)).toEqual(["dribble"]);
    expect(positions(container)).toEqual(placed(data, frames[1]));
    // El 1 ya ha cortado hasta (50, 30) y el balón ha llegado al 2.
    expect(positions(container).a1).toBe("translate(50px, 24.5px)");
    expect(positions(container).ball).not.toBe(placed(data, frames[0]).ball);
    expect(animated(container)).toBe(false);
    // Ni espera ni desplazamiento: no queda nada programado.
    expect(vi.getTimerCount()).toBe(0);
    expect(button("Reiniciar la pizarra")).toBeEnabled();
    expect(button("Paso anterior")).toBeEnabled();
  });

  it("un paso sin nota deja su región vacía, pero en el árbol", () => {
    const { container } = setup();

    press("Paso siguiente");
    press("Paso siguiente");

    expect(screen.getByText("Paso 3 de 3")).toBeInTheDocument();
    expect(moves(container)).toEqual(["screen"]);
    expect(note(container)).toBeEmptyDOMElement();
    expect(note(container)).toHaveAttribute("role", "status");
  });

  it("un movimiento sale de donde está la ficha al empezar su paso, no de donde empezó la pizarra", () => {
    const { container, data, frames } = setup();
    const distance = (a: BoardPoint, b: BoardPoint) => Math.hypot(a.x - b.x, a.y - b.y);

    press("Paso siguiente");
    press("Paso siguiente");

    // El bloqueo del 1 en el tercer paso: sale de (50, 30), adonde cortó, y no de (50, 80).
    const line = container.querySelector("[data-move='screen'] path")?.getAttribute("d") ?? "";
    const [, x, y] = /^M(-?[\d.]+) (-?[\d.]+)/.exec(line) ?? [];
    const start = { x: Number(x), y: Number(y) };

    expect(distance(start, toBox(data.court, frames[2].a1))).toBeLessThan(6);
    expect(distance(start, toBox(data.court, data.tokens[0].at))).toBeGreaterThan(20);
  });

  it("en el último paso, «Paso siguiente» lleva al final: cada ficha donde acaba y sin movimientos", () => {
    const { container, data, frames } = setup();

    press("Paso siguiente");
    press("Paso siguiente");
    press("Paso siguiente");

    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(screen.queryByText(/^Paso \d/)).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}, final` })).toBeInTheDocument();
    expect(moves(container)).toEqual([]);
    expect(note(container)).toBeEmptyDOMElement();
    expect(frames).toHaveLength(4);
    expect(positions(container)).toEqual(placed(data, frames[3]));
    expect(button("Paso siguiente")).toBeDisabled();
    expect(button("Paso anterior")).toBeEnabled();
    expect(button("Reiniciar la pizarra")).toBeEnabled();
    expect(button("Reproducir la pizarra")).toBeEnabled();
  });

  it("«Paso anterior» vuelve atrás, también desde el final", () => {
    const { container, data, frames } = setup();
    press("Paso siguiente");
    press("Paso siguiente");
    press("Paso siguiente");

    press("Paso anterior");

    expect(screen.getByText("Paso 3 de 3")).toBeInTheDocument();
    expect(moves(container)).toEqual(["screen"]);
    expect(positions(container)).toEqual(placed(data, frames[2]));
    expect(button("Paso siguiente")).toBeEnabled();

    press("Paso anterior");
    press("Paso anterior");

    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    expect(note(container)).toHaveTextContent("El 1 pasa al 2 y corta");
    expect(moves(container)).toEqual(["pass", "cut"]);
    expect(positions(container)).toEqual(placed(data, frames[0]));
    expect(button("Paso anterior")).toBeDisabled();
  });

  it("«Reiniciar» vuelve al primer paso", () => {
    const { container, data, frames } = setup();
    press("Paso siguiente");
    press("Paso siguiente");
    press("Paso siguiente");

    press("Reiniciar la pizarra");

    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}, paso 1 de 3` })).toBeInTheDocument();
    expect(moves(container)).toEqual(["pass", "cut"]);
    expect(positions(container)).toEqual(placed(data, frames[0]));
    expect(button("Reiniciar la pizarra")).toBeDisabled();
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
  });

  it("los jugadores y los conos van justo donde dice el fotograma; el balón, pegado a quien lo lleva", () => {
    const { container, data, frames } = setup();
    const now = positions(container);
    const exact = plain(data, frames[0]);

    for (const id of ["a1", "a2", "d1", "c1"]) expect(now[id]).toBe(exact[id]);
    // El balón, que la pizarra guarda junto al 1 en (53, 80), se pinta tocándole por abajo a la
    // derecha: (50, 57) más (3,6 + 1,7)·√½ en cada eje.
    expect(now.ball).not.toBe(exact.ball);
    expect(now.ball).toBe("translate(53.75px, 60.75px)");
  });

  it("tras el pase el balón va pegado a quien lo recibe, y le acompaña cuando bota", () => {
    const { container } = setup();

    press("Paso siguiente");
    // El 2 está en (20, 60): (23, 44) en la caja.
    expect(positions(container).a2).toBe("translate(23px, 44px)");
    expect(positions(container).ball).toBe("translate(26.75px, 47.75px)");

    press("Paso siguiente");
    // Y ha botado hasta (30, 25): (32, 21.25).
    expect(positions(container).a2).toBe("translate(32px, 21.25px)");
    expect(positions(container).ball).toBe("translate(35.75px, 25px)");
  });

  it("un balón suelto, lejos de todos, va donde dice el fotograma", () => {
    const loose = board({
      tokens: [
        { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
        { id: "ball", kind: "ball", at: { x: 20, y: 20 } },
      ],
      steps: [],
    });
    const { container, frames } = setup(loose);

    expect(positions(container)).toEqual(plain(loose, frames[0]));
    expect(positions(container).ball).toBe("translate(23px, 18px)");
  });

  it("las posiciones van al estilo con dos decimales como mucho", () => {
    const { container } = setup(board({ court: "full" }));

    for (const position of Object.values(positions(container))) {
      expect(position).toMatch(/^translate\(\d+(\.\d{1,2})?px, \d+(\.\d{1,2})?px\)$/);
    }
  });

  it("el pase sale de donde se pinta el balón y llega a donde se pintará", () => {
    const { container, data, frames } = setup();
    const ball = data.tokens[3];
    const from = tokenBox(data.court, ball, frames[0], data.tokens);
    const to = tokenBox(data.court, ball, frames[1], data.tokens);
    const expected = movePaths("pass", from, to, 1);
    const unplaced = movePaths("pass", toBox(data.court, frames[0].ball), toBox(data.court, frames[1].ball), 1);

    expect(ball.kind).toBe("ball");
    expect(expected).not.toBeNull();
    expect(drawn(container, "pass")).toEqual([expected?.line, expected?.end]);
    expect(drawn(container, "pass")).not.toEqual([unplaced?.line, unplaced?.end]);

    // Y al avanzar, el balón está justo donde apuntaba el pase.
    press("Paso siguiente");
    expect(positions(container).ball).toBe(translate(to));
  });

  it("los demás movimientos van de donde dice el fotograma a donde dice el paso", () => {
    const { container, data, frames } = setup();
    const cut = movePaths("cut", toBox(data.court, frames[0].a1), toBox(data.court, { x: 50, y: 30 }), 1);

    expect(cut).not.toBeNull();
    expect(drawn(container, "cut")).toEqual([cut?.line, cut?.end]);

    press("Paso siguiente");
    const dribble = movePaths("dribble", toBox(data.court, frames[1].a2), toBox(data.court, { x: 30, y: 25 }), 1);
    expect(drawn(container, "dribble")).toEqual([dribble?.line, dribble?.end]);

    press("Paso siguiente");
    const screenTo = movePaths("screen", toBox(data.court, frames[2].a1), toBox(data.court, { x: 35, y: 30 }), 1);
    expect(drawn(container, "screen")).toEqual([screenTo?.line, screenTo?.end]);
  });

  it("sin reproducir, las fichas no llevan la clase de transición", () => {
    const { container } = setup();

    expect(animated(container)).toBe(false);
    press("Paso siguiente");
    expect(animated(container)).toBe(false);
    press("Paso anterior");
    expect(animated(container)).toBe(false);
  });

  it("no lleva ningún color escrito a mano", () => {
    expect(setup().container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("Board, reproducir", () => {
  it("el botón pasa a «Pausar», las fichas se desplazan tras la espera y después cambia el paso", () => {
    const { container, data, frames } = setup();

    press("Reproducir la pizarra");

    expect(button("Pausar la pizarra")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reproducir la pizarra" })).not.toBeInTheDocument();
    expect(positions(container)).toEqual(placed(data, frames[0]));

    // Justo antes de acabar la espera, cada ficha sigue en su sitio.
    advance(BOARD_HOLD_MS - 1);
    expect(positions(container)).toEqual(placed(data, frames[0]));

    advance(1);
    // Ya apuntan al fotograma siguiente, con la transición puesta; el paso aún es el primero.
    expect(positions(container)).toEqual(placed(data, frames[1]));
    expect(animated(container)).toBe(true);
    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    expect(moves(container)).toEqual(["pass", "cut"]);

    advance(BOARD_MOVE_MS - 1);
    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();

    advance(1);
    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}, paso 2 de 3` })).toBeInTheDocument();
    expect(note(container)).toHaveTextContent("El 2 bota hacia el aro");
    expect(moves(container)).toEqual(["dribble"]);
    expect(positions(container)).toEqual(placed(data, frames[1]));
    expect(button("Pausar la pizarra")).toBeInTheDocument();
  });

  it("la transición de las fichas dura lo que BOARD_MOVE_MS y se quita con «reducir movimiento»", () => {
    const { container } = setup();

    press("Reproducir la pizarra");

    for (const token of tokens(container)) {
      expect(token).toHaveClass(TRANSITION, `duration-${BOARD_MOVE_MS}`, "motion-reduce:transition-none");
    }
  });

  it("reproduce hasta el final, y entonces el botón vuelve a ser «Reproducir»", () => {
    const { container, data, frames } = setup();

    press("Reproducir la pizarra");
    playStep();
    playStep();
    expect(screen.getByText("Paso 3 de 3")).toBeInTheDocument();
    expect(button("Pausar la pizarra")).toBeInTheDocument();
    playStep();

    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}, final` })).toBeInTheDocument();
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar la pizarra" })).not.toBeInTheDocument();
    expect(moves(container)).toEqual([]);
    expect(positions(container)).toEqual(placed(data, frames[3]));
    expect(animated(container)).toBe(false);
    expect(button("Paso siguiente")).toBeDisabled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("nada más llegar al final ya está parada: «Final», «Reproducir» y las regiones anunciándose, sin un tic más", () => {
    const { container } = setup();
    press("Reproducir la pizarra");
    playStep();
    playStep();
    advance(BOARD_HOLD_MS);
    // A falta de un milisegundo para acabar el último desplazamiento, sigue reproduciendo.
    advance(BOARD_MOVE_MS - 1);
    expect(screen.getByText("Paso 3 de 3")).toBeInTheDocument();
    expect(button("Pausar la pizarra")).toBeInTheDocument();
    expect(announced()).toBe(false);
    expect(animated(container)).toBe(true);

    advance(1);

    // En la misma pintura que «Final»: no hay un momento con «Final» y «Pausar» a la vez.
    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pausar la pizarra" })).not.toBeInTheDocument();
    expect(announced()).toBe(true);
    expect(animated(container)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("«Reproducir» desde el final empieza desde el primer paso", () => {
    const { container, data, frames } = setup();
    press("Paso siguiente");
    press("Paso siguiente");
    press("Paso siguiente");
    expect(screen.getByText("Final")).toBeInTheDocument();

    press("Reproducir la pizarra");

    expect(button("Pausar la pizarra")).toBeInTheDocument();
    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    expect(moves(container)).toEqual(["pass", "cut"]);
    expect(positions(container)).toEqual(placed(data, frames[0]));

    playStep();
    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
  });

  it("reproduce desde el paso en el que está, no desde el principio", () => {
    const { container, data, frames } = setup();
    press("Paso siguiente");

    press("Reproducir la pizarra");
    advance(BOARD_HOLD_MS);

    expect(positions(container)).toEqual(placed(data, frames[2]));
    advance(BOARD_MOVE_MS);
    expect(screen.getByText("Paso 3 de 3")).toBeInTheDocument();
  });

  it("«Pausar» a mitad del desplazamiento deja el paso en el que estaba y no avanza más", () => {
    const { container, data, frames } = setup();
    press("Reproducir la pizarra");
    playStep();
    advance(BOARD_HOLD_MS);
    advance(BOARD_MOVE_MS / 2);
    expect(positions(container)).toEqual(placed(data, frames[2]));

    press("Pausar la pizarra");

    expect(button("Reproducir la pizarra")).toBeInTheDocument();
    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
    expect(moves(container)).toEqual(["dribble"]);
    // Las fichas vuelven a donde empieza el paso, de un salto.
    expect(positions(container)).toEqual(placed(data, frames[1]));
    expect(animated(container)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    advance((BOARD_HOLD_MS + BOARD_MOVE_MS) * 5);

    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
    expect(positions(container)).toEqual(placed(data, frames[1]));
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
  });

  it("«Pausar» durante la espera tampoco avanza, y «Reproducir» sigue desde ahí", () => {
    const { container, data, frames } = setup();
    press("Reproducir la pizarra");
    advance(BOARD_HOLD_MS / 2);

    press("Pausar la pizarra");
    advance((BOARD_HOLD_MS + BOARD_MOVE_MS) * 5);

    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    expect(positions(container)).toEqual(placed(data, frames[0]));

    press("Reproducir la pizarra");
    // La espera empieza de nuevo, entera.
    advance(BOARD_HOLD_MS - 1);
    expect(positions(container)).toEqual(placed(data, frames[0]));
    advance(1);
    expect(positions(container)).toEqual(placed(data, frames[1]));
    advance(BOARD_MOVE_MS);
    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
  });

  it("«Paso siguiente» mientras reproduce cambia de paso y para la reproducción", () => {
    const { container, data, frames } = setup();
    press("Reproducir la pizarra");
    advance(BOARD_HOLD_MS);

    press("Paso siguiente");

    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
    expect(positions(container)).toEqual(placed(data, frames[1]));
    expect(animated(container)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    advance((BOARD_HOLD_MS + BOARD_MOVE_MS) * 5);

    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
    expect(positions(container)).toEqual(placed(data, frames[1]));
  });

  it("«Paso anterior» mientras reproduce también para", () => {
    const { container, data, frames } = setup();
    press("Paso siguiente");
    press("Reproducir la pizarra");
    advance(BOARD_HOLD_MS);

    press("Paso anterior");
    advance((BOARD_HOLD_MS + BOARD_MOVE_MS) * 5);

    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
    expect(positions(container)).toEqual(placed(data, frames[0]));
  });

  it("«Reiniciar» está activo mientras reproduce, aun en el primer paso, y para", () => {
    const { container, data, frames } = setup();
    press("Reproducir la pizarra");
    advance(BOARD_HOLD_MS);

    expect(button("Reiniciar la pizarra")).toBeEnabled();
    // Atrás no hay nada: sigue en el primer paso.
    expect(button("Paso anterior")).toBeDisabled();

    press("Reiniciar la pizarra");
    advance((BOARD_HOLD_MS + BOARD_MOVE_MS) * 5);

    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
    expect(button("Reiniciar la pizarra")).toBeDisabled();
    expect(positions(container)).toEqual(placed(data, frames[0]));
    expect(animated(container)).toBe(false);
  });

  it("«Reiniciar» a media reproducción de un paso posterior vuelve al primero y para", () => {
    setup();
    press("Reproducir la pizarra");
    playStep();
    advance(BOARD_HOLD_MS);

    press("Reiniciar la pizarra");
    advance((BOARD_HOLD_MS + BOARD_MOVE_MS) * 5);

    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
  });
});

describe("Board, con «reducir movimiento»", () => {
  it("tras la espera pasa al paso siguiente sin esperar a un desplazamiento que no se ve", () => {
    const matchMedia = stubMotion(true);
    const { container, data, frames } = setup();

    press("Reproducir la pizarra");
    advance(BOARD_HOLD_MS);

    expect(positions(container)).toEqual(placed(data, frames[1]));
    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();

    advance(0);

    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
    expect(moves(container)).toEqual(["dribble"]);
    expect(matchMedia).toHaveBeenCalledWith(REDUCE);
  });

  it("reproduce entera en lo que duran las esperas", () => {
    stubMotion(true);
    setup();

    press("Reproducir la pizarra");
    for (let step = 0; step < 3; step += 1) {
      advance(BOARD_HOLD_MS);
      advance(0);
    }

    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
    expect(announced()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("si el dispositivo no lo pide, espera el desplazamiento entero", () => {
    stubMotion(false);
    setup();

    press("Reproducir la pizarra");
    advance(BOARD_HOLD_MS);
    advance(0);

    expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();

    advance(BOARD_MOVE_MS);

    expect(screen.getByText("Paso 2 de 3")).toBeInTheDocument();
  });
});

describe("Board, al desmontar", () => {
  it.each([
    ["durante la espera", BOARD_HOLD_MS / 2, 0],
    ["durante el desplazamiento", BOARD_HOLD_MS, BOARD_MOVE_MS / 2],
  ])("a media reproducción, %s, no deja temporizadores vivos ni avisos", (_name, hold, move) => {
    const { unmount } = setup();
    press("Reproducir la pizarra");
    advance(hold);
    if (move > 0) advance(move);
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    advance((BOARD_HOLD_MS + BOARD_MOVE_MS) * 5);
    expect(errors).not.toHaveBeenCalled();
  });

  it("recién llegada al final ya no queda nada programado, y desmontar tampoco avisa", () => {
    const { unmount } = setup();
    press("Reproducir la pizarra");
    playStep();
    playStep();
    playStep();
    expect(screen.getByText("Final")).toBeInTheDocument();
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    advance(BOARD_HOLD_MS + BOARD_MOVE_MS);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("Board, regiones de estado", () => {
  it("el paso y la nota son dos regiones de estado, y paradas se anuncian", () => {
    const { container } = setup();
    const regions = screen.getAllByRole("status");

    expect(regions).toHaveLength(2);
    expect(regions[0]).toHaveTextContent("Paso 1 de 3");
    expect(regions[1]).toBe(note(container));
    for (const region of regions) expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("mientras reproduce no se anuncian, y al pausar vuelven a hacerlo", () => {
    setup();

    press("Reproducir la pizarra");
    for (const region of screen.getAllByRole("status")) expect(region).toHaveAttribute("aria-live", "off");

    advance(BOARD_HOLD_MS);
    for (const region of screen.getAllByRole("status")) expect(region).toHaveAttribute("aria-live", "off");

    press("Pausar la pizarra");
    for (const region of screen.getAllByRole("status")) expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("al acabar de reproducir vuelven a anunciarse", () => {
    setup();

    press("Reproducir la pizarra");
    playStep();
    playStep();
    expect(announced()).toBe(false);
    playStep();

    // «Final» llega con las regiones ya activas: es lo que permite que se anuncie.
    expect(screen.getByText("Final")).toBeInTheDocument();
    for (const region of screen.getAllByRole("status")) expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("la de la nota está siempre en el árbol, también vacía", () => {
    const { container } = setup();
    const region = note(container);

    press("Paso siguiente");
    press("Paso siguiente");
    expect(note(container)).toBe(region);
    expect(region).toBeEmptyDOMElement();

    press("Paso siguiente");
    expect(note(container)).toBe(region);
    expect(region).toBeEmptyDOMElement();

    press("Reiniciar la pizarra");
    expect(note(container)).toBe(region);
    expect(region).toHaveTextContent("El 1 pasa al 2 y corta");
  });
});

describe("Board, la caja", () => {
  it("la media pista va en 4:3, con su viewBox", () => {
    setup(board({ court: "half" }));
    const svg = screen.getByRole("img");

    expect(svg).toHaveClass("aspect-4/3", "w-full");
    expect(svg).not.toHaveClass("aspect-25/14");
    expect(svg).toHaveAttribute("viewBox", BOARD_VIEW.half.viewBox);
  });

  it("la pista completa va apaisada, en 25:14, con su viewBox", () => {
    const { container, data, frames } = setup(board({ court: "full" }));
    const svg = screen.getByRole("img");

    expect(svg).toHaveClass("aspect-25/14", "w-full");
    expect(svg).not.toHaveClass("aspect-4/3");
    expect(svg).toHaveAttribute("viewBox", BOARD_VIEW.full.viewBox);
    expect(positions(container)).toEqual(placed(data, frames[0]));
    // (50, 80) en pista completa: a lo largo, 3 + 80·0,94; a lo ancho, 3 + (100 − 50)·0,5.
    expect(positions(container).a1).toBe("translate(78.2px, 28px)");
    // El balón, pegado al 1 a la escala de la pista completa: (3,6 + 1,7)·0,62·√½ en cada eje.
    expect(positions(container).ball).toBe("translate(80.52px, 30.32px)");
  });

  it("el dibujo no recibe el foco", () => {
    setup();

    expect(screen.getByRole("img")).toHaveAttribute("focusable", "false");
  });
});
