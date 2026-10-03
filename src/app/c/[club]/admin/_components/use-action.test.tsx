import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { useAction, type Failure } from "./use-action";

/** Una llamada que no termina hasta que el test lo diga. */
function deferred<T>() {
  let finish: (result: ActionResult<T>) => void = () => {};
  const promise = new Promise<ActionResult<T>>((resolve) => {
    finish = resolve;
  });
  return { promise, finish: (result: ActionResult<T>) => finish(result) };
}

describe("useAction", () => {
  it("empieza parado y sin fallo", () => {
    const { result } = renderHook(() => useAction());

    expect(result.current.pending).toBe(false);
    expect(result.current.failure).toBeNull();
  });

  it("mientras la llamada corre está pendiente; al terminar bien entrega los datos y se para", async () => {
    const call = deferred<{ id: string }>();
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAction());

    act(() => result.current.run(() => call.promise, onSuccess));
    await waitFor(() => expect(result.current.pending).toBe(true));
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => call.finish(ok({ id: "uno" })));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({ id: "uno" });
    expect(result.current.failure).toBeNull();
  });

  it("el manejo del éxito es opcional", async () => {
    const { result } = renderHook(() => useAction());

    act(() => result.current.run(() => Promise.resolve(ok(null))));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.failure).toBeNull();
  });

  it("un fallo entrega el error y sus errores de campo, y no llama al manejo del éxito", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAction());

    act(() =>
      result.current.run(
        () => Promise.resolve(fail("INVALID", { title: "Escribe un título." })),
        onSuccess,
      ),
    );

    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.failure).toEqual({
      error: "INVALID",
      fieldErrors: { title: "Escribe un título." },
    } satisfies Failure);
    expect(result.current.pending).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("un fallo sin campos trae los errores de campo vacíos, no ausentes", async () => {
    const { result } = renderHook(() => useAction());

    act(() => result.current.run(() => Promise.resolve(fail("STALE_COPY"))));

    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.failure).toEqual({ error: "STALE_COPY", fieldErrors: {} });
  });

  it("si la llamada lanza (red caída), es un SAVE_FAILED y no se filtra el mensaje", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAction());

    act(() => result.current.run(() => Promise.reject(new Error("fetch failed")), onSuccess));

    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.failure).toEqual({ error: "SAVE_FAILED", fieldErrors: {} });
    expect(JSON.stringify(result.current.failure)).not.toContain("fetch failed");
    expect(result.current.pending).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("al lanzar de nuevo se quita el fallo anterior desde el principio", async () => {
    const second = deferred<null>();
    const { result } = renderHook(() => useAction());

    act(() => result.current.run(() => Promise.resolve(fail("SAVE_FAILED"))));
    await waitFor(() => expect(result.current.failure).not.toBeNull());

    act(() => result.current.run(() => second.promise));

    await waitFor(() => expect(result.current.pending).toBe(true));
    expect(result.current.failure).toBeNull();

    await act(async () => second.finish(ok(null)));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.failure).toBeNull();
  });

  // La razón de volver a envolver el estado en la transición tras el `await`: sin ello, el
  // resultado se pintaba con `pending` aún en verdadero (el aviso de «Guardado» con el botón
  // todavía parado). Se anota cada pintura de un componente que usa el hook y guarda lo que
  // devuelve la llamada.
  it("el resultado y el fin de la espera llegan en la misma pintura", async () => {
    const paints: Array<{ pending: boolean; failure: Failure | null; saved: boolean }> = [];
    const call = deferred<null>();

    const { result } = renderHook(() => {
      const action = useAction();
      const [saved, setSaved] = useState(false);
      paints.push({ pending: action.pending, failure: action.failure, saved });
      return { ...action, setSaved };
    });

    // Un éxito: lo que el componente guarda (`saved`) llega con `pending` ya en falso.
    act(() => result.current.run(() => call.promise, () => result.current.setSaved(true)));
    await waitFor(() => expect(result.current.pending).toBe(true));
    await act(async () => call.finish(ok(null)));
    await waitFor(() => expect(paints.at(-1)?.saved).toBe(true));
    expect(paints.filter((paint) => paint.saved && paint.pending)).toEqual([]);

    // Un fallo: el fallo llega con `pending` ya en falso.
    paints.length = 0;
    act(() => result.current.run(() => Promise.resolve(fail("SAVE_FAILED"))));
    await waitFor(() => expect(paints.at(-1)?.failure).not.toBeNull());
    expect(paints.filter((paint) => paint.failure && paint.pending)).toEqual([]);
  });
});
