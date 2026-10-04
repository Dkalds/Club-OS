import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const DRILL_ID = "00000000-0000-4000-8000-0000000000d1";

type Props = Partial<{ canPublish: boolean; canArchive: boolean }>;

function renderActions(props: Props = {}) {
  return render(
    <DrillAdminActions
      clubSlug="club-a"
      drillId={DRILL_ID}
      canPublish={props.canPublish ?? true}
      canArchive={props.canArchive ?? true}
    />,
  );
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
  it("sin permiso para nada no pinta nada", () => {
    const { container } = renderActions({ canPublish: false, canArchive: false });

    expect(container).toBeEmptyDOMElement();
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
    expect(screen.getByRole("status")).toHaveTextContent("Ejercicio archivado.");
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
