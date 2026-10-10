import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshState } from "./reconcile";
import { LIVE_STATE_KEY, loadLiveState, saveLiveState } from "./storage";
import { cancelLiveSync } from "./sync";
import type { LiveItem, LiveSession, LiveState, ServerLive } from "./types";
import { useLive } from "./use-live";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const ITEM_A = "00000000-0000-4000-8000-0000000000a1";
const ITEM_B = "00000000-0000-4000-8000-0000000000a2";

const STAMP_OLD = "2026-11-17T17:00:00.100000+00:00";
const STAMP_PAGE = "2026-11-17T17:20:00.250000+00:00";
const STAMP_AFTER = "2026-11-17T17:21:00.500000+00:00";

function item(id: string): LiveItem {
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
  };
}

const NOT_STARTED: ServerLive = { startedAt: null, position: null, updatedAt: STAMP_PAGE };
const RUNNING: ServerLive = { startedAt: "2026-11-17T17:02:00.000Z", position: 1, updatedAt: STAMP_PAGE };

function session(live: ServerLive = NOT_STARTED): LiveSession {
  return {
    eventId: EVENT,
    clubSlug: "club-a",
    title: "Sesión",
    startsAt: "2026-11-17T18:00:00+01:00",
    items: [item(ITEM_A), item(ITEM_B)],
    live,
  };
}

function started(index: number): LiveState {
  return { ...freshState(EVENT), index, startedAt: Date.now() - 600_000, itemStartedAt: Date.now() - 60_000 };
}

const fetchMock = vi.fn();
const saved = (updatedAt = STAMP_AFTER) => ({ ok: true, status: 200, json: async () => ({ applied: 2, updated_at: updatedAt }) });

function bodies(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

/**
 * Pulsa «terminar» y espera a saber qué ha sido del fin. La promesa se pide dentro de `act` y se
 * espera fuera: quien la resuelve es un efecto que solo corre cuando `act` suelta el render.
 */
async function finishAndWait(result: { current: ReturnType<typeof useLive> }): Promise<string> {
  let pending: Promise<string> = Promise.resolve("sin pedir");
  act(() => {
    pending = result.current.finish();
  });
  await waitFor(() => expect(result.current.state.finishedAt).not.toBeNull());
  let outcome = "sin resolver";
  await act(async () => {
    outcome = await pending;
  });
  return outcome;
}

/** Un turno de más, para dar tiempo a un envío que no debe existir. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockResolvedValue(saved());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  // Corta cualquier reintento que un test haya dejado esperando.
  cancelLiveSync(EVENT);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("sin iniciar", () => {
  it("abrir la pantalla no envía ni guarda nada", async () => {
    const { result } = renderHook(() => useLive(session()));
    await settle();

    expect(result.current.state.startedAt).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(LIVE_STATE_KEY(EVENT))).toBeNull();
  });

  it("al iniciar envía el inicio y la posición 0, y lo deja como enviado con la copia que devuelve el servidor", async () => {
    const { result } = renderHook(() => useLive(session()));

    act(() => result.current.dispatch({ type: "start" }));

    await waitFor(() => expect(result.current.syncStatus).toBe("saved"));
    const [body] = bodies();
    expect(body).toMatchObject({ clubSlug: "club-a", eventId: EVENT, position: 0, finished: false });
    expect(typeof body?.startedAt).toBe("string");
    expect(loadLiveState(EVENT)).toMatchObject({ synced: true, serverUpdatedAt: STAMP_AFTER });
  });

  it("al pasar de ejercicio envía la posición nueva", async () => {
    const { result } = renderHook(() => useLive(session()));

    act(() => result.current.dispatch({ type: "start" }));
    await waitFor(() => expect(result.current.syncStatus).toBe("saved"));
    act(() => result.current.dispatch({ type: "next" }));

    await waitFor(() => expect(bodies().at(-1)).toMatchObject({ position: 1 }));
  });
});

describe("cómo acaba un envío", () => {
  it("sin red, lo guardado queda como no enviado", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useLive(session()));

    act(() => result.current.dispatch({ type: "start" }));

    await waitFor(() => expect(result.current.syncStatus).toBe("offline"));
    expect(loadLiveState(EVENT)?.synced).toBe(false);
  });

  it.each([401, 404, 409, 422])(
    "si el servidor lo rechaza (%i) no dice «guardado» ni lo marca como enviado",
    async (status) => {
      fetchMock.mockResolvedValue({ ok: false, status });
      const { result } = renderHook(() => useLive(session()));

      act(() => result.current.dispatch({ type: "start" }));

      await waitFor(() => expect(result.current.syncStatus).toBe("failed"));
      expect(loadLiveState(EVENT)?.synced).toBe(false);
    },
  );

  it("terminar espera al servidor y dice que el fin se guardó", async () => {
    const { result } = renderHook(() => useLive(session(RUNNING)));

    const outcome = await finishAndWait(result);

    expect(outcome).toBe("saved");
    expect(bodies().at(-1)).toMatchObject({ finished: true });
    expect(loadLiveState(EVENT)).toMatchObject({ synced: true });
  });

  it("si el servidor rechaza el fin, lo dice: no se da por guardado", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409 });
    const { result } = renderHook(() => useLive(session(RUNNING)));

    const outcome = await finishAndWait(result);

    expect(outcome).toBe("failed");
    expect(result.current.syncStatus).toBe("failed");
    expect(loadLiveState(EVENT)?.synced).toBe(false);
  });

  it("sin red, terminar no se queda esperando: el fin queda pendiente", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useLive(session(RUNNING)));

    const outcome = await finishAndWait(result);

    expect(outcome).toBe("pending");
  });
});

describe("al abrir", () => {
  it("con el servidor en curso y sin nada en el móvil, retoma su ejercicio sin escribir en el servidor", async () => {
    const { result } = renderHook(() => useLive(session(RUNNING)));
    await settle();

    expect(result.current.state.index).toBe(1);
    expect(result.current.state.startedAt).toBe(Date.parse("2026-11-17T17:02:00.000Z"));
    // Mirar no es tocar: ni un envío, y lo guardado queda como enviado, con la copia de la página.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loadLiveState(EVENT)).toMatchObject({ synced: true, serverUpdatedAt: STAMP_PAGE });
  });

  it("con lo del móvil ya enviado y la misma copia, sigue donde iba sin reenviar", async () => {
    const mine = started(1);
    saveLiveState(mine, { synced: true, serverUpdatedAt: STAMP_PAGE });

    const { result } = renderHook(() => useLive(session(RUNNING)));
    await settle();

    expect(result.current.state).toEqual(mine);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con una página vieja que dice «sin empezar», no reabre por el ejercicio 1 lo que el móvil ya envió", async () => {
    saveLiveState(started(1), { synced: true, serverUpdatedAt: STAMP_AFTER });

    const { result } = renderHook(() => useLive(session({ startedAt: null, position: null, updatedAt: STAMP_OLD })));
    await settle();

    expect(result.current.state.index).toBe(1);
    expect(result.current.state.startedAt).not.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("si el servidor se reinició después (copia posterior, sin empezar), abre en el ejercicio 1", () => {
    saveLiveState(started(1), { synced: true, serverUpdatedAt: STAMP_OLD });

    const { result } = renderHook(() => useLive(session()));

    expect(result.current.state.index).toBe(0);
    expect(result.current.state.startedAt).toBeNull();
  });

  it("con progreso sin enviar en el móvil, lo envía nada más abrir", async () => {
    saveLiveState(started(1), { synced: false, serverUpdatedAt: null });
    // La misma sesión en cada render, como en la pantalla: una nueva volvería a lanzar el envío.
    const live = session();

    const { result } = renderHook(() => useLive(live));

    await waitFor(() => expect(result.current.syncStatus).toBe("saved"));
    expect(bodies()).toHaveLength(1);
    expect(bodies()[0]).toMatchObject({ position: 1 });
    expect(loadLiveState(EVENT)?.synced).toBe(true);
  });
});

describe("cancelar el envío en curso", () => {
  it("«cancelLiveSync» corta los reintentos: nada llega después", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = renderHook(() => useLive(session()));

    act(() => result.current.dispatch({ type: "start" }));
    await waitFor(() => expect(result.current.syncStatus).toBe("offline"));
    const attempts = fetchMock.mock.calls.length;

    cancelLiveSync(EVENT);
    fetchMock.mockResolvedValue(saved());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetchMock.mock.calls.length).toBe(attempts);
    expect(loadLiveState(EVENT)?.synced).toBe(false);
  });
});
