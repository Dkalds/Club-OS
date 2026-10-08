import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveState } from "./types";
import { loadLiveState, saveLiveState, LIVE_STATE_KEY } from "./storage";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";

function state(overrides: Partial<LiveState> = {}): LiveState {
  return {
    version: 1,
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
    saveLiveState(s);
    const loaded = loadLiveState(EVENT);
    expect(loaded).toEqual(s);
  });

  it("loadLiveState devuelve null si no hay nada guardado", () => {
    expect(loadLiveState(EVENT)).toBeNull();
  });

  it("la clave incluye el eventId", () => {
    const s = state();
    saveLiveState(s);
    expect(ls.getItem(LIVE_STATE_KEY(EVENT))).not.toBeNull();
  });

  it("version distinta → null (descarta estado obsoleto)", () => {
    const s = state() as unknown as { version: number } & Omit<LiveState, "version">;
    s.version = 99;
    ls.setItem(LIVE_STATE_KEY(EVENT), JSON.stringify(s));
    expect(loadLiveState(EVENT)).toBeNull();
  });

  it("JSON corrupto → null sin lanzar", () => {
    ls.setItem(LIVE_STATE_KEY(EVENT), "{invalid");
    expect(() => loadLiveState(EVENT)).not.toThrow();
    expect(loadLiveState(EVENT)).toBeNull();
  });
});

describe("localStorage que lanza", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new DOMException("SecurityError"); },
      setItem: () => { throw new DOMException("QuotaExceededError"); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saveLiveState no lanza si localStorage falla", () => {
    expect(() => saveLiveState(state())).not.toThrow();
  });

  it("loadLiveState devuelve null si localStorage falla", () => {
    expect(loadLiveState(EVENT)).toBeNull();
  });
});
