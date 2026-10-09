import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearLiveData } from "./clear-live-data";

function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
    [Symbol.iterator]: function* () { yield* store.entries(); },
  } as unknown as Storage;
}

function makeObject(store: Storage) {
  return new Proxy(store, {
    ownKeys: () => {
      const keys: string[] = [];
      for (let i = 0; i < store.length; i++) keys.push(store.key(i)!);
      return keys;
    },
    getOwnPropertyDescriptor: (_t, p) => ({ value: store.getItem(p as string), writable: true, enumerable: true, configurable: true }),
  });
}

let ls: Storage;
let fakeCaches: { keys: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

beforeEach(() => {
  ls = makeLocalStorage();
  vi.stubGlobal("localStorage", makeObject(ls));

  fakeCaches = {
    keys: vi.fn().mockResolvedValue(["clubos-live-abc", "clubos-live-xyz", "documents"]),
    delete: vi.fn().mockResolvedValue(true),
  };
  vi.stubGlobal("caches", fakeCaches);
});

describe("clearLiveData", () => {
  it("borra las claves clubos:* de localStorage y deja las demás", async () => {
    ls.setItem("clubos:live:abc", "data");
    ls.setItem("clubos:live:xyz", "data2");
    ls.setItem("other-key", "keep");

    await clearLiveData();

    expect(ls.getItem("clubos:live:abc")).toBeNull();
    expect(ls.getItem("clubos:live:xyz")).toBeNull();
    expect(ls.getItem("other-key")).toBe("keep");
  });

  it("borra las cachés clubos-* y deja las demás", async () => {
    await clearLiveData();

    expect(fakeCaches.delete).toHaveBeenCalledWith("clubos-live-abc");
    expect(fakeCaches.delete).toHaveBeenCalledWith("clubos-live-xyz");
    expect(fakeCaches.delete).not.toHaveBeenCalledWith("documents");
  });

  it("no lanza si localStorage no existe", async () => {
    vi.stubGlobal("localStorage", undefined);
    await expect(clearLiveData()).resolves.toBeUndefined();
  });

  it("no lanza si caches no existe", async () => {
    vi.stubGlobal("caches", undefined);
    await expect(clearLiveData()).resolves.toBeUndefined();
  });
});
