import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";

const mocks = vi.hoisted(() => ({
  duplicatePractice: vi.fn(),
  cancelPractice: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/modules/practice/actions", () => ({
  duplicatePractice: mocks.duplicatePractice,
  cancelPractice: mocks.cancelPractice,
}));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import { PracticeActions } from "./practice-actions";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const EVENT = "00000000-0000-4000-8000-0000000000e1";
const COPY_EVENT = "00000000-0000-4000-8000-0000000000e2";
const DEFAULTS = { date: "2026-10-13", time: "18:00" };

function renderActions(props: Partial<Parameters<typeof PracticeActions>[0]> = {}) {
  return render(
    <PracticeActions
      clubSlug="club-a"
      eventId={EVENT}
      canEdit
      duplicateDefaults={DEFAULTS}
      {...props}
    />,
  );
}

const duplicateToggle = () => screen.getByRole("button", { name: "Duplicar" });
const openDuplicate = () => fireEvent.click(duplicateToggle());
const copy = () => fireEvent.click(screen.getByRole("button", { name: "Crear copia" }));
const cancelTrigger = () => screen.getByRole("button", { name: "Cancelar sesión" });
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

/** El diálogo de confirmación, que tarda un turno en pintarse (busca dónde ir). */
const dialog = () => screen.findByRole("alertdialog", { name: "¿Cancelar esta sesión?" });

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
  mocks.duplicatePractice.mockResolvedValue(ok({ eventId: COPY_EVENT }));
  mocks.cancelPractice.mockResolvedValue(ok(null));
});

describe("PracticeActions · qué ofrece", () => {
  it("quien puede editar ve «Editar sesión», «Duplicar» y «Cancelar sesión», en ese orden", () => {
    renderActions();

    const labels = screen.getAllByRole("button").map((button) => button.textContent);
    expect(screen.getByRole("link", { name: "Editar sesión" })).toBeInTheDocument();
    expect(labels).toEqual(["Duplicar", "Cancelar sesión"]);
    expect(
      screen
        .getByRole("link", { name: "Editar sesión" })
        .compareDocumentPosition(duplicateToggle()),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(duplicateToggle().compareDocumentPosition(cancelTrigger())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("sin poder editar (sesión cerrada) solo ofrece «Duplicar»", () => {
    renderActions({ canEdit: false });

    expect(screen.queryByRole("link", { name: "Editar sesión" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar sesión" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(duplicateToggle()).toBeInTheDocument();
  });

  it("«Editar sesión» es el primary de la pantalla y lleva al constructor de esa sesión", () => {
    renderActions();

    const edit = screen.getByRole("link", { name: "Editar sesión" });
    expect(edit).toHaveAttribute("href", `/c/club-a/train/${EVENT}/edit`);
    expect(edit).toHaveClass("bg-brand-accent", "w-full");
  });

  it("«Duplicar» es secondary y «Cancelar sesión» es danger: nunca rellenos", () => {
    renderActions();

    expect(duplicateToggle()).toHaveClass("border-line-strong", "w-full");
    expect(duplicateToggle()).not.toHaveClass("bg-brand-accent");
    expect(cancelTrigger()).toHaveClass("border-danger", "text-danger", "w-full");
  });
});

describe("PracticeActions · duplicar", () => {
  it("es un desplegable, no un modal: cerrado, ni fecha ni hora", () => {
    renderActions();

    expect(duplicateToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Fecha")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hora")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear copia" })).not.toBeInTheDocument();
  });

  it("abre «Fecha» y «Hora» con lo que propone la página, y «Crear copia» como primary del panel", () => {
    renderActions();

    openDuplicate();

    expect(duplicateToggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Fecha")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-10-13");
    expect(screen.getByLabelText("Hora")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("Hora")).toHaveValue("18:00");
    const submit = screen.getByRole("button", { name: "Crear copia" });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toHaveClass("bg-brand-accent", "w-full");
    // El botón apunta al panel que abre.
    expect(duplicateToggle().getAttribute("aria-controls")).toBe(
      screen.getByLabelText("Fecha").closest("form")?.id,
    );
    // No es un diálogo: nada tapa el resto de la pantalla.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("volver a pulsar «Duplicar» lo cierra, y al reabrirlo conserva lo escrito", () => {
    renderActions();

    openDuplicate();
    change("Fecha", "2026-10-20");
    openDuplicate();

    expect(duplicateToggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Fecha")).not.toBeInTheDocument();

    openDuplicate();
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-10-20");
  });

  it("también se duplica una sesión cerrada, sin poder editar", () => {
    renderActions({ canEdit: false });

    openDuplicate();

    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear copia" })).toBeInTheDocument();
  });

  it("«Crear copia» duplica esa sesión en la fecha y la hora elegidas y abre el detalle de la copia", async () => {
    renderActions();

    openDuplicate();
    change("Fecha", "2026-10-15");
    change("Hora", "17:30");
    copy();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.duplicatePractice).toHaveBeenCalledTimes(1);
    expect(mocks.duplicatePractice).toHaveBeenCalledWith("club-a", {
      eventId: EVENT,
      date: "2026-10-15",
      time: "17:30",
    });
    // La copia se identifica por su uuid, nunca por su título.
    expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/train/${COPY_EVENT}`);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("sin tocar nada envía lo que la página proponía", async () => {
    renderActions();

    openDuplicate();
    copy();

    await waitFor(() => expect(mocks.duplicatePractice).toHaveBeenCalledTimes(1));
    expect(mocks.duplicatePractice).toHaveBeenCalledWith("club-a", {
      eventId: EVENT,
      date: "2026-10-13",
      time: "18:00",
    });
  });

  it("mientras copia no se puede enviar otra vez, y tras copiar sigue parado hasta que la página cambia", async () => {
    const pending = deferred<{ eventId: string }>();
    mocks.duplicatePractice.mockReturnValue(pending.promise);
    renderActions();

    openDuplicate();
    copy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear copia" })).toBeDisabled());

    pending.finish(ok({ eventId: COPY_EVENT }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("button", { name: "Crear copia" })).toBeDisabled();
    fireEvent.submit(screen.getByLabelText("Fecha").closest("form") as HTMLFormElement);
    expect(mocks.duplicatePractice).toHaveBeenCalledTimes(1);
  });

  it("si falla, dice por qué dentro del panel, pinta el error de cada campo y conserva lo escrito", async () => {
    mocks.duplicatePractice.mockResolvedValue(fail("INVALID", { date: "Elige una fecha y una hora válidas." }));
    renderActions();

    openDuplicate();
    change("Fecha", "2026-10-14");
    change("Hora", "17:30");
    copy();

    const alert = await screen.findByText(ACTION_ERROR_COPY.INVALID);
    expect(alert.closest('[role="alert"]')).toHaveFocus();
    expect(screen.getByLabelText("Fecha")).toHaveAccessibleDescription("Elige una fecha y una hora válidas.");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-10-14");
    expect(screen.getByLabelText("Hora")).toHaveValue("17:30");
    expect(screen.getByRole("button", { name: "Crear copia" })).toBeEnabled();
    expect(duplicateToggle()).toHaveAttribute("aria-expanded", "true");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("un fallo sin campo (se cayó la llamada) es un SAVE_FAILED sin el mensaje del error", async () => {
    mocks.duplicatePractice.mockRejectedValue(new Error("fallo de red con datos internos"));
    renderActions();

    openDuplicate();
    copy();

    expect(await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).toBeInTheDocument();
    expect(screen.queryByText(/fallo de red/)).not.toBeInTheDocument();
  });
});

describe("PracticeActions · cancelar", () => {
  it("«Cancelar sesión» pregunta antes, con su título y su explicación, y no cancela todavía", async () => {
    renderActions();

    fireEvent.click(cancelTrigger());

    const confirmation = await dialog();
    expect(confirmation).toHaveAccessibleDescription(
      "Dejará de salir en Inicio y en Próximas. Seguirá en el histórico.",
    );
    expect(within(confirmation).getByRole("button", { name: "Volver" })).toBeInTheDocument();
    // La confirmación es destructiva: `danger`, nunca el relleno del acento.
    expect(within(confirmation).getByRole("button", { name: "Cancelar sesión" })).toHaveClass(
      "border-danger",
      "text-danger",
    );
    expect(mocks.cancelPractice).not.toHaveBeenCalled();
  });

  it("«Volver» cierra el diálogo y no cancela nada", async () => {
    renderActions();
    fireEvent.click(cancelTrigger());

    fireEvent.click(within(await dialog()).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.cancelPractice).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(cancelTrigger()).toBeInTheDocument();
  });

  it("Escape tampoco cancela", async () => {
    renderActions();
    fireEvent.click(cancelTrigger());
    await dialog();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.cancelPractice).not.toHaveBeenCalled();
  });

  it("confirmar cancela esa sesión de ese club, cierra el diálogo y repinta la página", async () => {
    renderActions();
    fireEvent.click(cancelTrigger());

    fireEvent.click(within(await dialog()).getByRole("button", { name: "Cancelar sesión" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.cancelPractice).toHaveBeenCalledTimes(1);
    expect(mocks.cancelPractice).toHaveBeenCalledWith("club-a", { eventId: EVENT });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("mientras cancela, el diálogo sigue abierto y sus dos botones esperan: no se cancela dos veces", async () => {
    const pending = deferred<null>();
    mocks.cancelPractice.mockReturnValue(pending.promise);
    renderActions();
    fireEvent.click(cancelTrigger());
    const confirmation = await dialog();

    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancelar sesión" }));

    await waitFor(() => expect(within(confirmation).getByRole("button", { name: "Volver" })).toBeDisabled());
    expect(within(confirmation).getByRole("button", { name: "Cancelar sesión" })).toBeDisabled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();

    pending.finish(ok(null));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.cancelPractice).toHaveBeenCalledTimes(1);
  });

  it("si falla, cierra el diálogo y dice por qué en la página, sin repintar", async () => {
    mocks.cancelPractice.mockResolvedValue(fail("NOT_FOUND"));
    renderActions();
    fireEvent.click(cancelTrigger());

    fireEvent.click(within(await dialog()).getByRole("button", { name: "Cancelar sesión" }));

    expect(await screen.findByText(ACTION_ERROR_COPY.NOT_FOUND)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.refresh).not.toHaveBeenCalled();
    // Y se puede volver a intentar.
    expect(cancelTrigger()).toBeEnabled();
  });

  it("tras un fallo, el diálogo vuelve a abrirse y cancelar vuelve a intentarse", async () => {
    mocks.cancelPractice.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderActions();
    fireEvent.click(cancelTrigger());
    fireEvent.click(within(await dialog()).getByRole("button", { name: "Cancelar sesión" }));
    await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

    fireEvent.click(cancelTrigger());
    fireEvent.click(within(await dialog()).getByRole("button", { name: "Cancelar sesión" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.cancelPractice).toHaveBeenCalledTimes(2);
    // El aviso del intento anterior se quita al volver a intentarlo.
    expect(screen.queryByText(ACTION_ERROR_COPY.SAVE_FAILED)).not.toBeInTheDocument();
  });

  it("si se cae la llamada, es un SAVE_FAILED sin el mensaje del error, y el diálogo se cierra", async () => {
    mocks.cancelPractice.mockRejectedValue(new Error("fallo de red con datos internos"));
    renderActions();
    fireEvent.click(cancelTrigger());

    fireEvent.click(within(await dialog()).getByRole("button", { name: "Cancelar sesión" }));

    expect(await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).toBeInTheDocument();
    expect(screen.queryByText(/fallo de red/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});
