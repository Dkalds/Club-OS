import { describe, expect, it } from "vitest";
import { compareStamps, freshState, reconcile } from "./reconcile";
import type { LiveItem, LiveSession, LiveState, ServerLive, StoredLive } from "./types";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const ITEM_A = "00000000-0000-4000-8000-0000000000a1";
const ITEM_B = "00000000-0000-4000-8000-0000000000a2";
const ITEM_C = "00000000-0000-4000-8000-0000000000a3";

const NOW = 1_800_000_000_000;
const MIN = 60_000;
const STARTED_ISO = "2026-11-17T17:00:00.000Z";

// Tres copias de la sesión, como las da Postgres (con microsegundos), en orden.
const STAMP_OLD = "2026-11-17T17:00:00.100000+00:00";
const STAMP_SENT = "2026-11-17T17:20:00.250000+00:00";
const STAMP_NEW = "2026-11-17T17:40:00.900000+00:00";

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

const NOT_STARTED: ServerLive = { startedAt: null, position: null, updatedAt: STAMP_SENT };
const running = (position: number | null, updatedAt = STAMP_SENT): ServerLive => ({
  startedAt: STARTED_ISO,
  position,
  updatedAt,
});

function session(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    eventId: EVENT,
    clubSlug: "club-a",
    title: "Sesión",
    startsAt: "2026-11-17T18:00:00+01:00",
    items: [item(ITEM_A), item(ITEM_B), item(ITEM_C)],
    live: NOT_STARTED,
    ...overrides,
  };
}

function state(overrides: Partial<LiveState> = {}): LiveState {
  return { ...freshState(EVENT), ...overrides };
}

/** Un estado empezado en el dispositivo, por el ejercicio `index`. */
function local(index: number, overrides: Partial<LiveState> = {}): LiveState {
  return state({ index, startedAt: NOW - 30 * MIN, itemStartedAt: NOW - 4 * MIN, pausedMs: 20_000, ...overrides });
}

const sent = (s: LiveState, serverUpdatedAt: string | null = STAMP_SENT): StoredLive => ({
  state: s,
  synced: true,
  serverUpdatedAt,
});
const unsent = (s: LiveState, serverUpdatedAt: string | null = null): StoredLive => ({
  state: s,
  synced: false,
  serverUpdatedAt,
});

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

describe("compareStamps", () => {
  it("ordena dos copias, también cuando solo difieren en microsegundos", () => {
    expect(compareStamps(STAMP_OLD, STAMP_SENT)).toBeLessThan(0);
    expect(compareStamps(STAMP_NEW, STAMP_SENT)).toBeGreaterThan(0);
    expect(compareStamps("2026-11-17T17:20:00.250001+00:00", "2026-11-17T17:20:00.250000+00:00")).toBeGreaterThan(0);
  });

  it("el mismo instante es 0, se escriba como se escriba", () => {
    expect(compareStamps(STAMP_SENT, STAMP_SENT)).toBe(0);
    expect(compareStamps("2026-11-17T18:20:00.25+01:00", STAMP_SENT)).toBe(0);
    expect(compareStamps("2026-11-17T17:20:00Z", "2026-11-17T17:20:00.000000+00:00")).toBe(0);
  });

  it("lo que no se puede leer no se ordena", () => {
    expect(compareStamps("ayer", STAMP_SENT)).toBeNull();
    expect(compareStamps(STAMP_SENT, "")).toBeNull();
  });
});

describe("sin nada en el dispositivo, manda el servidor", () => {
  it("sin empezar → estado nuevo, ejercicio 1", () => {
    expect(reconcile(session(), null, NOW)).toEqual({
      state: freshState(EVENT),
      source: "fresh",
      serverUpdatedAt: null,
    });
  });

  it("en curso → su ejercicio, con el tiempo entero y en marcha, y la copia de la que sale", () => {
    expect(reconcile(session({ live: running(1) }), null, NOW)).toEqual({
      state: state({ index: 1, startedAt: Date.parse(STARTED_ISO), itemStartedAt: NOW }),
      source: "server",
      serverUpdatedAt: STAMP_SENT,
    });
  });

  it("recoge lo que otro dispositivo ya cronometró", () => {
    const withProgress = session({
      live: running(2),
      items: [
        item(ITEM_A, { completed: true, actualMinutes: 9 }),
        item(ITEM_B, { completed: false, actualMinutes: 0 }),
        item(ITEM_C),
      ],
    });

    expect(reconcile(withProgress, null, NOW).state.progress).toEqual({
      [ITEM_A]: { completed: true, actualMs: 9 * MIN },
      [ITEM_B]: { completed: false, actualMs: 0 },
    });
  });

  it("sin posición guardada → el primer ejercicio; más allá del último → el último", () => {
    expect(reconcile(session({ live: running(null) }), null, NOW).state.index).toBe(0);
    expect(reconcile(session({ live: running(7) }), null, NOW).state.index).toBe(2);
  });

  it("una fecha de inicio ilegible no rompe: cuenta desde ahora", () => {
    const broken = session({ live: { startedAt: "ayer", position: 1, updatedAt: STAMP_SENT } });
    expect(reconcile(broken, null, NOW).state.startedAt).toBe(NOW);
  });

  it("un estado guardado sin empezar no cuenta como nada guardado", () => {
    expect(reconcile(session(), unsent(state({ index: 2 })), NOW).source).toBe("fresh");
  });
});

describe("el dispositivo tiene progreso sin enviar: manda el dispositivo", () => {
  it("aunque el servidor diga que no ha empezado", () => {
    const stored = unsent(local(1));
    expect(reconcile(session(), stored, NOW)).toEqual({
      state: stored.state,
      source: "device-unsent",
      serverUpdatedAt: null,
    });
  });

  it("aunque el servidor vaya por otro ejercicio o tenga una copia posterior", () => {
    const stored = unsent(local(2), STAMP_OLD);
    const result = reconcile(session({ live: running(0, STAMP_NEW) }), stored, NOW);

    expect(result.source).toBe("device-unsent");
    expect(result.state).toEqual(stored.state);
    expect(result.serverUpdatedAt).toBe(STAMP_OLD);
  });
});

describe("lo del dispositivo ya está enviado: se comparan las copias", () => {
  it("la página trae la misma copia → el estado del dispositivo, con su tiempo exacto", () => {
    const stored = sent(local(1));
    expect(reconcile(session({ live: running(1) }), stored, NOW)).toEqual({
      state: stored.state,
      source: "device",
      serverUpdatedAt: STAMP_SENT,
    });
  });

  it("la página es VIEJA y dice que no ha empezado (caché, botón atrás) → no se reabre por el ejercicio 1", () => {
    // La página se guardó antes de «Iniciar»; el dispositivo ya envió que va por el tercero.
    const stale = session({ live: { startedAt: null, position: null, updatedAt: STAMP_OLD } });
    const stored = sent(local(2));

    const result = reconcile(stale, stored, NOW);

    expect(result.source).toBe("device");
    expect(result.state.index).toBe(2);
    expect(result.state.startedAt).not.toBeNull();
  });

  it("la página es vieja y trae una posición anterior → manda el dispositivo", () => {
    const stale = session({ live: running(0, STAMP_OLD) });
    const result = reconcile(stale, sent(local(2)), NOW);

    expect(result.source).toBe("device");
    expect(result.state.index).toBe(2);
  });

  it("el servidor tiene una copia POSTERIOR y no ha empezado (alguien pulsó «Empezar de nuevo») → ejercicio 1", () => {
    const reset = session({ live: { startedAt: null, position: null, updatedAt: STAMP_NEW } });

    expect(reconcile(reset, sent(local(2)), NOW)).toEqual({
      state: freshState(EVENT),
      source: "fresh",
      serverUpdatedAt: null,
    });
  });

  it("el servidor tiene una copia posterior en otro ejercicio (otro dispositivo avanzó) → el suyo", () => {
    const ahead = session({ live: running(2, STAMP_NEW) });
    const result = reconcile(ahead, sent(local(0)), NOW);

    expect(result.source).toBe("server");
    expect(result.state.index).toBe(2);
    expect(result.state.itemStartedAt).toBe(NOW);
    expect(result.serverUpdatedAt).toBe(STAMP_NEW);
  });

  it("copia posterior y mismo ejercicio (otra vuelta, tras reiniciar en otro dispositivo) → no revive el tiempo viejo", () => {
    const secondRun = session({
      live: running(2, STAMP_NEW),
      items: [item(ITEM_A, { completed: true, actualMinutes: 3 }), item(ITEM_B, { completed: true, actualMinutes: 4 }), item(ITEM_C)],
    });
    const firstRun = sent(
      local(2, {
        itemStartedAt: NOW - 2 * 24 * 60 * MIN,
        progress: { [ITEM_A]: { completed: true, actualMs: 9 * MIN }, [ITEM_B]: { completed: true, actualMs: 8 * MIN } },
      }),
    );

    const result = reconcile(secondRun, firstRun, NOW);

    expect(result.source).toBe("server");
    expect(result.state.itemStartedAt).toBe(NOW);
    expect(result.state.progress[ITEM_A]).toEqual({ completed: true, actualMs: 3 * MIN });
  });

  it("sin saber qué copia dejó el último envío, manda el servidor", () => {
    const result = reconcile(session({ live: running(1) }), sent(local(0), null), NOW);

    expect(result.source).toBe("server");
    expect(result.state.index).toBe(1);
  });

  it("una sesión terminada y enviada sigue terminada ante una página vieja que aún la da por abierta", () => {
    const stale = session({ live: running(2, STAMP_OLD) });
    const finished = sent(local(2, { finishedAt: NOW - MIN }));

    expect(reconcile(stale, finished, NOW).state.finishedAt).toBe(NOW - MIN);
  });
});

describe("la sesión ha cambiado desde que se guardó el estado", () => {
  it("el índice del dispositivo se acota si ahora hay menos ejercicios", () => {
    const shorter = session({ items: [item(ITEM_A)] });

    expect(reconcile(shorter, unsent(local(2)), NOW).state.index).toBe(0);
    expect(reconcile(session({ items: [item(ITEM_A)], live: running(0) }), sent(local(2)), NOW).state.index).toBe(0);
  });

  it("sin ejercicios, el índice es 0", () => {
    const empty = session({ items: [], live: running(3) });
    expect(reconcile(empty, null, NOW).state.index).toBe(0);
  });

  it("no cambia el estado guardado que recibe", () => {
    const stored = unsent(local(2));
    const before = JSON.stringify(stored);
    reconcile(session({ items: [item(ITEM_A)] }), stored, NOW);

    expect(JSON.stringify(stored)).toBe(before);
  });
});
