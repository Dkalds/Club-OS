import { describe, expect, it } from "vitest";
import type { LiveItem, LiveSession, LiveState } from "./types";
import { liveReducer, remainingMs, elapsedMs, toProgressPayload } from "./reducer";

function reduce(s: LiveState, a: Parameters<typeof liveReducer>[1], nowMs: number): LiveState {
  return liveReducer(s, a, nowMs, SESSION);
}

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const ITEM_A = "00000000-0000-4000-8000-0000000000a1";
const ITEM_B = "00000000-0000-4000-8000-0000000000a2";

function item(id: string, minutes = 10): LiveItem {
  return {
    id,
    title: "Ejercicio",
    phase: null,
    minutes,
    diagramUrl: null,
    videoUrl: null,
    keyPoints: [],
    standards: [],
    completed: null,
    actualMinutes: null,
  };
}

const SESSION: LiveSession = {
  eventId: EVENT,
  clubSlug: "club-a",
  title: "Sesión",
  startsAt: "2026-11-17T18:00:00+01:00",
  items: [item(ITEM_A, 10), item(ITEM_B, 5)],
  live: { startedAt: null, position: null, updatedAt: "2026-11-17T17:20:00.250000+00:00" },
};

function initial(): LiveState {
  return {
    version: 2,
    eventId: EVENT,
    index: 0,
    startedAt: null,
    itemStartedAt: null,
    pausedAt: null,
    pausedMs: 0,
    progress: {},
    finishedAt: null,
  };
}

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe("start", () => {
  it("fija startedAt e itemStartedAt", () => {
    const s = reduce(initial(), { type: "start" }, T0);
    expect(s.startedAt).toBe(T0);
    expect(s.itemStartedAt).toBe(T0);
    expect(s.pausedAt).toBeNull();
  });

  it("no cambia un estado ya iniciado", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "start" }, T0 + MIN);
    expect(s1.startedAt).toBe(T0);
  });
});

describe("pause / resume", () => {
  it("pausa fija pausedAt", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "pause" }, T0 + MIN);
    expect(s1.pausedAt).toBe(T0 + MIN);
  });

  it("reanudar acumula pausedMs y borra pausedAt", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "pause" }, T0 + 2 * MIN);
    const s2 = reduce(s1, { type: "resume" }, T0 + 3 * MIN);
    expect(s2.pausedAt).toBeNull();
    expect(s2.pausedMs).toBe(MIN);
  });

  it("pausa 2 min y reanuda → el restante no cambia hasta reanudar", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const before = remainingMs(s0, SESSION, T0 + 2 * MIN);
    const s1 = reduce(s0, { type: "pause" }, T0 + 2 * MIN);
    const s2 = reduce(s1, { type: "resume" }, T0 + 4 * MIN);
    const after = remainingMs(s2, SESSION, T0 + 4 * MIN);
    expect(after).toBe(before);
  });
});

describe("remainingMs", () => {
  it("a 0 s del comienzo faltan 10 min", () => {
    const s = reduce(initial(), { type: "start" }, T0);
    expect(remainingMs(s, SESSION, T0)).toBe(10 * MIN);
  });

  it("a 30 s del comienzo faltan 9 min 30 s", () => {
    const s = reduce(initial(), { type: "start" }, T0);
    expect(remainingMs(s, SESSION, T0 + 30_000)).toBe(9 * MIN + 30_000);
  });

  it("a 10 min es 0", () => {
    const s = reduce(initial(), { type: "start" }, T0);
    expect(remainingMs(s, SESSION, T0 + 10 * MIN)).toBe(0);
  });

  it("en negativo cuando se pasa de tiempo (D6)", () => {
    const s = reduce(initial(), { type: "start" }, T0);
    expect(remainingMs(s, SESSION, T0 + 12 * MIN)).toBe(-2 * MIN);
  });

  it("un salto de reloj de 5 min sin eventos no afecta el tiempo pasado", () => {
    const s = reduce(initial(), { type: "start" }, T0);
    const remaining = remainingMs(s, SESSION, T0 + 5 * MIN);
    expect(remaining).toBe(5 * MIN);
  });
});

describe("elapsedMs", () => {
  it("devuelve el tiempo transcurrido sin pausas", () => {
    const s = reduce(initial(), { type: "start" }, T0);
    expect(elapsedMs(s, T0 + 3 * MIN)).toBe(3 * MIN);
  });

  it("descuenta el tiempo en pausa", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "pause" }, T0 + 2 * MIN);
    const s2 = reduce(s1, { type: "resume" }, T0 + 4 * MIN);
    expect(elapsedMs(s2, T0 + 5 * MIN)).toBe(3 * MIN);
  });
});

describe("next", () => {
  it("avanza al siguiente ítem y acumula actualMs", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "next" }, T0 + 7 * MIN);
    expect(s1.index).toBe(1);
    expect(s1.progress[ITEM_A]?.actualMs).toBe(7 * MIN);
    expect(s1.progress[ITEM_A]?.completed).toBe(true);
    expect(s1.itemStartedAt).toBe(T0 + 7 * MIN);
  });

  it("en el último next no hace nada", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "next" }, T0 + MIN);
    const s2 = reduce(s1, { type: "next" }, T0 + 2 * MIN);
    expect(s2.index).toBe(1);
  });
});

describe("previous", () => {
  it("retrocede sin desmarcar el completado anterior", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "next" }, T0 + 7 * MIN);
    const s2 = reduce(s1, { type: "previous" }, T0 + 8 * MIN);
    expect(s2.index).toBe(0);
    expect(s2.progress[ITEM_A]?.completed).toBe(true);
  });

  it("en el primero previous no hace nada", () => {
    const s = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s, { type: "previous" }, T0 + MIN);
    expect(s1.index).toBe(0);
  });
});

describe("finish", () => {
  it("registra el ejercicio en curso: el último no tiene «siguiente» que lo haga", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "next" }, T0 + 10 * MIN);
    const s2 = reduce(s1, { type: "finish" }, T0 + 14 * MIN);

    expect(s2.progress[ITEM_B]).toEqual({ completed: true, actualMs: 4 * MIN });
    expect(toProgressPayload(s2, SESSION).items).toEqual([
      { id: ITEM_A, completed: true, actualMinutes: 10 },
      { id: ITEM_B, completed: true, actualMinutes: 4 },
    ]);
  });

  it("terminar en pausa no cuenta el tiempo parado", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "pause" }, T0 + 3 * MIN);
    const s2 = reduce(s1, { type: "finish" }, T0 + 9 * MIN);

    expect(s2.progress[ITEM_A]).toEqual({ completed: true, actualMs: 3 * MIN });
  });

  it("terminar nada más llegar a un ejercicio lo deja sin hacer (0 min, D5)", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "finish" }, T0);

    expect(s1.progress[ITEM_A]).toEqual({ completed: false, actualMs: 0 });
  });

  it("fija finishedAt", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "finish" }, T0 + 15 * MIN);
    expect(s1.finishedAt).toBe(T0 + 15 * MIN);
  });

  it("acciones sobre un estado terminado no lo cambian", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "finish" }, T0 + 15 * MIN);
    const s2 = reduce(s1, { type: "next" }, T0 + 16 * MIN);
    expect(s2.finishedAt).toBe(T0 + 15 * MIN);
    expect(s2.index).toBe(0);
  });
});

describe("toProgressPayload", () => {
  it("ítems sin tocar salen completed=false y actualMinutes=null", () => {
    const s = reduce(initial(), { type: "start" }, T0);
    const payload = toProgressPayload(s, SESSION);
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]).toMatchObject({ id: ITEM_A, completed: false, actualMinutes: null });
    expect(payload.items[1]).toMatchObject({ id: ITEM_B, completed: false, actualMinutes: null });
  });

  it("0 min → completed=false (D5)", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "next" }, T0);
    const payload = toProgressPayload(s1, SESSION);
    expect(payload.items[0]).toMatchObject({ completed: false, actualMinutes: 0 });
  });

  it("redondea a minutos enteros", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "next" }, T0 + 7 * MIN + 30_000);
    const payload = toProgressPayload(s1, SESSION);
    expect(payload.items[0].actualMinutes).toBe(8);
  });

  it("finished=true cuando finishedAt está fijado", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "finish" }, T0 + 15 * MIN);
    expect(toProgressPayload(s1, SESSION).finished).toBe(true);
  });

  it("sin empezar no manda inicio ni posición", () => {
    const payload = toProgressPayload(initial(), SESSION);
    expect(payload).not.toHaveProperty("startedAt");
    expect(payload).not.toHaveProperty("position");
  });

  it("empezada: manda cuándo se inició, en ISO, y el ejercicio en curso", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    expect(toProgressPayload(s0, SESSION)).toMatchObject({
      startedAt: new Date(T0).toISOString(),
      position: 0,
    });

    const s1 = reduce(s0, { type: "next" }, T0 + 3 * MIN);
    expect(toProgressPayload(s1, SESSION)).toMatchObject({
      startedAt: new Date(T0).toISOString(),
      position: 1,
    });
  });

  it("volver al ejercicio anterior mueve la posición", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "next" }, T0 + 3 * MIN);
    const s2 = reduce(s1, { type: "previous" }, T0 + 4 * MIN);
    expect(toProgressPayload(s2, SESSION).position).toBe(0);
  });

  it("un ejercicio que se alarga más de lo que admite el servidor se envía con el tope, no se rechaza", () => {
    const s0 = reduce(initial(), { type: "start" }, T0);
    const s1 = reduce(s0, { type: "next" }, T0 + 200 * MIN);

    expect(toProgressPayload(s1, SESSION).items[0]).toEqual({ id: ITEM_A, completed: true, actualMinutes: 180 });
  });
});
