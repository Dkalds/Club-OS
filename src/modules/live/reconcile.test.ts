import { describe, expect, it } from "vitest";
import { freshState, reconcile } from "./reconcile";
import type { LiveItem, LiveSession, LiveState, StoredLive } from "./types";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const ITEM_A = "00000000-0000-4000-8000-0000000000a1";
const ITEM_B = "00000000-0000-4000-8000-0000000000a2";
const ITEM_C = "00000000-0000-4000-8000-0000000000a3";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const STARTED_ISO = "2026-11-17T17:00:00.000Z";

function item(id: string, overrides: Partial<LiveItem> = {}): LiveItem {
  return {
    id,
    title: "Ejercicio",
    phase: null,
    minutes: 10,
    diagramUrl: null,
    videoUrl: null,
    keyPoints: [],
    standards: [],
    completed: null,
    actualMinutes: null,
    ...overrides,
  };
}

function session(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    eventId: EVENT,
    clubSlug: "club-a",
    title: "Sesión",
    startsAt: "2026-11-17T18:00:00+01:00",
    items: [item(ITEM_A), item(ITEM_B), item(ITEM_C)],
    live: { startedAt: null, position: null },
    ...overrides,
  };
}

function state(overrides: Partial<LiveState> = {}): LiveState {
  return { ...freshState(EVENT), ...overrides };
}

function stored(overrides: Partial<LiveState>, synced: boolean): StoredLive {
  return { state: state(overrides), synced };
}

describe("freshState", () => {
  it("es una sesión sin empezar, en el primer ejercicio", () => {
    expect(freshState(EVENT)).toEqual({
      version: 2,
      eventId: EVENT,
      index: 0,
      startedAt: null,
      itemStartedAt: null,
      pausedAt: null,
      pausedMs: 0,
      progress: {},
      finishedAt: null,
    });
  });
});

describe("el servidor dice que no ha empezado", () => {
  it("sin nada en el móvil → estado nuevo", () => {
    expect(reconcile(session(), null, NOW)).toEqual(freshState(EVENT));
  });

  it("con un estado ya enviado en el móvil → se descarta: empieza en el ejercicio 1", () => {
    const local = stored({ index: 1, startedAt: NOW - 30 * MIN, itemStartedAt: NOW - 5 * MIN }, true);
    expect(reconcile(session(), local, NOW)).toEqual(freshState(EVENT));
  });

  it("con progreso sin enviar en el móvil → manda el móvil", () => {
    const local = stored({ index: 1, startedAt: NOW - 30 * MIN, itemStartedAt: NOW - 5 * MIN }, false);
    expect(reconcile(session(), local, NOW)).toEqual(local.state);
  });

  it("un estado sin empezar y sin enviar no es progreso: estado nuevo", () => {
    const local = stored({ index: 2 }, false);
    expect(reconcile(session(), local, NOW)).toEqual(freshState(EVENT));
  });
});

describe("el servidor dice que está en curso", () => {
  const inProgress = session({ live: { startedAt: STARTED_ISO, position: 1 } });

  it("el móvil va por el mismo ejercicio → su estado, con su tiempo exacto", () => {
    const local = stored(
      { index: 1, startedAt: NOW - 30 * MIN, itemStartedAt: NOW - 4 * MIN, pausedMs: 20_000 },
      true,
    );
    expect(reconcile(inProgress, local, NOW)).toEqual(local.state);
  });

  it("sin estado en el móvil → el ejercicio del servidor, con su tiempo entero y en marcha", () => {
    expect(reconcile(inProgress, null, NOW)).toEqual(
      state({ index: 1, startedAt: Date.parse(STARTED_ISO), itemStartedAt: NOW }),
    );
  });

  it("el móvil va por otro ejercicio y ya lo envió → el ejercicio del servidor", () => {
    const local = stored({ index: 0, startedAt: NOW - 30 * MIN, itemStartedAt: NOW - 30 * MIN }, true);
    const result = reconcile(inProgress, local, NOW);
    expect(result.index).toBe(1);
    expect(result.itemStartedAt).toBe(NOW);
    expect(result.pausedAt).toBeNull();
  });

  it("el móvil va por otro ejercicio y no lo envió → manda el móvil", () => {
    const local = stored({ index: 2, startedAt: NOW - 30 * MIN, itemStartedAt: NOW - MIN }, false);
    expect(reconcile(inProgress, local, NOW)).toEqual(local.state);
  });

  it("recoge del servidor lo que otro dispositivo ya cronometró", () => {
    const withProgress = session({
      live: { startedAt: STARTED_ISO, position: 2 },
      items: [
        item(ITEM_A, { completed: true, actualMinutes: 9 }),
        item(ITEM_B, { completed: false, actualMinutes: 0 }),
        item(ITEM_C),
      ],
    });
    expect(reconcile(withProgress, null, NOW).progress).toEqual({
      [ITEM_A]: { completed: true, actualMs: 9 * MIN },
      [ITEM_B]: { completed: false, actualMs: 0 },
    });
  });

  it("sin posición guardada → el primer ejercicio", () => {
    const noPosition = session({ live: { startedAt: STARTED_ISO, position: null } });
    expect(reconcile(noPosition, null, NOW).index).toBe(0);
  });

  it("una posición más allá del último ejercicio se acota al último", () => {
    const beyond = session({ live: { startedAt: STARTED_ISO, position: 7 } });
    expect(reconcile(beyond, null, NOW).index).toBe(2);
  });

  it("una fecha de inicio ilegible no rompe: cuenta desde ahora", () => {
    const broken = session({ live: { startedAt: "ayer", position: 1 } });
    expect(reconcile(broken, null, NOW).startedAt).toBe(NOW);
  });
});

describe("la sesión ha cambiado desde que se guardó el estado", () => {
  it("el índice del móvil se acota si ahora hay menos ejercicios", () => {
    const shorter = session({ items: [item(ITEM_A)] });
    const local = stored({ index: 2, startedAt: NOW - 30 * MIN, itemStartedAt: NOW - MIN }, false);
    expect(reconcile(shorter, local, NOW).index).toBe(0);
  });

  it("sin ejercicios, el índice es 0", () => {
    const empty = session({ items: [], live: { startedAt: STARTED_ISO, position: 3 } });
    expect(reconcile(empty, null, NOW).index).toBe(0);
  });
});
