import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { use, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";

const mocks = vi.hoisted(() => ({ publishDrill: vi.fn(), archiveDrill: vi.fn(), refresh: vi.fn() }));

vi.mock("@/modules/drills/actions", () => ({
  publishDrill: mocks.publishDrill,
  archiveDrill: mocks.archiveDrill,
}));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { DrillAdminActions } from "./drill-admin-actions";
import { DRILL_TITLE_ID } from "./title-id";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const DRILL_ID = "00000000-0000-4000-8000-0000000000d1";

type Flags = { canPublish: boolean; canArchive: boolean };
type Props = Partial<Flags>;

/**
 * Lo que la ficha pone encima de los botones y a donde lleva el foco al terminar: el título,
 * focusable por programa (`tabIndex={-1}`), como el `<h1>` de la página.
 */
function Title() {
  return (
    <h1 id={DRILL_TITLE_ID} tabIndex={-1}>
      Un ejercicio
    </h1>
  );
}

function actions(flags: Flags) {
  return <DrillAdminActions clubSlug="club-a" drillId={DRILL_ID} {...flags} />;
}

function renderActions(props: Props = {}) {
  return render(
    <>
      <Title />
      {actions({ canPublish: props.canPublish ?? true, canArchive: props.canArchive ?? true })}
    </>,
  );
}

/** Quien repinta la ficha cuando `router.refresh()` trae el estado nuevo (ver `Screen`). */
let repaint: ((next: Promise<Flags>) => void) | null = null;

/**
 * La ficha tal como Next la repinta tras `router.refresh()`: no al momento, sino cuando llega
 * del servidor lo nuevo, con los permisos del estado nuevo. El `refresh` de los tests lo
 * pide con `repaint(promesa)` desde dentro de la transición (como hace el enrutador), y la
 * pantalla se queda con la ficha vieja hasta que la promesa se resuelve. Sin esto, un
 * `refresh` síncrono y vacío haría que la espera de después de la acción durase cero y no se
 * probaría.
 */
function Screen({ start }: { start: Flags }) {
  const [next, setNext] = useState<Promise<Flags> | null>(null);
  useEffect(() => {
    repaint = setNext;
    return () => {
      repaint = null;
    };
  }, []);
  const flags = next ? use(next) : start;

  return (
    <>
      <Title />
      {actions(flags)}
    </>
  );
}

/** Un valor que no llega hasta que el test lo diga. */
function later<T>() {
  let finish: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    finish = resolve;
  });
  return { promise, finish: (value: T) => finish(value) };
}

/**
 * Anota cada cambio del texto del aviso con lo que ve quien lo escucha en ese momento: si el
 * aviso está expuesto (ningún ancestro con `aria-hidden`, que es lo que pone la hoja modal a
 * todo lo demás) y si hay una hoja abierta.
 */
function watchAnnouncements(region: HTMLElement) {
  const changes: Array<{ text: string; exposed: boolean; sheetOpen: boolean }> = [];
  const observer = new MutationObserver(() => {
    changes.push({
      text: region.textContent ?? "",
      exposed: region.closest('[aria-hidden="true"]') === null,
      sheetOpen: document.querySelector('[role="dialog"]') !== null,
    });
  });
  observer.observe(region, { childList: true, characterData: true, subtree: true });

  return { changes, stop: () => observer.disconnect() };
}

/** Una acción que no termina hasta que el test lo diga. */
function deferred() {
  let finish: (result: ActionResult<null>) => void = () => {};
  const promise = new Promise<ActionResult<null>>((resolve) => {
    finish = resolve;
  });
  return { promise, finish: (result: ActionResult<null> = ok(null)) => finish(result) };
}

/** Abre la hoja de confirmación y devuelve su diálogo. */
function openSheet() {
  fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
  return screen.getByRole("dialog", { name: "¿Archivar este ejercicio?" });
}

// Radix avisa por consola si el diálogo no tiene título, y React si algo está mal montado: la
// salida de los tests tiene que quedar limpia.
let consoleErrors: ReturnType<typeof vi.spyOn>;
let consoleWarnings: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.publishDrill.mockResolvedValue(ok(null));
  mocks.archiveDrill.mockResolvedValue(ok(null));
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(consoleWarnings).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("qué botones salen", () => {
  it("sin permiso para nada no pinta nada ni anuncia nada", () => {
    const { container } = renderActions({ canPublish: false, canArchive: false });

    // Solo queda el título de prueba: ni botones, ni aviso, ni hoja.
    expect(Array.from(container.children).map((child) => child.tagName)).toEqual(["H1"]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("solo «Publicar» si solo se puede publicar", () => {
    renderActions({ canPublish: true, canArchive: false });

    expect(screen.getByRole("button", { name: "Publicar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archivar" })).not.toBeInTheDocument();
  });

  it("solo «Archivar» si solo se puede archivar", () => {
    renderActions({ canPublish: false, canArchive: true });

    expect(screen.getByRole("button", { name: "Archivar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
  });

  it("«Publicar» es la acción principal, a todo el ancho, y «Archivar» la secundaria", () => {
    renderActions();

    const publish = screen.getByRole("button", { name: "Publicar" });
    expect(publish).toHaveClass("bg-brand-accent", "text-brand-on-accent", "w-full");
    expect(publish).toHaveAttribute("type", "button");
    const archive = screen.getByRole("button", { name: "Archivar" });
    expect(archive).toHaveClass("border-line-strong", "w-full");
    expect(archive).not.toHaveClass("bg-brand-accent");
    expect(archive).toHaveAttribute("type", "button");
  });

  it("no hay hoja ni aviso hasta que hacen falta", () => {
    renderActions();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("Publicar", () => {
  it("publica este ejercicio de este club, sin pedir confirmación, y repinta la ficha", async () => {
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.publishDrill).toHaveBeenCalledTimes(1);
    expect(mocks.publishDrill).toHaveBeenCalledWith("club-a", { drillId: DRILL_ID });
    expect(mocks.archiveDrill).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mientras corre, los dos botones esperan y un segundo toque no lanza otra", async () => {
    const call = deferred();
    mocks.publishDrill.mockReturnValue(call.promise);
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Archivar" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    expect(mocks.publishDrill).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).not.toHaveBeenCalled();

    await act(async () => call.finish());
    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("si falla, dice por qué junto a los botones, como alerta, y no repinta", async () => {
    mocks.publishDrill.mockResolvedValue(fail("NOT_FOUND"));
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
    expect(mocks.refresh).not.toHaveBeenCalled();
    // Los botones vuelven a estar disponibles y están descritos por el error.
    const publish = screen.getByRole("button", { name: "Publicar" });
    expect(publish).toBeEnabled();
    expect(publish).toHaveAccessibleDescription(ACTION_ERROR_COPY.NOT_FOUND);
    expect(screen.getByRole("button", { name: "Archivar" })).toHaveAccessibleDescription(
      ACTION_ERROR_COPY.NOT_FOUND,
    );
  });

  it("si la llamada lanza (red caída), es un «No se pudo guardar» y no se filtra el mensaje", async () => {
    mocks.publishDrill.mockRejectedValue(new Error("fetch failed: drill-secreto"));
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(document.body).not.toHaveTextContent("drill-secreto");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("un reintento que sale bien quita el aviso del fallo", async () => {
    mocks.publishDrill.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.publishDrill).toHaveBeenCalledTimes(2);
  });

  it("al salir bien lo anuncia a los lectores de pantalla", async () => {
    renderActions();
    // El aviso existe antes del cambio, vacío: un aviso que aparece con su texto puesto no siempre se lee.
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(status).toHaveTextContent("Ejercicio publicado."));
    expect(status).toHaveClass("sr-only");
  });
});

describe("Archivar", () => {
  it("pide confirmación en una hoja, con su texto, y todavía no archiva", () => {
    renderActions();

    const sheet = openSheet();

    expect(within(sheet).getByText("Dejará de salir en la biblioteca. Las sesiones que ya lo usan lo conservan.")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Archivar" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Cancelar" })).toBeEnabled();
    expect(mocks.archiveDrill).not.toHaveBeenCalled();
  });

  it("«Archivar» de la hoja es el botón principal y «Cancelar» el secundario, ambos a todo el ancho", () => {
    renderActions();

    const sheet = openSheet();

    expect(within(sheet).getByRole("button", { name: "Archivar" })).toHaveClass("bg-brand-accent", "w-full");
    expect(within(sheet).getByRole("button", { name: "Cancelar" })).toHaveClass("border-line-strong", "w-full");
  });

  it("«Cancelar» cierra la hoja sin archivar ni repintar", async () => {
    renderActions();
    openSheet();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.archiveDrill).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("«Cerrar» y Escape también cierran sin archivar", async () => {
    renderActions();
    const sheet = openSheet();

    fireEvent.click(within(sheet).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    openSheet();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.archiveDrill).not.toHaveBeenCalled();
  });

  it("al confirmar archiva este ejercicio de este club, repinta la ficha y cierra la hoja", async () => {
    renderActions();
    const sheet = openSheet();

    fireEvent.click(within(sheet).getByRole("button", { name: "Archivar" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.archiveDrill).toHaveBeenCalledTimes(1);
    expect(mocks.archiveDrill).toHaveBeenCalledWith("club-a", { drillId: DRILL_ID });
    expect(mocks.publishDrill).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Ejercicio archivado."));
  });

  it("mientras archiva, la hoja espera: no se confirma dos veces ni se cierra", async () => {
    const call = deferred();
    mocks.archiveDrill.mockReturnValue(call.promise);
    renderActions();
    const sheet = openSheet();

    fireEvent.click(within(sheet).getByRole("button", { name: "Archivar" }));

    await waitFor(() => expect(within(sheet).getByRole("button", { name: "Archivar" })).toBeDisabled());
    expect(within(sheet).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    fireEvent.click(within(sheet).getByRole("button", { name: "Archivar" }));
    expect(mocks.archiveDrill).toHaveBeenCalledTimes(1);

    // Ni Escape ni «Cerrar» la cierran a medias: el resultado llegaría a una pantalla sin hoja.
    fireEvent.keyDown(sheet, { key: "Escape" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("dialog", { name: "¿Archivar este ejercicio?" })).toBeInTheDocument();

    await act(async () => call.finish());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("si falla, la hoja se cierra y el motivo queda junto a los botones, como alerta", async () => {
    mocks.archiveDrill.mockResolvedValue(fail("SAVE_FAILED"));
    renderActions();
    const sheet = openSheet();

    fireEvent.click(within(sheet).getByRole("button", { name: "Archivar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Archivar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeEnabled();
  });

  it("tras un fallo se puede volver a confirmar", async () => {
    mocks.archiveDrill.mockResolvedValueOnce(fail("STALE_COPY"));
    renderActions();
    fireEvent.click(within(openSheet()).getByRole("button", { name: "Archivar" }));
    await screen.findByRole("alert");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(within(openSheet()).getByRole("button", { name: "Archivar" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.archiveDrill).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("al terminar: aviso y foco", () => {
  // El título es lo único que sigue en la pantalla tras publicar o archivar (el botón pulsado
  // desaparece al repintar), y dice dónde se está: a él va el foco cuando sale bien. Si falla,
  // el foco vuelve al botón pulsado, que sigue ahí.
  const heading = () => screen.getByRole("heading", { level: 1 });

  /** Hace que `router.refresh()` pida un repintado que no llega hasta que el test lo diga. */
  function holdRefresh() {
    const repainted = later<Flags>();
    mocks.refresh.mockImplementation(() => repaint?.(repainted.promise));
    return repainted;
  }

  /** Más que lo que esperan los componentes tras terminar la acción antes de avisar y mover el foco. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

  it("publicar: nada se anuncia ni se mueve mientras la ficha no se repinta; luego, aviso y foco en el título", async () => {
    const repainted = holdRefresh();
    render(<Screen start={{ canPublish: true, canArchive: true }} />);
    const status = screen.getByRole("status");

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));

    // La acción ha terminado, la ficha todavía no: los botones esperan.
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Archivar" })).toBeDisabled();
    await settle();
    expect(status).toBeEmptyDOMElement();
    expect(heading()).not.toHaveFocus();

    await act(async () => repainted.finish({ canPublish: false, canArchive: true }));

    await waitFor(() => expect(status).toHaveTextContent("Ejercicio publicado."));
    expect(heading()).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archivar" })).toBeEnabled();
  });

  it("archivar: la hoja espera a la ficha y, ya cerrada, se anuncia el resultado y el foco va al título", async () => {
    const repainted = holdRefresh();
    render(<Screen start={{ canPublish: false, canArchive: true }} />);
    const status = screen.getByRole("status");
    const heard = watchAnnouncements(status);
    const sheet = openSheet();

    fireEvent.click(within(sheet).getByRole("button", { name: "Archivar" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));

    // La acción ha terminado, la ficha todavía no: la hoja sigue abierta y quieta, sin avisos.
    expect(within(sheet).getByRole("button", { name: "Archivar" })).toBeDisabled();
    expect(within(sheet).getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await settle();
    expect(screen.getByRole("dialog", { name: "¿Archivar este ejercicio?" })).toBeInTheDocument();
    expect(status).toBeEmptyDOMElement();

    await act(async () => repainted.finish({ canPublish: true, canArchive: false }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(status).toHaveTextContent("Ejercicio archivado."));
    expect(heading()).toHaveFocus();

    // El texto cambió una sola vez, con el aviso a la vista de quien escucha (nada con
    // `aria-hidden` por encima) y sin ninguna hoja abierta: es un cambio que se anuncia.
    heard.stop();
    expect(heard.changes.filter((change) => change.text !== "")).toEqual([
      { text: "Ejercicio archivado.", exposed: true, sheetOpen: false },
    ]);
  });

  it("si publicar falla, el foco vuelve a «Publicar», que se había desactivado", async () => {
    mocks.publishDrill.mockResolvedValue(fail("SAVE_FAILED"));
    renderActions();

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await screen.findByRole("alert");
    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar" })).toHaveFocus());
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(heading()).not.toHaveFocus();
  });

  it("si archivar falla, la hoja se cierra y el foco vuelve a «Archivar» de la ficha", async () => {
    mocks.archiveDrill.mockResolvedValue(fail("SAVE_FAILED"));
    renderActions();

    fireEvent.click(within(openSheet()).getByRole("button", { name: "Archivar" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Archivar" })).toHaveFocus());
    expect(screen.getByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("si al repintar ya no queda ningún botón, el mismo aviso y el foco siguen ahí", async () => {
    const repainted = holdRefresh();
    render(<Screen start={{ canPublish: true, canArchive: false }} />);
    const status = screen.getByRole("status");

    fireEvent.click(screen.getByRole("button", { name: "Publicar" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    await act(async () => repainted.finish({ canPublish: false, canArchive: false }));

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Ejercicio publicado."));
    expect(screen.getByRole("status")).toBe(status);
    expect(heading()).toHaveFocus();
  });
});
