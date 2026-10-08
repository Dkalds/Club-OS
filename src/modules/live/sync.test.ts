import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveProgressInput } from "./schema";
import { syncLiveProgress } from "./sync";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const ITEM = "00000000-0000-4000-8000-0000000000b1";

const payload: LiveProgressInput = {
  clubSlug: "club-a",
  eventId: EVENT,
  items: [{ id: ITEM, completed: true, actualMinutes: 10 }],
  finished: false,
};

let t = 0;
function now() { return t; }

afterEach(() => { t = 0; vi.clearAllMocks(); });

it("una respuesta 200 no reintenta", async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
  await syncLiveProgress(payload, { fetch, now });
  expect(fetch).toHaveBeenCalledTimes(1);
});

describe("reintentos", () => {
  it("fallo de red → reintenta con espera exponencial", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const waits: number[] = [];
    const result = syncLiveProgress(payload, {
      fetch,
      now,
      wait: (ms) => { waits.push(ms); t += ms; return Promise.resolve(); },
    });
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(waits[0]).toBe(2000);
    expect(waits[1]).toBe(4000);
  });

  it("500 → reintenta", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const waits: number[] = [];
    await syncLiveProgress(payload, {
      fetch,
      now,
      wait: (ms) => { waits.push(ms); t += ms; return Promise.resolve(); },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(waits[0]).toBe(2000);
  });

  it("espera máxima de 60 s", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500 });
    // 7 intentos: 2,4,8,16,32,60,60… — dejamos solo 1 reintento para verificar el cap
    const waits: number[] = [];
    // Force-run 7 failures
    const calls = Array.from({ length: 7 }, () => ({ ok: false, status: 500 }));
    calls.push({ ok: true, status: 200 });
    const mockFetch = vi.fn();
    for (const r of calls) mockFetch.mockResolvedValueOnce(r);

    await syncLiveProgress(payload, {
      fetch: mockFetch,
      now,
      wait: (ms) => { waits.push(ms); t += ms; return Promise.resolve(); },
    });
    expect(waits.every((w) => w <= 60_000)).toBe(true);
    expect(waits[5]).toBe(60_000);
  });
});

describe("sin reintento en errores permanentes", () => {
  it("401 → para y no reintenta", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 });
    await syncLiveProgress(payload, { fetch, now });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("404 → para y no reintenta", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 });
    await syncLiveProgress(payload, { fetch, now });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("409 → para y no reintenta", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 409 });
    await syncLiveProgress(payload, { fetch, now });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
