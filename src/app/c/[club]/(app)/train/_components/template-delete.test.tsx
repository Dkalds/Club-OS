import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";

const mocks = vi.hoisted(() => ({
  deletePracticeTemplate: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/modules/practice/actions", () => ({ deletePracticeTemplate: mocks.deletePracticeTemplate }));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import { TemplateDelete } from "./template-delete";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TEMPLATE = "00000000-0000-4000-8000-0000000000c1";
const TEMPLATES = "/c/club-a/train?scope=templates";

function renderDelete() {
  return render(<TemplateDelete clubSlug="club-a" templateId={TEMPLATE} />);
}

/** El botón de la página; el del diálogo se llama igual y se busca dentro de él. */
const trigger = () => screen.getByRole("button", { name: "Borrar plantilla" });

/** El diálogo de confirmación, que tarda un turno en pintarse (busca dónde ir). */
const dialog = () => screen.findByRole("alertdialog", { name: "¿Borrar esta plantilla?" });

const confirmIn = (confirmation: HTMLElement) =>
  fireEvent.click(within(confirmation).getByRole("button", { name: "Borrar plantilla" }));

/** Una acción que no termina hasta que el test lo diga. */
function deferred<T>() {
  let finish: (result: ActionResult<T>) => void = () => {};
  const promise = new Promise<ActionResult<T>>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.deletePracticeTemplate.mockResolvedValue(ok(null));
});

describe("TemplateDelete · el botón", () => {
  it("«Borrar plantilla» es danger a todo el ancho, nunca relleno, y de entrada no hay diálogo", () => {
    renderDelete();

    expect(trigger()).toHaveClass("border-danger", "text-danger", "w-full");
    expect(trigger()).not.toHaveClass("bg-brand-accent");
    expect(trigger()).toHaveAttribute("type", "button");
    expect(trigger()).toBeEnabled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.deletePracticeTemplate).not.toHaveBeenCalled();
  });
});

describe("TemplateDelete · la pregunta", () => {
  it("pregunta antes, con su título y su explicación, y no borra todavía", async () => {
    renderDelete();

    fireEvent.click(trigger());

    const confirmation = await dialog();
    expect(confirmation).toHaveAccessibleDescription(
      "Las sesiones que creaste con ella no cambian. No se puede deshacer.",
    );
    expect(within(confirmation).getByRole("button", { name: "Volver" })).toBeInTheDocument();
    // La confirmación es destructiva: `danger`, nunca el relleno del acento.
    expect(within(confirmation).getByRole("button", { name: "Borrar plantilla" })).toHaveClass(
      "border-danger",
      "text-danger",
    );
    expect(mocks.deletePracticeTemplate).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("«Volver» cierra el diálogo y no borra ni navega", async () => {
    renderDelete();
    fireEvent.click(trigger());

    fireEvent.click(within(await dialog()).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deletePracticeTemplate).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    // Y se puede volver a preguntar.
    expect(trigger()).toBeEnabled();
  });

  it("Escape tampoco borra", async () => {
    renderDelete();
    fireEvent.click(trigger());
    await dialog();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deletePracticeTemplate).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("TemplateDelete · borrar", () => {
  it("confirmar borra esa plantilla de ese club, cierra el diálogo y vuelve a «Plantillas»", async () => {
    renderDelete();
    fireEvent.click(trigger());

    confirmIn(await dialog());

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.deletePracticeTemplate).toHaveBeenCalledTimes(1);
    expect(mocks.deletePracticeTemplate).toHaveBeenCalledWith("club-a", { templateId: TEMPLATE });
    expect(mocks.push).toHaveBeenCalledWith(TEMPLATES);
    expect(mocks.refresh).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mientras borra, el diálogo sigue abierto y sus dos botones esperan: no se borra dos veces", async () => {
    const pending = deferred<null>();
    mocks.deletePracticeTemplate.mockReturnValue(pending.promise);
    renderDelete();
    fireEvent.click(trigger());
    const confirmation = await dialog();

    confirmIn(confirmation);

    await waitFor(() => expect(within(confirmation).getByRole("button", { name: "Volver" })).toBeDisabled());
    expect(within(confirmation).getByRole("button", { name: "Borrar plantilla" })).toBeDisabled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    // Ni un segundo toque ni Escape hacen nada mientras tanto.
    confirmIn(confirmation);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    pending.finish(ok(null));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deletePracticeTemplate).toHaveBeenCalledTimes(1);
  });

  it("tras borrarla, el botón se queda parado hasta que la página cambia: ya no hay nada que borrar", async () => {
    renderDelete();
    fireEvent.click(trigger());
    confirmIn(await dialog());
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    expect(trigger()).toBeDisabled();
    fireEvent.click(trigger());

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.deletePracticeTemplate).toHaveBeenCalledTimes(1);
  });
});

describe("TemplateDelete · cuando falla", () => {
  it("si falla, cierra el diálogo, dice por qué en la página y no navega", async () => {
    mocks.deletePracticeTemplate.mockResolvedValue(fail("NOT_FOUND"));
    renderDelete();
    fireEvent.click(trigger());

    confirmIn(await dialog());

    const alert = (await screen.findByText(ACTION_ERROR_COPY.NOT_FOUND)).closest('[role="alert"]');
    expect(alert).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    // Y se puede volver a intentar.
    expect(trigger()).toBeEnabled();
  });

  it("tras un fallo, el diálogo vuelve a abrirse y borrar vuelve a intentarse", async () => {
    mocks.deletePracticeTemplate.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderDelete();
    fireEvent.click(trigger());
    confirmIn(await dialog());
    await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    fireEvent.click(trigger());
    confirmIn(await dialog());

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(TEMPLATES));
    expect(mocks.deletePracticeTemplate).toHaveBeenCalledTimes(2);
    // El aviso del intento anterior se quita al volver a intentarlo.
    expect(screen.queryByText(ACTION_ERROR_COPY.SAVE_FAILED)).not.toBeInTheDocument();
  });

  it("si se cae la llamada, es un SAVE_FAILED sin el mensaje del error, y el diálogo se cierra", async () => {
    mocks.deletePracticeTemplate.mockRejectedValue(new Error("fallo de red con datos internos"));
    renderDelete();
    fireEvent.click(trigger());

    confirmIn(await dialog());

    expect(await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).toBeInTheDocument();
    expect(screen.queryByText(/fallo de red/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.push).not.toHaveBeenCalled();
    expect(trigger()).toBeEnabled();
  });
});
