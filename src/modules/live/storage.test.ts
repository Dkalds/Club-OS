import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveState } from "./types";
import { clearLiveState, loadLiveState, saveLiveState, LIVE_STATE_KEY } from "./storage";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const OTHER_EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2c";

function state(overrides: Partial<LiveState> = {}): LiveState {
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
    ...overrides,
  };
}

// localStorage simulado en memoria para tests en node
function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

describe("localStorage disponible", () => {
  let ls: ReturnType<typeof makeLocalStorage>;
  beforeEach(() => {
    ls = makeLocalStorage();
    vi.stubGlobal("localStorage", ls);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("guardar y leer devuelve el mismo estado", () => {
    const s = state({ startedAt: 1_700_000_000_000 });
    saveLiveState(s, { synced: false, serverUpdatedAt: null });
    expect(loadLiveState(EVENT)).toEqual({ state: s, synced: false, serverUpdatedAt: null });
  });

  it("recuerda si el estado ya se envió, y la copia de la sesión que devolvió ese envío", () => {
    const s = state({ startedAt: 1_700_000_000_000 });
    saveLiveState(s, { synced: true, serverUpdatedAt: "2026-11-17T17:20:00.250000+00:00" });
    expect(loadLiveState(EVENT)).toMatchObject({ synced: true, serverUpdatedAt: "2026-11-17T17:20:00.250000+00:00" });
  });

  it("una copia que no es texto cuenta como desconocida", () => {
    ls.setItem(
      LIVE_STATE_KEY(EVENT),
      JSON.stringify({ version: 2, synced: true, serverUpdatedAt: 12345, state: state() }),
    );
    expect(loadLiveState(EVENT)?.serverUpdatedAt).toBeNull();
  });

  it("loadLiveState devuelve null si no hay nada guardado", () => {
    expect(loadLiveState(EVENT)).toBeNull();
  });

  it("la clave incluye el eventId", () => {
    saveLiveState(state(), { synced: false, serverUpdatedAt: null });
    expect(ls.getItem(LIVE_STATE_KEY(EVENT))).not.toBeNull();
  });

  it("un estado de la versión 1 se descarta", () => {
    ls.setItem(LIVE_STATE_KEY(EVENT), JSON.stringify({ ...state(), version: 1, index: 1 }));
    expect(loadLiveState(EVENT)).toBeNull();
  });

  it("version distinta → null (descarta estado obsoleto)", () => {
    ls.setItem(LIVE_STATE_KEY(EVENT), JSON.stringify({ version: 99, synced: true, state: state() }));
    expect(loadLiveState(EVENT)).toBeNull();
  });

  it("un estado guardado bajo la clave de otro evento se descarta", () => {
    ls.setItem(
      LIVE_STATE_KEY(OTHER_EVENT),
      JSON.stringify({ version: 2, synced: true, state: state() }),
    );
    expect(loadLiveState(OTHER_EVENT)).toBeNull();
  });

  it("sin la marca de enviado, cuenta como no enviado", () => {
    ls.setItem(LIVE_STATE_KEY(EVENT), JSON.stringify({ version: 2, state: state() }));
    expect(loadLiveState(EVENT)?.synced).toBe(false);
  });

  it("JSON corrupto → null sin lanzar", () => {
    ls.setItem(LIVE_STATE_KEY(EVENT), "{invalid");
    expect(() => loadLiveState(EVENT)).not.toThrow();
    expect(loadLiveState(EVENT)).toBeNull();
  });

  it("clearLiveState borra lo guardado para ese evento", () => {
    saveLiveState(state(), { synced: true, serverUpdatedAt: "2026-11-17T17:20:00.250000+00:00" });
    clearLiveState(EVENT);
    expect(loadLiveState(EVENT)).toBeNull();
  });
});

describe("localStorage que lanza", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new DOMException("SecurityError"); },
      setItem: () => { throw new DOMException("QuotaExceededError"); },
      removeItem: () => { throw new DOMException("SecurityError"); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saveLiveState no lanza si localStorage falla", () => {
    expect(() => saveLiveState(state(), { synced: false, serverUpdatedAt: null })).not.toThrow();
  });

  it("loadLiveState devuelve null si localStorage falla", () => {
    expect(loadLiveState(EVENT)).toBeNull();
  });

  it("clearLiveState no lanza si localStorage falla", () => {
    expect(() => clearLiveState(EVENT)).not.toThrow();
  });
});
