import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { BALL_REACH } from "@/modules/board/limits";
import type { Board, BoardFrame, BoardMoveKind, BoardPoint, BoardToken } from "@/modules/board/types";
import {
  BOARD_VIEW,
  CourtLines,
  MoveMark,
  TokenMark,
  boardScale,
  fromBox,
  movePaths,
  toBox,
  tokenBox,
} from "./board-drawing";

type Court = Board["court"];

const COURTS: Court[] = ["half", "full"];
const KINDS: BoardMoveKind[] = ["cut", "dribble", "pass", "screen"];

/** El ancho y el alto de la caja de una pista, leídos de su `viewBox`. */
function boxSize(court: Court): { width: number; height: number } {
  const [, , width, height] = BOARD_VIEW[court].viewBox.split(" ").map(Number);
  return { width, height };
}

/** Los puntos de un trazo hecho solo de `M` y `L`, en orden. */
function points(d: string): BoardPoint[] {
  return Array.from(d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g), ([, x, y]) => ({ x: Number(x), y: Number(y) }));
}

function distance(a: BoardPoint, b: BoardPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function last<T>(items: T[]): T {
  const item = items.at(-1);
  if (item === undefined) throw new Error("La lista está vacía");
  return item;
}

/** Un trazo que no es `null`: si lo es, el test falla aquí, con un mensaje que lo dice. */
function paths(kind: BoardMoveKind, from: BoardPoint, to: BoardPoint, scale = 1): { line: string; end: string } {
  const result = movePaths(kind, from, to, scale);
  if (!result) throw new Error(`movePaths no ha dado trazo para «${kind}»`);
  return result;
}

/** Pinta dentro de un `<svg>`, que es donde viven estas piezas, y lo devuelve. */
function draw(children: ReactNode): SVGSVGElement {
  const { container } = render(<svg>{children}</svg>);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("No se ha pintado ningún <svg>");
  return svg;
}

function token(kind: BoardToken["kind"], label?: string): BoardToken {
  return label === undefined ? { id: "t1", kind, at: { x: 50, y: 50 } } : { id: "t1", kind, label, at: { x: 50, y: 50 } };
}

describe("BOARD_VIEW", () => {
  it("la media pista va en 4:3 y la completa, apaisada", () => {
    expect(BOARD_VIEW.half).toEqual({ viewBox: "0 0 100 75", aspect: "aspect-4/3" });
    expect(BOARD_VIEW.full).toEqual({ viewBox: "0 0 100 56", aspect: "aspect-25/14" });
  });

  it("la proporción de cada caja es la de su viewBox", () => {
    for (const court of COURTS) {
      const { width, height } = boxSize(court);
      const [, w, h] = /^aspect-(\d+)\/(\d+)$/.exec(BOARD_VIEW[court].aspect) ?? [];

      expect(Number(w) / Number(h)).toBeCloseTo(width / height, 5);
    }
  });
});

describe("toBox", () => {
  it("media pista: las esquinas de la pista caen en las del dibujo, con el aro arriba", () => {
    expect(toBox("half", { x: 0, y: 0 })).toEqual({ x: 5, y: 5 });
    expect(toBox("half", { x: 100, y: 100 })).toEqual({ x: 95, y: 70 });
    expect(toBox("half", { x: 50, y: 0 })).toEqual({ x: 50, y: 5 });
  });

  it("pista completa: el aro de ataque (y = 0) queda a la izquierda y el otro, a la derecha", () => {
    expect(toBox("full", { x: 50, y: 0 }).x).toBe(3);
    expect(toBox("full", { x: 50, y: 100 }).x).toBe(97);
    // Lo largo de la pista no depende de la banda.
    expect(toBox("full", { x: 0, y: 40 }).x).toBe(toBox("full", { x: 100, y: 40 }).x);
  });

  it("pista completa: la banda derecha (x = 100) queda arriba y la izquierda, abajo", () => {
    expect(toBox("full", { x: 100, y: 50 }).y).toBe(3);
    expect(toBox("full", { x: 0, y: 50 }).y).toBe(53);
    expect(toBox("full", { x: 50, y: 0 }).y).toBe(28);
  });

  it.each(COURTS)("%s: cualquier punto de la pista cae dentro del viewBox", (court) => {
    const { width, height } = boxSize(court);

    for (let x = 0; x <= 100; x += 10) {
      for (let y = 0; y <= 100; y += 10) {
        const at = toBox(court, { x, y });

        expect(at.x).toBeGreaterThanOrEqual(0);
        expect(at.x).toBeLessThanOrEqual(width);
        expect(at.y).toBeGreaterThanOrEqual(0);
        expect(at.y).toBeLessThanOrEqual(height);
      }
    }
  });

  it.each(COURTS)("%s: no cambia el punto que recibe", (court) => {
    const point = { x: 30, y: 70 };

    toBox(court, point);

    expect(point).toEqual({ x: 30, y: 70 });
  });
});

describe("fromBox", () => {
  it.each(COURTS)("%s: deshace toBox en cualquier punto entero de la pista", (court) => {
    for (let x = 0; x <= 100; x += 1) {
      for (let y = 0; y <= 100; y += 1) {
        // `toStrictEqual` no deja pasar un -0 por un 0.
        expect(fromBox(court, toBox(court, { x, y }))).toStrictEqual({ x, y });
      }
    }
  });

  it("media pista: las esquinas del dibujo son las de la pista, con el aro arriba", () => {
    expect(fromBox("half", { x: 5, y: 5 })).toEqual({ x: 0, y: 0 });
    expect(fromBox("half", { x: 95, y: 5 })).toEqual({ x: 100, y: 0 });
    expect(fromBox("half", { x: 5, y: 70 })).toEqual({ x: 0, y: 100 });
    expect(fromBox("half", { x: 95, y: 70 })).toEqual({ x: 100, y: 100 });
    expect(fromBox("half", { x: 50, y: 37.5 })).toEqual({ x: 50, y: 50 });
  });

  it("pista completa: a la izquierda está el aro de ataque (y = 0) y arriba, la banda derecha (x = 100)", () => {
    expect(fromBox("full", { x: 3, y: 3 })).toEqual({ x: 100, y: 0 });
    expect(fromBox("full", { x: 3, y: 53 })).toEqual({ x: 0, y: 0 });
    expect(fromBox("full", { x: 97, y: 3 })).toEqual({ x: 100, y: 100 });
    expect(fromBox("full", { x: 97, y: 53 })).toEqual({ x: 0, y: 100 });
    expect(fromBox("full", { x: 50, y: 28 })).toEqual({ x: 50, y: 50 });
  });

  it.each(COURTS)("%s: redondea a enteros: un toque entre dos unidades cae en la más cercana", (court) => {
    const { width, height } = boxSize(court);

    for (let x = 0; x <= width; x += 0.37) {
      for (let y = 0; y <= height; y += 0.41) {
        const at = fromBox(court, { x, y });

        expect(Number.isInteger(at.x)).toBe(true);
        expect(Number.isInteger(at.y)).toBe(true);
      }
    }
    // Un pelo a cada lado de un punto de la pista sigue siendo ese punto; a media unidad, ya no.
    const exact = toBox(court, { x: 40, y: 60 });
    expect(fromBox(court, { x: exact.x + 0.2, y: exact.y - 0.2 })).toEqual({ x: 40, y: 60 });
    expect(fromBox(court, { x: exact.x + 0.2, y: exact.y + 0.2 })).toEqual({ x: 40, y: 60 });
    expect(fromBox(court, { x: exact.x + 2, y: exact.y + 2 })).not.toEqual({ x: 40, y: 60 });
  });

  it.each(COURTS)("%s: cualquier punto de la caja cae dentro de la pista, de 0 a 100", (court) => {
    const { width, height } = boxSize(court);

    for (let x = 0; x <= width; x += 2.5) {
      for (let y = 0; y <= height; y += 2.5) {
        const at = fromBox(court, { x, y });

        expect(at.x).toBeGreaterThanOrEqual(0);
        expect(at.x).toBeLessThanOrEqual(100);
        expect(at.y).toBeGreaterThanOrEqual(0);
        expect(at.y).toBeLessThanOrEqual(100);
      }
    }
  });

  it("media pista: un toque en el margen de la caja cae en el borde de la pista, nunca fuera", () => {
    // La pista ocupa de 5 a 95 a lo ancho y de 5 a 70 a lo alto de una caja de 100 × 75.
    expect(fromBox("half", { x: 0, y: 0 })).toStrictEqual({ x: 0, y: 0 });
    expect(fromBox("half", { x: 100, y: 75 })).toStrictEqual({ x: 100, y: 100 });
    expect(fromBox("half", { x: 2, y: 37.5 })).toStrictEqual({ x: 0, y: 50 });
    expect(fromBox("half", { x: 98, y: 37.5 })).toStrictEqual({ x: 100, y: 50 });
    expect(fromBox("half", { x: 50, y: 1 })).toStrictEqual({ x: 50, y: 0 });
    expect(fromBox("half", { x: 50, y: 74 })).toStrictEqual({ x: 50, y: 100 });
  });

  it("pista completa: lo mismo, con sus márgenes de 3", () => {
    expect(fromBox("full", { x: 0, y: 0 })).toStrictEqual({ x: 100, y: 0 });
    expect(fromBox("full", { x: 100, y: 56 })).toStrictEqual({ x: 0, y: 100 });
    expect(fromBox("full", { x: 1, y: 28 })).toStrictEqual({ x: 50, y: 0 });
    expect(fromBox("full", { x: 99, y: 28 })).toStrictEqual({ x: 50, y: 100 });
    expect(fromBox("full", { x: 50, y: 1 })).toStrictEqual({ x: 100, y: 50 });
    expect(fromBox("full", { x: 50, y: 55 })).toStrictEqual({ x: 0, y: 50 });
  });

  it.each(COURTS)("%s: un punto muy fuera de la caja (el dedo sale de la pista al arrastrar) también se acota", (court) => {
    expect(fromBox(court, { x: -500, y: -500 })).toStrictEqual(fromBox(court, { x: 0, y: 0 }));
    expect(fromBox(court, { x: 900, y: 900 })).toStrictEqual(
      fromBox(court, { x: boxSize(court).width, y: boxSize(court).height }),
    );
  });

  it.each(COURTS)("%s: lo que devuelve vuelve a caer en su sitio del dibujo", (court) => {
    // Ida y vuelta desde la caja: tocar donde está pintada una ficha da su punto.
    for (const point of [
      { x: 0, y: 0 },
      { x: 13, y: 87 },
      { x: 50, y: 50 },
      { x: 99, y: 1 },
      { x: 100, y: 100 },
    ]) {
      const again = toBox(court, fromBox(court, toBox(court, point)));

      expect(again.x).toBeCloseTo(toBox(court, point).x, 10);
      expect(again.y).toBeCloseTo(toBox(court, point).y, 10);
    }
  });

  it.each(COURTS)("%s: no cambia el punto que recibe", (court) => {
    const point = { x: 30.4, y: 20.6 };

    fromBox(court, point);

    expect(point).toEqual({ x: 30.4, y: 20.6 });
  });
});

describe("tokenBox", () => {
  const a1: BoardToken = { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } };
  const d1: BoardToken = { id: "d1", kind: "defender", label: "1", at: { x: 20, y: 30 } };
  const c1: BoardToken = { id: "c1", kind: "cone", at: { x: 80, y: 40 } };
  const ball: BoardToken = { id: "ball", kind: "ball", at: { x: 53, y: 80 } };
  const all = [a1, d1, c1, ball];
  /** Lo que se aparta del centro de su jugador, en cada eje, el balón que lleva (media pista). */
  const REACH = (3.6 + 1.7) * Math.SQRT1_2;

  /** El fotograma en el que cada ficha está donde empieza, con lo que se le cambie. */
  function frame(overrides: BoardFrame = {}): BoardFrame {
    return { ...Object.fromEntries(all.map((item) => [item.id, { ...item.at }])), ...overrides };
  }

  it("con dos jugadores al alcance, el balón es del más cercano, esté donde esté en la lista", () => {
    // El defensor va antes en la lista y está a menos de 6 del balón, pero el atacante está a 3.
    const marker: BoardToken = { id: "d9", kind: "defender", label: "9", at: { x: 50, y: 75 } };
    const tokens = [marker, a1, ball];
    const at = { d9: { x: 50, y: 75 }, a1: { x: 50, y: 80 }, ball: { x: 53, y: 80 } };
    const holder = toBox("half", at.a1);

    expect(tokenBox("half", ball, at, tokens)).toEqual({ x: holder.x + REACH, y: holder.y + REACH });
    expect(tokenBox("half", ball, at, [a1, marker, ball])).toEqual({ x: holder.x + REACH, y: holder.y + REACH });
  });

  /** El radio con el que se pinta un atacante o el balón en una pista. */
  function radius(court: Court, kind: "attacker" | "ball"): number {
    const svg = draw(<TokenMark token={token(kind)} court={court} labels />);
    return Number(svg.querySelector("circle")?.getAttribute("r"));
  }

  it.each(COURTS)("%s: un atacante y un defensor van donde dice el fotograma", (court) => {
    const now = frame({ a1: { x: 10, y: 20 }, d1: { x: 90, y: 60 } });

    expect(tokenBox(court, a1, now, all)).toEqual(toBox(court, { x: 10, y: 20 }));
    expect(tokenBox(court, d1, now, all)).toEqual(toBox(court, { x: 90, y: 60 }));
  });

  it.each(COURTS)("%s: un cono va donde dice el fotograma, aunque tenga un jugador al lado", (court) => {
    const now = frame({ a1: { x: 79, y: 40 } });

    expect(tokenBox(court, c1, now, all)).toEqual(toBox(court, c1.at));
  });

  it("media pista: el balón que lleva un jugador se pinta pegado a él, abajo a la derecha", () => {
    const center = toBox("half", a1.at);
    const at = tokenBox("half", ball, frame(), all);

    expect(at.x).toBeCloseTo(center.x + REACH, 10);
    expect(at.y).toBeCloseTo(center.y + REACH, 10);
    // No donde dice la pizarra: ahí taparía la etiqueta del jugador.
    expect(at).not.toEqual(toBox("half", ball.at));
  });

  it("pista completa: lo mismo, a la escala de sus marcas", () => {
    const center = toBox("full", a1.at);
    const at = tokenBox("full", ball, frame(), all);

    expect(at.x).toBeCloseTo(center.x + REACH * boardScale("full"), 10);
    expect(at.y).toBeCloseTo(center.y + REACH * boardScale("full"), 10);
  });

  it.each(COURTS)("%s: pegado quiere decir tocando: a un radio del jugador más uno del balón", (court) => {
    const center = toBox(court, a1.at);
    const at = tokenBox(court, ball, frame(), all);
    const apart = Math.hypot(at.x - center.x, at.y - center.y);

    expect(apart).toBeCloseTo(radius(court, "attacker") + radius(court, "ball"), 5);
    // En diagonal: lo mismo en los dos ejes, hacia abajo y a la derecha.
    expect(at.x - center.x).toBeCloseTo(at.y - center.y, 10);
    expect(at.x).toBeGreaterThan(center.x);
    expect(at.y).toBeGreaterThan(center.y);
  });

  it("también se pega a un defensor", () => {
    const center = toBox("half", d1.at);
    const at = tokenBox("half", ball, frame({ ball: { x: 22, y: 31 } }), all);

    expect(at.x).toBeCloseTo(center.x + REACH, 10);
    expect(at.y).toBeCloseTo(center.y + REACH, 10);
  });

  it.each(COURTS)("%s: un balón suelto, lejos de todos, va donde dice el fotograma", (court) => {
    const now = frame({ ball: { x: 50, y: 50 } });

    expect(tokenBox(court, ball, now, all)).toEqual(toBox(court, { x: 50, y: 50 }));
  });

  it("el alcance es BALL_REACH: justo a esa distancia va pegado y una unidad más allá, suelto", () => {
    const edge = frame({ ball: { x: a1.at.x + BALL_REACH, y: a1.at.y } });
    const beyond = frame({ ball: { x: a1.at.x + BALL_REACH + 1, y: a1.at.y } });

    expect(tokenBox("half", ball, edge, all)).toEqual(tokenBox("half", ball, frame(), all));
    expect(tokenBox("half", ball, beyond, all)).toEqual(toBox("half", beyond.ball));
  });

  it("un cono cerca del balón no lo lleva", () => {
    const now = frame({ ball: { x: 81, y: 41 } });

    expect(tokenBox("half", ball, now, all)).toEqual(toBox("half", { x: 81, y: 41 }));
  });

  it("manda el fotograma, no donde empezó cada ficha", () => {
    // El 1 se ha ido: el balón, que no se ha movido, ya no es suyo.
    const left = frame({ a1: { x: 50, y: 30 } });
    // El balón ha llegado al defensor, lejos de donde empezó.
    const arrived = tokenBox("half", ball, frame({ ball: { x: 23, y: 30 } }), all);
    const receiver = toBox("half", d1.at);

    expect(tokenBox("half", ball, left, all)).toEqual(toBox("half", ball.at));
    expect(arrived.x).toBeCloseTo(receiver.x + REACH, 10);
    expect(arrived.y).toBeCloseTo(receiver.y + REACH, 10);
  });

  it("una ficha que no está en el fotograma va donde empieza (token.at)", () => {
    expect(tokenBox("half", a1, {}, all)).toEqual(toBox("half", a1.at));
    expect(tokenBox("half", c1, {}, all)).toEqual(toBox("half", c1.at));
    expect(tokenBox("full", d1, { a1: { x: 1, y: 1 } }, all)).toEqual(toBox("full", d1.at));
  });

  it("un balón que no está en el fotograma también, y se pega a quien tenga al lado", () => {
    // Ni el balón ni el jugador están: los dos cuentan desde donde empiezan.
    expect(tokenBox("half", ball, {}, all)).toEqual(tokenBox("half", ball, frame(), all));
    // El jugador sí está, y lejos: el balón se queda suelto donde empieza.
    expect(tokenBox("half", ball, { a1: { x: 10, y: 10 } }, all)).toEqual(toBox("half", ball.at));
  });

  it.each(COURTS)("%s: pegado a un jugador en una esquina, sigue dentro del viewBox", (court) => {
    const { width, height } = boxSize(court);
    const corners = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];

    for (const corner of corners) {
      const at = tokenBox(court, ball, frame({ a1: corner, ball: corner }), all);

      expect(at).not.toEqual(toBox(court, corner));
      expect(at.x).toBeGreaterThanOrEqual(0);
      expect(at.x).toBeLessThanOrEqual(width);
      expect(at.y).toBeGreaterThanOrEqual(0);
      expect(at.y).toBeLessThanOrEqual(height);
    }
  });

  it("no cambia ni el fotograma ni las fichas que recibe", () => {
    const now = frame();
    const copy = structuredClone({ now, all });

    tokenBox("half", ball, now, all);
    tokenBox("full", a1, now, all);

    expect({ now, all }).toEqual(copy);
  });
});

describe("movePaths", () => {
  const from = { x: 20, y: 20 };
  const to = { x: 60, y: 50 };

  it.each(KINDS)("%s: no hay trazo si los dos puntos casi coinciden", (kind) => {
    expect(movePaths(kind, from, from, 1)).toBeNull();
    expect(movePaths(kind, from, { x: 22, y: 21 }, 1)).toBeNull();
  });

  it.each(KINDS)("%s: la línea empieza separada del origen y acaba cerca del destino", (kind) => {
    const line = points(paths(kind, from, to).line);

    // Separada del origen lo que mide una ficha, para no pisarla.
    expect(distance(line[0], from)).toBeGreaterThan(3.6);
    expect(distance(line[0], from)).toBeLessThan(6);
    expect(distance(last(line), to)).toBeLessThan(3);
    // Y va del origen al destino, no al revés.
    expect(distance(line[0], from)).toBeLessThan(distance(line[0], to));
  });

  it("el corte es una recta: dos puntos sobre la línea que une origen y destino", () => {
    const line = points(paths("cut", from, to).line);

    expect(line).toHaveLength(2);
    for (const point of line) {
      // Sobre la recta de (20,20) a (60,50): el producto cruzado es cero.
      const cross = (point.x - from.x) * (to.y - from.y) - (point.y - from.y) * (to.x - from.x);
      expect(cross / distance(from, to)).toBeCloseTo(0, 1);
    }
  });

  it("el bote es una onda: tiene más tramos que el corte y acaba en el mismo punto", () => {
    const cut = points(paths("cut", from, to).line);
    const dribble = points(paths("dribble", from, to).line);

    expect(dribble.length).toBeGreaterThan(cut.length);
    expect(dribble[0]).toEqual(cut[0]);
    expect(last(dribble)).toEqual(last(cut));
  });

  it("la onda del bote se sale a un lado y al otro del trazo, y no pasa del remate", () => {
    const dribble = points(paths("dribble", from, to).line);
    const length = distance(from, to);
    const sides = dribble.map(
      (point) => ((point.x - from.x) * (to.y - from.y) - (point.y - from.y) * (to.x - from.x)) / length,
    );
    const along = dribble.map(
      (point) => ((point.x - from.x) * (to.x - from.x) + (point.y - from.y) * (to.y - from.y)) / length,
    );

    expect(Math.max(...sides)).toBeGreaterThan(0.5);
    expect(Math.min(...sides)).toBeLessThan(-0.5);
    // Avanza siempre hacia el destino y no lo rebasa.
    expect(along).toEqual([...along].sort((a, b) => a - b));
    expect(Math.max(...along)).toBeLessThanOrEqual(along[along.length - 1]);
  });

  it("un bote corto no rebasa su remate", () => {
    const line = points(paths("dribble", { x: 10, y: 10 }, { x: 16.5, y: 10 }).line);

    expect(Math.max(...line.map((point) => point.x))).toBeLessThanOrEqual(last(line).x);
  });

  it.each([
    ["media pista", 1, [6.5, 7, 7.5, 8, 8.5, 9, 10, 11, 12, 14]],
    ["pista completa", 0.8, [5.4, 5.8, 6.2, 6.6, 7, 8, 9, 10]],
  ])("%s: el bote, corto o largo, avanza siempre hacia el destino y acaba en su remate", (_name, scale, lengths) => {
    for (const length of lengths) {
      const xs = points(paths("dribble", { x: 10, y: 10 }, { x: 10 + length, y: 10 }, scale).line).map(
        (point) => point.x,
      );

      expect(xs).toEqual([...xs].sort((a, b) => a - b));
      expect(last(xs)).toBeLessThan(10 + length);
    }
  });

  it("un bote en el que no cabe una onda es una recta, como el corte", () => {
    const from = { x: 10, y: 10 };
    const to = { x: 17, y: 10 };

    expect(paths("dribble", from, to).line).toBe(paths("cut", from, to).line);
    expect(paths("dribble", from, to).end).toBe(paths("cut", from, to).end);
  });

  it("el corte, el bote y el pase acaban en punta: tres puntos con el del medio en el final de la línea", () => {
    for (const kind of ["cut", "dribble", "pass"] as const) {
      const { line, end } = paths(kind, from, to);
      const head = points(end);

      expect(head).toHaveLength(3);
      expect(head[1]).toEqual(last(points(line)));
      // Las dos alas quedan por detrás de la punta, a la misma distancia.
      expect(distance(head[0], head[1])).toBeCloseTo(distance(head[2], head[1]), 1);
      expect(distance(head[0], to)).toBeGreaterThan(distance(head[1], to));
    }
  });

  it("el bloqueo acaba en una barra perpendicular, no en punta", () => {
    const { line, end } = paths("screen", from, to);
    const bar = points(end);
    const tip = last(points(line));

    expect(bar).toHaveLength(2);
    // Los dos extremos de la barra, a la misma distancia del final y con el final en medio.
    expect(distance(bar[0], tip)).toBeCloseTo(distance(bar[1], tip), 1);
    expect(distance(bar[0], tip)).toBeGreaterThan(1);
    expect((bar[0].x + bar[1].x) / 2).toBeCloseTo(tip.x, 1);
    expect((bar[0].y + bar[1].y) / 2).toBeCloseTo(tip.y, 1);
    // Perpendicular al trazo: el producto escalar con su dirección es cero.
    const dot = (bar[1].x - bar[0].x) * (to.x - from.x) + (bar[1].y - bar[0].y) * (to.y - from.y);
    expect(dot / distance(from, to)).toBeCloseTo(0, 1);
  });

  it("el pase acaba un poco antes que el corte: el balón no llega hasta el centro del jugador", () => {
    const cut = last(points(paths("cut", from, to).line));
    const pass = last(points(paths("pass", from, to).line));

    expect(distance(pass, to)).toBeGreaterThan(distance(cut, to));
    expect(distance(pass, to) - distance(cut, to)).toBeLessThan(3);
  });

  it("a menor escala, los huecos y el remate encogen", () => {
    const big = paths("cut", from, to, 1);
    const small = paths("cut", from, to, 0.5);
    const head = (d: string) => distance(points(d)[0], points(d)[2]);

    expect(distance(points(small.line)[0], from)).toBeLessThan(distance(points(big.line)[0], from));
    expect(head(small.end)).toBeLessThan(head(big.end));
  });

  it("vale en cualquier dirección: también hacia atrás y en vertical", () => {
    for (const target of [{ x: 20, y: 60 }, { x: 0, y: 20 }, { x: 5, y: 5 }]) {
      const line = points(paths("cut", from, target).line);

      expect(distance(last(line), target)).toBeLessThan(3);
      expect(paths("cut", from, target).end).not.toContain("NaN");
    }
  });
});

describe("CourtLines", () => {
  it.each(COURTS)("%s: pinta las líneas en ink-3, sin relleno y sin engordar con la caja", (court) => {
    const svg = draw(<CourtLines court={court} />);
    const group = svg.querySelector("g");
    const shapes = Array.from(svg.querySelectorAll("rect, circle, path"));

    expect(group).toHaveClass("stroke-ink-3");
    expect(group).toHaveAttribute("fill", "none");
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) expect(shape).toHaveAttribute("vector-effect", "non-scaling-stroke");
  });

  it.each(COURTS)("%s: no lleva ningún color escrito a mano", (court) => {
    expect(draw(<CourtLines court={court} />).outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it.each(COURTS)("%s: el contorno de la pista es el que da toBox y cabe en el viewBox", (court) => {
    const svg = draw(<CourtLines court={court} />);
    const outline = svg.querySelector("rect");
    const { width, height } = boxSize(court);
    const corners = [toBox(court, { x: 0, y: 0 }), toBox(court, { x: 100, y: 100 })];
    const left = Math.min(...corners.map((corner) => corner.x));
    const top = Math.min(...corners.map((corner) => corner.y));
    const right = Math.max(...corners.map((corner) => corner.x));
    const bottom = Math.max(...corners.map((corner) => corner.y));

    expect(Number(outline?.getAttribute("x"))).toBe(left);
    expect(Number(outline?.getAttribute("y"))).toBe(top);
    expect(Number(outline?.getAttribute("width"))).toBe(right - left);
    expect(Number(outline?.getAttribute("height"))).toBe(bottom - top);
    expect(right).toBeLessThanOrEqual(width);
    expect(bottom).toBeLessThanOrEqual(height);
  });

  /** Los aros: los círculos más pequeños del dibujo. */
  function hoops(svg: SVGSVGElement): { cx: number; cy: number }[] {
    const circles = Array.from(svg.querySelectorAll("circle"), (circle) => ({
      cx: Number(circle.getAttribute("cx")),
      cy: Number(circle.getAttribute("cy")),
      r: Number(circle.getAttribute("r")),
    }));
    const smallest = Math.min(...circles.map((circle) => circle.r));
    return circles.filter((circle) => circle.r === smallest).map(({ cx, cy }) => ({ cx, cy }));
  }

  it("la media pista tiene un aro, arriba y centrado", () => {
    const [hoop, ...others] = hoops(draw(<CourtLines court="half" />));

    expect(others).toHaveLength(0);
    expect(hoop.cx).toBe(toBox("half", { x: 50, y: 0 }).x);
    expect(hoop.cy).toBeLessThan(boxSize("half").height / 4);
  });

  it("la pista completa tiene dos aros, uno a cada lado, con el de ataque a la izquierda", () => {
    const found = hoops(draw(<CourtLines court="full" />)).sort((a, b) => a.cx - b.cx);
    const attack = toBox("full", { x: 50, y: 0 });
    const other = toBox("full", { x: 50, y: 100 });

    expect(found).toHaveLength(2);
    // Los dos sobre el eje largo de la pista, cada uno pegado a su línea de fondo.
    expect(found[0].cy).toBe(attack.y);
    expect(found[1].cy).toBe(other.y);
    expect(found[0].cx - attack.x).toBeGreaterThan(0);
    expect(found[0].cx - attack.x).toBeLessThan(10);
    expect(other.x - found[1].cx).toBeCloseTo(found[0].cx - attack.x, 5);
  });
});

describe("TokenMark", () => {
  it("un atacante es un círculo en ink con su etiqueta dentro", () => {
    const svg = draw(<TokenMark token={token("attacker", "1")} court="half" labels />);
    const text = svg.querySelector("text");

    expect(svg.querySelectorAll("circle")).toHaveLength(1);
    expect(svg.querySelector("circle")).toHaveClass("stroke-ink");
    expect(svg.querySelector("path")).toBeNull();
    expect(text).toHaveTextContent("1");
    expect(text).toHaveAttribute("text-anchor", "middle");
    expect(text).toHaveClass("fill-ink");
  });

  it("un defensor es una X en brand-accent con su etiqueta al lado", () => {
    const svg = draw(<TokenMark token={token("defender", "5")} court="half" labels />);
    const cross = svg.querySelector("path");
    const text = svg.querySelector("text");

    expect(svg.querySelector("circle")).toBeNull();
    expect(cross).toHaveClass("stroke-brand-accent");
    // Dos aspas: dos trazos que se cruzan en el origen.
    expect(cross?.getAttribute("d")?.match(/M/g)).toHaveLength(2);
    expect(text).toHaveTextContent("5");
    expect(text).toHaveClass("fill-brand-accent");
    expect(Number(text?.getAttribute("x"))).toBeGreaterThan(0);
  });

  it("el balón es un círculo relleno en ink, sin texto", () => {
    const svg = draw(<TokenMark token={token("ball")} court="half" labels />);

    expect(svg.querySelectorAll("circle")).toHaveLength(1);
    expect(svg.querySelector("circle")).toHaveClass("fill-ink");
    expect(svg.querySelector("text")).toBeNull();
  });

  it("un cono es un triángulo en ink-3, sin texto", () => {
    const svg = draw(<TokenMark token={token("cone")} court="half" labels />);
    const triangle = svg.querySelector("path");

    expect(svg.querySelector("circle")).toBeNull();
    expect(triangle).toHaveClass("stroke-ink-3");
    expect(triangle).toHaveAttribute("fill", "none");
    // Tres vértices y cerrado.
    expect(triangle?.getAttribute("d")).toMatch(/^M[^MLHZ]+L[^MLHZ]+H[^MLHZ]+Z$/);
    expect(svg.querySelector("text")).toBeNull();
  });

  it("el balón y el cono no llevan texto aunque traigan etiqueta", () => {
    for (const kind of ["ball", "cone"] as const) {
      expect(draw(<TokenMark token={token(kind, "9")} court="half" labels />).querySelector("text")).toBeNull();
    }
  });

  it("un jugador sin etiqueta no lleva texto", () => {
    for (const kind of ["attacker", "defender"] as const) {
      expect(draw(<TokenMark token={token(kind)} court="half" labels />).querySelector("text")).toBeNull();
    }
  });

  it("con labels={false} nadie lleva texto", () => {
    for (const kind of ["attacker", "defender", "ball", "cone"] as const) {
      const svg = draw(<TokenMark token={token(kind, "1")} court="half" labels={false} />);

      expect(svg.querySelector("text")).toBeNull();
      // La marca sigue ahí.
      expect(svg.querySelector("circle, path")).not.toBeNull();
    }
  });

  it("en pista completa las marcas son más pequeñas", () => {
    const radius = (court: Court, kind: "attacker" | "ball") =>
      Number(draw(<TokenMark token={token(kind, "1")} court={court} labels />).querySelector("circle")?.getAttribute("r"));

    expect(radius("full", "attacker")).toBeLessThan(radius("half", "attacker"));
    expect(radius("full", "ball")).toBeLessThan(radius("half", "ball"));
  });

  it("no lleva ningún color escrito a mano", () => {
    for (const kind of ["attacker", "defender", "ball", "cone"] as const) {
      expect(draw(<TokenMark token={token(kind, "1")} court="half" labels />).outerHTML).not.toMatch(
        /#[0-9a-f]{3,8}\b/i,
      );
    }
  });
});

describe("MoveMark", () => {
  const from = { x: 50, y: 80 };
  const to = { x: 20, y: 30 };

  it.each(KINDS)("%s: lleva su tipo en data-move y se pinta en brand-accent", (kind) => {
    const svg = draw(<MoveMark kind={kind} from={from} to={to} court="half" />);
    const mark = svg.querySelector("[data-move]");

    expect(mark).toHaveAttribute("data-move", kind);
    expect(mark).toHaveClass("stroke-brand-accent");
    expect(mark).toHaveAttribute("fill", "none");
    // La línea y su remate.
    expect(mark?.querySelectorAll("path")).toHaveLength(2);
  });

  it("solo el pase es discontinuo", () => {
    for (const kind of KINDS) {
      const svg = draw(<MoveMark kind={kind} from={from} to={to} court="half" />);
      const dashed = svg.querySelectorAll("[stroke-dasharray]");

      expect(dashed).toHaveLength(kind === "pass" ? 1 : 0);
    }
  });

  it("del pase, es discontinua la línea y no la punta", () => {
    const [line, head] = Array.from(
      draw(<MoveMark kind="pass" from={from} to={to} court="half" />).querySelectorAll("path"),
    );

    expect(line).toHaveAttribute("stroke-dasharray");
    expect(head).not.toHaveAttribute("stroke-dasharray");
  });

  it.each(COURTS)("%s: va de un punto de la pista a otro, pasados a la caja del dibujo", (court) => {
    const svg = draw(<MoveMark kind="cut" from={from} to={to} court={court} />);
    const line = points(svg.querySelector("path")?.getAttribute("d") ?? "");

    expect(line).toHaveLength(2);
    expect(distance(line[0], toBox(court, from))).toBeLessThan(6);
    expect(distance(line[1], toBox(court, to))).toBeLessThan(3);
  });

  it("media pista: el trazo es el de movePaths a escala 1", () => {
    const svg = draw(<MoveMark kind="dribble" from={from} to={to} court="half" />);
    const [line, head] = Array.from(svg.querySelectorAll("path"), (path) => path.getAttribute("d"));
    const expected = paths("dribble", toBox("half", from), toBox("half", to), 1);

    expect(line).toBe(expected.line);
    expect(head).toBe(expected.end);
  });

  it("no pinta nada si los dos puntos casi coinciden", () => {
    const svg = draw(<MoveMark kind="cut" from={from} to={{ x: from.x + 1, y: from.y + 1 }} court="half" />);

    expect(svg.querySelector("[data-move]")).toBeNull();
    expect(svg).toBeEmptyDOMElement();
  });

  describe("con box: puntos ya en la caja, que sustituyen a los convertidos", () => {
    const boxFrom = { x: 30, y: 60 };
    const boxTo = { x: 70, y: 20 };

    function drawn(svg: SVGSVGElement): (string | null)[] {
      return Array.from(svg.querySelectorAll("path"), (path) => path.getAttribute("d"));
    }

    it("con los dos, el trazo va de uno a otro y no mira from ni to", () => {
      const svg = draw(<MoveMark kind="pass" from={from} to={to} court="half" box={{ from: boxFrom, to: boxTo }} />);
      const expected = paths("pass", boxFrom, boxTo, 1);

      expect(drawn(svg)).toEqual([expected.line, expected.end]);
      expect(drawn(svg)).not.toEqual(drawn(draw(<MoveMark kind="pass" from={from} to={to} court="half" />)));
      expect(svg.querySelector("[data-move]")).toHaveAttribute("data-move", "pass");
      expect(svg.querySelectorAll("[stroke-dasharray]")).toHaveLength(1);
    });

    it("solo con from, el destino sigue saliendo de to", () => {
      const svg = draw(<MoveMark kind="cut" from={from} to={to} court="half" box={{ from: boxFrom }} />);
      const expected = paths("cut", boxFrom, toBox("half", to), 1);

      expect(drawn(svg)).toEqual([expected.line, expected.end]);
    });

    it("solo con to, el origen sigue saliendo de from", () => {
      const svg = draw(<MoveMark kind="cut" from={from} to={to} court="half" box={{ to: boxTo }} />);
      const expected = paths("cut", toBox("half", from), boxTo, 1);

      expect(drawn(svg)).toEqual([expected.line, expected.end]);
    });

    it("sin box, o con uno vacío, se comporta como antes", () => {
      const plain = drawn(draw(<MoveMark kind="dribble" from={from} to={to} court="half" />));
      const expected = paths("dribble", toBox("half", from), toBox("half", to), 1);

      expect(plain).toEqual([expected.line, expected.end]);
      expect(drawn(draw(<MoveMark kind="dribble" from={from} to={to} court="half" box={{}} />))).toEqual(plain);
      expect(drawn(draw(<MoveMark kind="dribble" from={from} to={to} court="half" box={undefined} />))).toEqual(
        plain,
      );
    });

    it("los puntos de box no se pasan otra vez por toBox, tampoco en pista completa", () => {
      const box = { from: boxFrom, to: boxTo };
      const full = points(drawn(draw(<MoveMark kind="cut" from={from} to={to} court="full" box={box} />))[0] ?? "");
      const half = points(drawn(draw(<MoveMark kind="cut" from={from} to={to} court="half" box={box} />))[0] ?? "");

      expect(distance(full[0], boxFrom)).toBeLessThan(6);
      expect(distance(last(full), boxTo)).toBeLessThan(3);
      // A la escala de la pista completa, el trazo sale más cerca del origen que en media pista.
      expect(distance(full[0], boxFrom)).toBeLessThan(distance(half[0], boxFrom));
    });

    it("no pinta nada si los puntos de box casi coinciden, aunque from y to estén lejos", () => {
      const near = { x: boxFrom.x + 1, y: boxFrom.y };
      const svg = draw(<MoveMark kind="pass" from={from} to={to} court="half" box={{ from: boxFrom, to: near }} />);

      expect(svg).toBeEmptyDOMElement();
    });

    it("y pinta si los de box están lejos, aunque from y to casi coincidan", () => {
      const svg = draw(<MoveMark kind="pass" from={from} to={from} court="half" box={{ from: boxFrom, to: boxTo }} />);

      expect(svg.querySelector("[data-move='pass']")).not.toBeNull();
    });
  });

  it("los trazos no engordan con la caja", () => {
    const svg = draw(<MoveMark kind="screen" from={from} to={to} court="full" />);

    for (const path of Array.from(svg.querySelectorAll("path"))) {
      expect(path).toHaveAttribute("vector-effect", "non-scaling-stroke");
    }
  });
});
