import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveSession } from "./types";
import { cacheDiagrams, clearDiagrams, diagramSrc } from "./diagram-cache";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const ITEM = "00000000-0000-4000-8000-0000000000b1";

const session: LiveSession = {
  eventId: EVENT,
  clubSlug: "club-a",
  title: "Sesión",
  startsAt: "2026-11-17T18:00:00+01:00",
  items: [
    {
      id: ITEM,
      title: "Ejercicio",
      phase: null,
      minutes: 10,
      diagramUrl: "https://storage.example.com/img.png",
      keyPoints: [],
      standards: [],
    },
  ],
};

function makeFakeCache() {
  const store = new Map<string, Response>();
  return {
    put: vi.fn(async (key: string, response: Response) => { store.set(key, response); }),
    match: vi.fn(async (key: string) => store.get(key)),
    keys: vi.fn(async () => [...store.keys()].map((url) => ({ url }))),
    delete: vi.fn(async (key: string) => { store.delete(key); return store.has(key); }),
  };
}

function setupCaches(cache: ReturnType<typeof makeFakeCache>) {
  vi.stubGlobal("caches", {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    has: vi.fn().mockResolvedValue(false),
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))));
  vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:test") });
}

afterEach(() => vi.unstubAllGlobals());

describe("cacheDiagrams", () => {
  it("almacena cada diagrama con URL firmada", async () => {
    const cache = makeFakeCache();
    setupCaches(cache);
    await cacheDiagrams(session);
    expect(cache.put).toHaveBeenCalledTimes(1);
    const key = cache.put.mock.calls[0][0] as string;
    expect(key).toContain(EVENT);
    expect(key).toContain(ITEM);
  });

  it("ítem sin diagrama no descarga nada", async () => {
    const cache = makeFakeCache();
    setupCaches(cache);
    const noImg: LiveSession = { ...session, items: [{ ...session.items[0], diagramUrl: null }] };
    await cacheDiagrams(noImg);
    expect(cache.put).not.toHaveBeenCalled();
  });
});

describe("diagramSrc", () => {
  it("devuelve blob: URL si la imagen está en caché", async () => {
    const cache = makeFakeCache();
    setupCaches(cache);
    await cacheDiagrams(session);
    const src = await diagramSrc(EVENT, ITEM);
    expect(src).toBe("blob:test");
  });

  it("devuelve null si no hay caché", async () => {
    const cache = makeFakeCache();
    setupCaches(cache);
    const src = await diagramSrc(EVENT, ITEM);
    expect(src).toBeNull();
  });
});

describe("clearDiagrams", () => {
  it("borra la caché del evento", async () => {
    vi.stubGlobal("caches", {
      delete: vi.fn().mockResolvedValue(true),
      keys: vi.fn().mockResolvedValue([]),
    });
    await clearDiagrams(EVENT);
    expect((globalThis.caches as { delete: ReturnType<typeof vi.fn> }).delete).toHaveBeenCalled();
  });
});
