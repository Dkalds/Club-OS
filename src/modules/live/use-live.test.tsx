import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { freshState } from "./reconcile";
import { LIVE_STATE_KEY, loadLiveState, saveLiveState } from "./storage";
import type { LiveItem, LiveSession } from "./types";
import { useLive } from "./use-live";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const ITEM_A = "00000000-0000-4000-8000-0000000000a1";
const ITEM_B = "00000000-0000-4000-8000-0000000000a2";

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

function session(live: LiveSession["live"] = { startedAt: null, position: null }): LiveSession {
  return {
    eventId: EVENT,
    clubSlug: "club-a",
    title: "Sesión",
    startsAt: "2026-11-17T18:00:00+01:00",
    items: [item(ITEM_A), item(ITEM_B)],
    live,
  };
}

const fetchMock = vi.fn();

function bodies(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("abrir la pantalla sin iniciar no envía ni guarda nada", async () => {
  const { result } = renderHook(() => useLive(session()));

  // Un turno de más para dar tiempo a un envío que no debe existir.
  await act(async () => {
    await Promise.resolve();
  });

  expect(result.current.state.startedAt).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(localStorage.getItem(LIVE_STATE_KEY(EVENT))).toBeNull();
});

it("al iniciar envía el inicio y la posición 0, y lo deja marcado como enviado", async () => {
  const { result } = renderHook(() => useLive(session()));

  act(() => result.current.dispatch({ type: "start" }));

  await waitFor(() => expect(result.current.syncStatus).toBe("saved"));
  const [body] = bodies();
  expect(body).toMatchObject({ clubSlug: "club-a", eventId: EVENT, position: 0, finished: false });
  expect(typeof body?.startedAt).toBe("string");
  expect(loadLiveState(EVENT)?.synced).toBe(true);
});

it("al pasar de ejercicio envía la posición nueva", async () => {
  const { result } = renderHook(() => useLive(session()));

  act(() => result.current.dispatch({ type: "start" }));
  await waitFor(() => expect(result.current.syncStatus).toBe("saved"));
  act(() => result.current.dispatch({ type: "next" }));

  await waitFor(() => expect(bodies().at(-1)).toMatchObject({ position: 1 }));
});

it("sin red, lo guardado queda como no enviado", async () => {
  fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
  const { result } = renderHook(() => useLive(session()));

  act(() => result.current.dispatch({ type: "start" }));

  await waitFor(() => expect(result.current.syncStatus).toBe("offline"));
  expect(loadLiveState(EVENT)?.synced).toBe(false);
});

it("con un estado viejo ya enviado y el servidor sin empezar, abre en el ejercicio 1", () => {
  saveLiveState({ ...freshState(EVENT), index: 1, startedAt: 1, itemStartedAt: 1 }, true);

  const { result } = renderHook(() => useLive(session()));

  expect(result.current.state.index).toBe(0);
  expect(result.current.state.startedAt).toBeNull();
});

it("con el servidor en curso y sin estado en el móvil, retoma su ejercicio", () => {
  const { result } = renderHook(() =>
    useLive(session({ startedAt: "2026-11-17T17:02:00.000Z", position: 1 })),
  );

  expect(result.current.state.index).toBe(1);
  expect(result.current.state.startedAt).toBe(Date.parse("2026-11-17T17:02:00.000Z"));
});
