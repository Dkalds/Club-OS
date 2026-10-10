import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveProgressInput } from "./schema";
import { cancelLiveSync, syncLiveProgress, trackLiveSync } from "./sync";

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

describe("sin conexión", () => {
  it("avisa con onRetry en cada fallo de red, antes de esperar", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const onRetry = vi.fn();

    await syncLiveProgress(payload, { fetch, now, onRetry, wait: () => Promise.resolve() });
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("un 5xx no es estar sin conexión: no llama a onRetry", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const onRetry = vi.fn();

    await syncLiveProgress(payload, { fetch, now, onRetry, wait: () => Promise.resolve() });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("si otro envío lo reemplaza (signal abortado), deja de reintentar", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockRejectedValue(new Error("network"));

    await syncLiveProgress(payload, {
      fetch,
      now,
      signal: controller.signal,
      wait: () => {
        controller.abort();
        return Promise.resolve();
      },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("con el signal ya abortado no envía nada", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn();

    await syncLiveProgress(payload, { fetch, now, signal: controller.signal });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("cómo acaba", () => {
  it("guardado: devuelve la copia de la sesión que dice el servidor, tal cual", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ applied: 1, updated_at: "2026-11-17T17:20:00.250000+00:00" }),
    });

    expect(await syncLiveProgress(payload, { fetch, now })).toEqual({
      status: "saved",
      updatedAt: "2026-11-17T17:20:00.250000+00:00",
    });
  });

  it("guardado sin copia en la respuesta (o con un cuerpo ilegible): `updatedAt` nulo", async () => {
    const empty = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    const broken = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    });

    expect(await syncLiveProgress(payload, { fetch: empty, now })).toEqual({ status: "saved", updatedAt: null });
    expect(await syncLiveProgress(payload, { fetch: broken, now })).toEqual({ status: "saved", updatedAt: null });
  });

  it.each([401, 403, 404, 409, 422])("un %i es un rechazo, no un guardado", async (status) => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status });

    expect(await syncLiveProgress(payload, { fetch, now })).toEqual({ status: "rejected", httpStatus: status });
  });
});

describe("cancelar", () => {
  it("la señal viaja con la petición: cancelar corta también la que está en vuelo", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });

    await syncLiveProgress(payload, { fetch, now, signal: controller.signal });

    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
  });

  it("cancelado a mitad de una petición: ni reintenta ni avisa de que no hay red", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    const onRetry = vi.fn();

    const outcome = await syncLiveProgress(payload, { fetch, now, onRetry, signal: controller.signal, wait: () => Promise.resolve() });

    expect(outcome).toEqual({ status: "aborted" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("cancelado mientras espera para reintentar: no vuelve a intentarlo", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockRejectedValue(new Error("network"));

    const outcome = await syncLiveProgress(payload, {
      fetch,
      now,
      signal: controller.signal,
      wait: async () => controller.abort(),
    });

    expect(outcome).toEqual({ status: "aborted" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("el envío más reciente de una sesión cancela el anterior, y «cancelLiveSync» cancela el que haya", () => {
    const first = trackLiveSync(EVENT);
    const second = trackLiveSync(EVENT);
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    cancelLiveSync(EVENT);
    expect(second.signal.aborted).toBe(true);

    // Sin ninguno en curso no hace nada, y otra sesión no se ve afectada.
    const other = trackLiveSync("00000000-0000-4000-8000-0000000000e9");
    cancelLiveSync(EVENT);
    expect(other.signal.aborted).toBe(false);
    cancelLiveSync("00000000-0000-4000-8000-0000000000e9");
  });
});
