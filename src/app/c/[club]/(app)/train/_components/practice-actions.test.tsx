import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";

const mocks = vi.hoisted(() => ({
  duplicatePractice: vi.fn(),
  cancelPractice: vi.fn(),
  resetLiveProgress: vi.fn(),
  savePracticeAsTemplate: vi.fn(),
  clearLiveState: vi.fn(),
  cancelLiveSync: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/modules/practice/actions", () => ({
  duplicatePractice: mocks.duplicatePractice,
  cancelPractice: mocks.cancelPractice,
  resetLiveProgress: mocks.resetLiveProgress,
  savePracticeAsTemplate: mocks.savePracticeAsTemplate,
}));
vi.mock("@/modules/live/storage", () => ({
  clearLiveState: mocks.clearLiveState,
}));
vi.mock("@/modules/live/sync", () => ({ cancelLiveSync: mocks.cancelLiveSync }));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import { PracticeActions } from "./practice-actions";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const EVENT = "00000000-0000-4000-8000-0000000000e1";
const COPY_EVENT = "00000000-0000-4000-8000-0000000000e2";
const TEMPLATE = "00000000-0000-4000-8000-0000000000c1";
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
  mocks.resetLiveProgress.mockResolvedValue(ok({ updatedAt: "2026-10-04T10:05:00.654321+00:00" }));
  mocks.savePracticeAsTemplate.mockResolvedValue(ok({ templateId: TEMPLATE }));
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
    // Nunca apunta a un id que no está en el documento: sin panel, sin `aria-controls`.
    expect(duplicateToggle()).not.toHaveAttribute("aria-controls");
    expect(screen.queryByLabelText("Fecha")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hora")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear copia" })).not.toBeInTheDocument();
  });

  it("abre «Fecha» y «Hora» con lo que propone la página, y «Crear copia» es secondary: lo principal es «Editar sesión»", () => {
    renderActions();

    openDuplicate();

    expect(duplicateToggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Fecha")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-10-13");
    expect(screen.getByLabelText("Hora")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("Hora")).toHaveValue("18:00");
    const submit = screen.getByRole("button", { name: "Crear copia" });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toHaveClass("border-line-strong", "w-full");
    expect(submit).not.toHaveClass("bg-brand-accent");
    // El botón apunta al panel que abre, que está en el documento.
    const panelId = duplicateToggle().getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(screen.getByLabelText("Fecha").closest("form")?.id).toBe(panelId);
    expect(document.getElementById(panelId as string)).toBeInTheDocument();
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

  it("al cerrarlo, el botón deja de apuntar al panel", () => {
    renderActions();

    openDuplicate();
    openDuplicate();

    expect(duplicateToggle()).not.toHaveAttribute("aria-controls");
  });

  it("también se duplica una sesión cerrada, sin poder editar, y entonces «Crear copia» es el primary", () => {
    renderActions({ canEdit: false });

    openDuplicate();

    expect(screen.getByLabelText("Fecha")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Crear copia" });
    expect(submit).toHaveClass("bg-brand-accent", "w-full");
    expect(submit).not.toHaveClass("border-line-strong");
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
    // El aviso se lleva el foco en un efecto, que corre un turno después de pintarse: se espera.
    await waitFor(() => expect(alert.closest('[role="alert"]')).toHaveFocus());
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

describe("PracticeActions · iniciar entrenamiento", () => {
  it("no aparece si la sesión no es scheduled", () => {
    renderActions({ status: "done", itemCount: 4 });
    expect(screen.queryByRole("link", { name: /iniciar|continuar/i })).not.toBeInTheDocument();
  });

  it("no aparece si la sesión no tiene ítems", () => {
    renderActions({ status: "scheduled", itemCount: 0 });
    expect(screen.queryByRole("link", { name: /iniciar|continuar/i })).not.toBeInTheDocument();
  });

  it("aparece «Iniciar entrenamiento» como enlace primary, y «Editar sesión» pasa a secondary", () => {
    renderActions({ status: "scheduled", itemCount: 4 });

    const iniciar = screen.getByRole("link", { name: "Iniciar entrenamiento" });
    expect(iniciar).toHaveClass("bg-brand-accent", "w-full");
    expect(iniciar).toHaveAttribute("href", `/c/club-a/train/${EVENT}/live`);

    const editLink = screen.getByRole("link", { name: "Editar sesión" });
    expect(editLink).toHaveClass("border-line-strong", "w-full");
    expect(editLink).not.toHaveClass("bg-brand-accent");
  });

  it("sin empezar no dice por dónde va ni ofrece empezar de nuevo", () => {
    renderActions({ status: "scheduled", itemCount: 4 });

    expect(screen.queryByText(/^Ejercicio \d+ de \d+$/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Empezar de nuevo" })).not.toBeInTheDocument();
  });
});

describe("PracticeActions · continuar entrenamiento", () => {
  const inProgress = { status: "scheduled", itemCount: 5, live: { started: true, position: 2 } } as const;

  it("con la sesión en curso el enlace dice «Continuar entrenamiento» y por qué ejercicio va", () => {
    renderActions(inProgress);

    const continuar = screen.getByRole("link", { name: "Continuar entrenamiento" });
    expect(continuar).toHaveAttribute("href", `/c/club-a/train/${EVENT}/live`);
    expect(screen.getByText("Ejercicio 3 de 5")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Iniciar entrenamiento" })).not.toBeInTheDocument();
  });

  it("no mira lo que guarda el dispositivo: lo decide lo que dice el servidor", () => {
    renderActions({ status: "scheduled", itemCount: 5, live: { started: false, position: null } });

    expect(screen.getByRole("link", { name: "Iniciar entrenamiento" })).toBeInTheDocument();
  });

  it("«Empezar de nuevo» pregunta antes y no borra nada hasta confirmar", async () => {
    renderActions(inProgress);

    fireEvent.click(screen.getByRole("button", { name: "Empezar de nuevo" }));

    const restart = await screen.findByRole("alertdialog", { name: "¿Empezar de nuevo?" });
    expect(restart).toHaveTextContent("Se borra el progreso de esta sesión. No se puede deshacer.");
    expect(mocks.resetLiveProgress).not.toHaveBeenCalled();

    fireEvent.click(within(restart).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.resetLiveProgress).not.toHaveBeenCalled();
    expect(mocks.clearLiveState).not.toHaveBeenCalled();
  });

  it("al confirmar reinicia en el servidor, borra lo del dispositivo y vuelve a pedir la página", async () => {
    renderActions(inProgress);

    fireEvent.click(screen.getByRole("button", { name: "Empezar de nuevo" }));
    const restart = await screen.findByRole("alertdialog", { name: "¿Empezar de nuevo?" });
    fireEvent.click(within(restart).getByRole("button", { name: "Empezar de nuevo" }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(mocks.resetLiveProgress).toHaveBeenCalledWith("club-a", { eventId: EVENT });
    expect(mocks.clearLiveState).toHaveBeenCalledWith(EVENT);
    // Un envío del directo que siguiera reintentándose se cancela ANTES de reiniciar: si
    // llegara después, dejaría la sesión otra vez empezada.
    expect(mocks.cancelLiveSync).toHaveBeenCalledWith(EVENT);
    expect(mocks.cancelLiveSync.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.resetLiveProgress.mock.invocationCallOrder[0] ?? 0,
    );
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("si reiniciar falla, lo dice y no borra lo del dispositivo", async () => {
    mocks.resetLiveProgress.mockResolvedValue(fail("SESSION_CLOSED"));
    renderActions(inProgress);

    fireEvent.click(screen.getByRole("button", { name: "Empezar de nuevo" }));
    const restart = await screen.findByRole("alertdialog", { name: "¿Empezar de nuevo?" });
    fireEvent.click(within(restart).getByRole("button", { name: "Empezar de nuevo" }));

    expect(await screen.findByText(ACTION_ERROR_COPY.SESSION_CLOSED)).toBeInTheDocument();
    expect(mocks.clearLiveState).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("una sesión hecha no ofrece empezar de nuevo", () => {
    renderActions({ status: "done", canEdit: false, itemCount: 5, live: { started: true, position: 4 } });

    expect(screen.queryByRole("button", { name: "Empezar de nuevo" })).not.toBeInTheDocument();
  });
});

describe("PracticeActions · guardar como plantilla", () => {
  const templateButton = () => screen.getByRole("button", { name: "Guardar como plantilla" });
  const queryTemplateButton = () => screen.queryByRole("button", { name: "Guardar como plantilla" });
  const saveTemplate = () => fireEvent.click(templateButton());
  const savedNotice = () => screen.getByText("Plantilla guardada.");

  describe("cuándo se ofrece", () => {
    it.each([
      ["programada, pudiendo editar", { status: "scheduled", canEdit: true }],
      ["programada, sin poder editar", { status: "scheduled", canEdit: false }],
      ["hecha", { status: "done", canEdit: false }],
      ["cancelada", { status: "cancelled", canEdit: false }],
      // `canEdit` es de la sesión y lo decide la página: aquí no lo condiciona en ningún estado.
      ["hecha, con `canEdit`", { status: "done", canEdit: true }],
      ["cancelada, con `canEdit`", { status: "cancelled", canEdit: true }],
    ] as const)("una sesión %s con ejercicios la ofrece", (_what, props) => {
      renderActions({ ...props, itemCount: 4 });

      expect(templateButton()).toBeEnabled();
    });

    it("sin `status` (quien lo monta no lo dice) también, si tiene ejercicios", () => {
      renderActions({ itemCount: 1 });

      expect(templateButton()).toBeEnabled();
    });

    it.each([
      ["programada", { status: "scheduled", canEdit: true }],
      ["hecha", { status: "done", canEdit: false }],
      ["cancelada", { status: "cancelled", canEdit: false }],
    ] as const)("una sesión %s sin ejercicios no: no habría nada que copiar", (_what, props) => {
      renderActions({ ...props, itemCount: 0 });

      expect(queryTemplateButton()).not.toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("sin `itemCount` no se ofrece: lo normal es no tener ejercicios", () => {
      renderActions();

      expect(queryTemplateButton()).not.toBeInTheDocument();
    });

    it("es secondary a todo el ancho, y va entre «Duplicar» y «Cancelar sesión»", () => {
      renderActions({ status: "scheduled", itemCount: 4 });

      expect(templateButton()).toHaveClass("border-line-strong", "w-full");
      expect(templateButton()).not.toHaveClass("bg-brand-accent");
      expect(templateButton()).toHaveAttribute("type", "button");
      expect(duplicateToggle().compareDocumentPosition(templateButton())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(templateButton().compareDocumentPosition(cancelTrigger())).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("en una sesión cerrada es lo último, tras «Duplicar»", () => {
      renderActions({ status: "done", canEdit: false, itemCount: 4 });

      expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
        "Duplicar",
        "Guardar como plantilla",
      ]);
    });

    it("no guarda nada hasta que se pulsa, y su región de estado ya está en el árbol, vacía", () => {
      renderActions({ status: "scheduled", itemCount: 4 });

      // Un lector de pantalla solo anuncia lo que cambia dentro de una región que ya existía.
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(screen.queryByRole("link", { name: "Ver plantillas" })).not.toBeInTheDocument();
      expect(mocks.savePracticeAsTemplate).not.toHaveBeenCalled();
    });
  });

  describe("al guardar", () => {
    it("guarda esa sesión de ese club como plantilla, y lo dice con el enlace a «Plantillas»", async () => {
      renderActions({ status: "scheduled", itemCount: 4 });
      const region = screen.getByRole("status");

      saveTemplate();

      const notice = await screen.findByText("Plantilla guardada.");
      expect(mocks.savePracticeAsTemplate).toHaveBeenCalledTimes(1);
      expect(mocks.savePracticeAsTemplate).toHaveBeenCalledWith("club-a", { eventId: EVENT });
      // En la región que ya estaba, no en una nueva.
      expect(region).toContainElement(notice);
      const link = within(region).getByRole("link", { name: "Ver plantillas" });
      expect(link).toHaveAttribute("href", "/c/club-a/train?scope=templates");
      // El enlace mide lo que un área táctil.
      expect(link).toHaveClass("min-h-(--target-min)");
      // No sale de la pantalla ni la repinta: quien quiera ir a «Plantillas», pulsa el enlace.
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("guardada, el botón se queda parado: un segundo toque no guarda otra igual", async () => {
      renderActions({ status: "done", canEdit: false, itemCount: 4 });

      saveTemplate();
      await screen.findByText("Plantilla guardada.");

      expect(templateButton()).toBeDisabled();
      saveTemplate();
      saveTemplate();
      expect(mocks.savePracticeAsTemplate).toHaveBeenCalledTimes(1);
      expect(savedNotice()).toBeInTheDocument();
    });

    it("mientras guarda está parado, sin decir aún que se ha guardado", async () => {
      const pending = deferred<{ templateId: string }>();
      mocks.savePracticeAsTemplate.mockReturnValue(pending.promise);
      renderActions({ status: "scheduled", itemCount: 4 });

      saveTemplate();

      await waitFor(() => expect(templateButton()).toBeDisabled());
      expect(screen.queryByText("Plantilla guardada.")).not.toBeInTheDocument();
      saveTemplate();
      expect(mocks.savePracticeAsTemplate).toHaveBeenCalledTimes(1);

      pending.finish(ok({ templateId: TEMPLATE }));
      await screen.findByText("Plantilla guardada.");
      expect(templateButton()).toBeDisabled();
      expect(mocks.savePracticeAsTemplate).toHaveBeenCalledTimes(1);
    });

    it("las demás acciones siguen ahí mientras guarda y después", async () => {
      renderActions({ status: "scheduled", itemCount: 4 });

      saveTemplate();
      await screen.findByText("Plantilla guardada.");

      expect(duplicateToggle()).toBeEnabled();
      expect(cancelTrigger()).toBeEnabled();
      expect(screen.getByRole("link", { name: "Editar sesión" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Iniciar entrenamiento" })).toBeInTheDocument();
    });
  });

  describe("cuando falla", () => {
    it("con 50 plantillas lo dice, no la da por guardada y el botón vuelve a estar disponible", async () => {
      mocks.savePracticeAsTemplate.mockResolvedValue(fail("TEMPLATE_LIMIT"));
      renderActions({ status: "scheduled", itemCount: 4 });

      saveTemplate();

      const alert = (await screen.findByText(ACTION_ERROR_COPY.TEMPLATE_LIMIT)).closest('[role="alert"]');
      expect(ACTION_ERROR_COPY.TEMPLATE_LIMIT).toBe("Ya tienes 50 plantillas, el máximo. Borra alguna para guardar otra.");
      // El aviso va justo debajo de su botón, y se lleva el foco.
      expect(templateButton().nextElementSibling).toBe(alert);
      await waitFor(() => expect(alert).toHaveFocus());
      expect(templateButton()).toBeEnabled();
      expect(screen.queryByText("Plantilla guardada.")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Ver plantillas" })).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("tras un fallo se puede volver a intentar: el aviso se quita y, si va bien, lo dice", async () => {
      mocks.savePracticeAsTemplate.mockResolvedValueOnce(fail("TEMPLATE_LIMIT"));
      renderActions({ status: "scheduled", itemCount: 4 });
      saveTemplate();
      await screen.findByText(ACTION_ERROR_COPY.TEMPLATE_LIMIT);

      saveTemplate();

      await screen.findByText("Plantilla guardada.");
      expect(mocks.savePracticeAsTemplate).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(ACTION_ERROR_COPY.TEMPLATE_LIMIT)).not.toBeInTheDocument();
      expect(templateButton()).toBeDisabled();
    });

    it("una sesión que ya no se encuentra lo dice igual", async () => {
      mocks.savePracticeAsTemplate.mockResolvedValue(fail("NOT_FOUND"));
      renderActions({ status: "cancelled", canEdit: false, itemCount: 4 });

      saveTemplate();

      expect(await screen.findByText(ACTION_ERROR_COPY.NOT_FOUND)).toBeInTheDocument();
      expect(templateButton()).toBeEnabled();
    });

    it("si se cae la llamada, es un SAVE_FAILED sin el mensaje del error", async () => {
      mocks.savePracticeAsTemplate.mockRejectedValue(new Error("fallo de red con datos internos"));
      renderActions({ status: "scheduled", itemCount: 4 });

      saveTemplate();

      expect(await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).toBeInTheDocument();
      expect(screen.queryByText(/fallo de red/)).not.toBeInTheDocument();
      expect(templateButton()).toBeEnabled();
    });

    it("su aviso no tapa el de cancelar, ni el de cancelar tapa el suyo", async () => {
      mocks.cancelPractice.mockResolvedValue(fail("NOT_FOUND"));
      mocks.savePracticeAsTemplate.mockResolvedValue(fail("TEMPLATE_LIMIT"));
      renderActions({ status: "scheduled", itemCount: 4 });

      // Primero falla cancelar…
      fireEvent.click(cancelTrigger());
      fireEvent.click(within(await dialog()).getByRole("button", { name: "Cancelar sesión" }));
      await screen.findByText(ACTION_ERROR_COPY.NOT_FOUND);
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());

      // …y después guardar la plantilla: los dos avisos a la vez, cada uno bajo su botón.
      saveTemplate();
      await screen.findByText(ACTION_ERROR_COPY.TEMPLATE_LIMIT);

      expect(screen.getByText(ACTION_ERROR_COPY.NOT_FOUND)).toBeInTheDocument();
      expect(screen.getAllByRole("alert")).toHaveLength(2);
      expect(templateButton().nextElementSibling).toHaveTextContent(ACTION_ERROR_COPY.TEMPLATE_LIMIT);
      expect(cancelTrigger().nextElementSibling).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);

      // Volver a intentar cancelar quita su aviso, no el de la plantilla.
      mocks.cancelPractice.mockResolvedValue(ok(null));
      fireEvent.click(cancelTrigger());
      fireEvent.click(within(await dialog()).getByRole("button", { name: "Cancelar sesión" }));
      await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(screen.queryByText(ACTION_ERROR_COPY.NOT_FOUND)).not.toBeInTheDocument();
      expect(screen.getByText(ACTION_ERROR_COPY.TEMPLATE_LIMIT)).toBeInTheDocument();
    });

    it("tampoco tapa el de duplicar, ni que la plantilla se guarde borra el de duplicar", async () => {
      mocks.duplicatePractice.mockResolvedValue(fail("INVALID", { date: "Elige una fecha y una hora válidas." }));
      renderActions({ status: "done", canEdit: false, itemCount: 4 });
      openDuplicate();
      copy();
      await screen.findByText(ACTION_ERROR_COPY.INVALID);

      saveTemplate();
      await screen.findByText("Plantilla guardada.");

      expect(screen.getByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
      expect(screen.getByLabelText("Fecha")).toHaveAccessibleDescription("Elige una fecha y una hora válidas.");
      expect(screen.getByRole("button", { name: "Crear copia" })).toBeEnabled();
    });
  });
});
