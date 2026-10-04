import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";

const mocks = vi.hoisted(() => ({ createPractice: vi.fn(), updatePracticeMeta: vi.fn(), push: vi.fn() }));

vi.mock("@/modules/practice/actions", () => ({
  createPractice: mocks.createPractice,
  updatePracticeMeta: mocks.updatePracticeMeta,
}));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

import { PracticeForm, type PracticeFormValues } from "./practice-form";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TEAM_A = "00000000-0000-4000-8000-0000000000a1";
const TEAM_B = "00000000-0000-4000-8000-0000000000a2";
const FOCUS_REBOTE = "00000000-0000-4000-8000-0000000000f1";
const FOCUS_TRANSICION = "00000000-0000-4000-8000-0000000000f2";
const EVENT = "00000000-0000-4000-8000-0000000000e1";
const NEW_EVENT = "00000000-0000-4000-8000-0000000000e2";
const UPDATED_AT = "2026-10-04T10:00:00.123456+00:00";
const NEXT_UPDATED_AT = "2026-10-04T10:05:00.654321+00:00";

const ONE_TEAM = [{ id: TEAM_A, name: "Equipo A" }];
const TWO_TEAMS = [...ONE_TEAM, { id: TEAM_B, name: "Equipo B" }];
const FOCUS_AREAS = [
  { id: FOCUS_REBOTE, name: "Rebote" },
  { id: FOCUS_TRANSICION, name: "Transición" },
];

const INITIAL: PracticeFormValues = {
  teamId: TEAM_A,
  title: "",
  date: "2026-10-06",
  time: "18:00",
  durationMinutes: "75",
  primaryFocusId: "",
  secondaryFocusId: "",
  location: "",
  notes: "",
};

type Props = Parameters<typeof PracticeForm>[0];

function renderForm(props: Partial<Props> = {}) {
  const onSaved = vi.fn();
  const view = render(
    <PracticeForm
      clubSlug="club-a"
      options={{ teams: ONE_TEAM, focusAreas: FOCUS_AREAS }}
      initial={INITIAL}
      {...props}
    />,
  );
  return { ...view, onSaved };
}

function renderEdit(overrides: Partial<PracticeFormValues> = {}, props: Partial<Props> = {}) {
  const onSaved = vi.fn();
  const onDirtyChange = vi.fn();
  const onPendingChange = vi.fn();
  const onReload = vi.fn();
  const edit = {
    eventId: EVENT,
    expectedUpdatedAt: UPDATED_AT,
    locked: false,
    onSaved,
    onDirtyChange,
    onPendingChange,
    onReload,
  };
  const element = (next: Partial<Props>) => (
    <PracticeForm
      clubSlug="club-a"
      options={{ teams: TWO_TEAMS, focusAreas: FOCUS_AREAS }}
      initial={{ ...INITIAL, title: "Salida de presión", notes: "Una nota.", ...overrides }}
      edit={edit}
      {...props}
      {...next}
    />
  );
  const view = render(element({}));
  return {
    ...view,
    onSaved,
    onDirtyChange,
    onPendingChange,
    onReload,
    edit,
    update: (next: Partial<Props>) => view.rerender(element(next)),
  };
}

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const create = () => fireEvent.click(screen.getByRole("button", { name: "Crear sesión" }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar datos" }));

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
  mocks.createPractice.mockResolvedValue(ok({ eventId: NEW_EVENT }));
  mocks.updatePracticeMeta.mockResolvedValue(ok({ updatedAt: NEXT_UPDATED_AT }));
});

describe("PracticeForm · nueva sesión", () => {
  it("pide título, fecha, hora, duración, objetivos y lugar, con lo que se le da de partida", () => {
    renderForm();

    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText("Fecha")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-10-06");
    expect(screen.getByLabelText("Hora")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("Hora")).toHaveValue("18:00");
    expect(screen.getByLabelText("Duración (min)")).toHaveAttribute("type", "number");
    expect(screen.getByLabelText("Duración (min)")).toHaveValue(75);
    expect(screen.getByLabelText("Objetivo principal")).toHaveValue("");
    expect(screen.getByLabelText("Objetivo secundario")).toHaveValue("");
    expect(screen.getByLabelText("Lugar")).toHaveValue("");
  });

  it("los campos llevan los límites de la base de datos y de la acción", () => {
    renderForm();

    expect(screen.getByLabelText("Título")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Lugar")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Duración (min)")).toHaveAttribute("min", "15");
    expect(screen.getByLabelText("Duración (min)")).toHaveAttribute("max", "240");
  });

  it("los dos objetivos ofrecen «Sin objetivo» primero y después los del club", () => {
    renderForm();

    for (const label of ["Objetivo principal", "Objetivo secundario"]) {
      const options = within(screen.getByLabelText(label)).getAllByRole("option");
      expect(options.map((option) => option.textContent)).toEqual(["Sin objetivo", "Rebote", "Transición"]);
      expect(options.map((option) => (option as HTMLOptionElement).value)).toEqual([
        "",
        FOCUS_REBOTE,
        FOCUS_TRANSICION,
      ]);
    }
  });

  it("con un solo equipo no pregunta por el equipo", () => {
    renderForm();

    expect(screen.queryByLabelText("Equipo")).not.toBeInTheDocument();
  });

  it("con varios equipos pregunta por el equipo, que parte del que se le da", () => {
    renderForm({ options: { teams: TWO_TEAMS, focusAreas: FOCUS_AREAS } });

    const team = screen.getByLabelText("Equipo");
    expect(team).toHaveValue(TEAM_A);
    expect(within(team).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Equipo A",
      "Equipo B",
    ]);
  });

  it("no pide notas: se escriben al editar", () => {
    renderForm();

    expect(screen.queryByLabelText("Notas")).not.toBeInTheDocument();
  });

  it("«Crear sesión» es el primary de la pantalla, a todo el ancho, y envía el formulario", () => {
    renderForm();

    const button = screen.getByRole("button", { name: "Crear sesión" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveClass("bg-brand-accent", "w-full");
    expect(screen.queryByRole("button", { name: "Guardar datos" })).not.toBeInTheDocument();
  });

  it("crea la sesión con lo escrito, la duración como número, y abre su constructor", async () => {
    renderForm({ options: { teams: TWO_TEAMS, focusAreas: FOCUS_AREAS } });

    change("Equipo", TEAM_B);
    change("Título", "Salida de presión");
    change("Fecha", "2026-10-09");
    change("Hora", "17:30");
    change("Duración (min)", "60");
    change("Objetivo principal", FOCUS_REBOTE);
    change("Objetivo secundario", FOCUS_TRANSICION);
    change("Lugar", "Pabellón 2");
    create();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.createPractice).toHaveBeenCalledTimes(1);
    expect(mocks.createPractice).toHaveBeenCalledWith("club-a", {
      teamId: TEAM_B,
      title: "Salida de presión",
      date: "2026-10-09",
      time: "17:30",
      durationMinutes: 60,
      primaryFocusId: FOCUS_REBOTE,
      secondaryFocusId: FOCUS_TRANSICION,
      location: "Pabellón 2",
    });
    // Al constructor, a añadirle los ejercicios. La sesión se identifica por su uuid, nunca por su título.
    expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/train/${NEW_EVENT}/edit`);
  });

  it("con un solo equipo, el campo no está pero su id se envía igualmente", async () => {
    renderForm();

    change("Título", "Una sesión");
    create();

    await waitFor(() => expect(mocks.createPractice).toHaveBeenCalledTimes(1));
    expect(mocks.createPractice).toHaveBeenCalledWith("club-a", expect.objectContaining({ teamId: TEAM_A }));
  });

  it("sin objetivo se envía el valor vacío del selector, y sin lugar, null", async () => {
    renderForm();

    change("Título", "Una sesión");
    create();

    await waitFor(() => expect(mocks.createPractice).toHaveBeenCalledTimes(1));
    expect(mocks.createPractice).toHaveBeenCalledWith("club-a", {
      teamId: TEAM_A,
      title: "Una sesión",
      date: "2026-10-06",
      time: "18:00",
      durationMinutes: 75,
      primaryFocusId: "",
      secondaryFocusId: "",
      location: null,
    });
  });

  it("un lugar en blanco se envía como null", async () => {
    renderForm();

    change("Título", "Una sesión");
    change("Lugar", "   ");
    create();

    await waitFor(() => expect(mocks.createPractice).toHaveBeenCalledTimes(1));
    expect(mocks.createPractice).toHaveBeenCalledWith("club-a", expect.objectContaining({ location: null }));
  });

  it("una duración vacía no se inventa: la acción la rechaza y el error sale bajo su campo", async () => {
    mocks.createPractice.mockResolvedValue(
      fail("INVALID", { durationMinutes: "La duración tiene que estar entre 15 y 240 minutos." }),
    );
    renderForm();

    change("Título", "Una sesión");
    change("Duración (min)", "");
    create();

    await waitFor(() =>
      expect(screen.getByText("La duración tiene que estar entre 15 y 240 minutos.")).toBeInTheDocument(),
    );
    expect(mocks.createPractice).toHaveBeenCalledWith("club-a", expect.objectContaining({ durationMinutes: 0 }));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("no navega hasta que la acción termina, y mientras tanto no se puede enviar otra vez", async () => {
    const pending = deferred<{ eventId: string }>();
    mocks.createPractice.mockReturnValue(pending.promise);
    renderForm();

    change("Título", "Una sesión");
    create();

    await waitFor(() => expect(screen.getByRole("button", { name: "Crear sesión" })).toBeDisabled());
    expect(mocks.push).not.toHaveBeenCalled();

    pending.finish(ok({ eventId: NEW_EVENT }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  });

  it("tras crear, el botón sigue parado hasta que la página cambia: un segundo toque no crearía otra", async () => {
    renderForm();

    change("Título", "Una sesión");
    create();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("button", { name: "Crear sesión" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Crear sesión" }).closest("form") as HTMLFormElement);
    expect(mocks.createPractice).toHaveBeenCalledTimes(1);
  });
});

describe("PracticeForm · cuando falla", () => {
  it("un INVALID pinta el mensaje de cada campo bajo el suyo y conserva todo lo escrito", async () => {
    mocks.createPractice.mockResolvedValue(
      fail("INVALID", {
        title: "Escribe un título.",
        date: "Elige una fecha.",
        time: "Elige una hora.",
        primaryFocusId: "Elige un objetivo de la lista.",
        secondaryFocusId: "El objetivo secundario tiene que ser distinto del principal.",
        location: "Máximo 80 caracteres.",
      }),
    );
    renderForm();

    change("Título", "");
    change("Fecha", "2026-10-09");
    change("Hora", "17:30");
    change("Duración (min)", "60");
    change("Objetivo principal", FOCUS_REBOTE);
    change("Objetivo secundario", FOCUS_REBOTE);
    change("Lugar", "Pabellón 2");
    create();

    const alert = await screen.findByText(ACTION_ERROR_COPY.INVALID);
    // El aviso se lleva el foco en un efecto, que corre un turno después de pintarse: se espera.
    await waitFor(() => expect(alert.closest('[role="alert"]')).toHaveFocus());

    const under = (label: string, message: string) => {
      const field = screen.getByLabelText(label);
      expect(field).toHaveAttribute("aria-invalid", "true");
      expect(field).toHaveAccessibleDescription(message);
    };
    under("Título", "Escribe un título.");
    under("Fecha", "Elige una fecha.");
    under("Hora", "Elige una hora.");
    under("Objetivo principal", "Elige un objetivo de la lista.");
    under("Objetivo secundario", "El objetivo secundario tiene que ser distinto del principal.");
    under("Lugar", "Máximo 80 caracteres.");

    // Nada de lo escrito se ha perdido, y se puede volver a enviar.
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-10-09");
    expect(screen.getByLabelText("Hora")).toHaveValue("17:30");
    expect(screen.getByLabelText("Duración (min)")).toHaveValue(60);
    expect(screen.getByLabelText("Objetivo principal")).toHaveValue(FOCUS_REBOTE);
    expect(screen.getByLabelText("Objetivo secundario")).toHaveValue(FOCUS_REBOTE);
    expect(screen.getByLabelText("Lugar")).toHaveValue("Pabellón 2");
    expect(screen.getByRole("button", { name: "Crear sesión" })).toBeEnabled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("el error de la duración sale bajo «Duración (min)» y el del equipo bajo «Equipo»", async () => {
    mocks.createPractice.mockResolvedValue(
      fail("INVALID", { durationMinutes: "Mal la duración.", teamId: "Elige un equipo." }),
    );
    renderForm({ options: { teams: TWO_TEAMS, focusAreas: FOCUS_AREAS } });

    change("Título", "Una sesión");
    create();

    await screen.findByText("Mal la duración.");
    expect(screen.getByLabelText("Duración (min)")).toHaveAccessibleDescription("Mal la duración.");
    expect(screen.getByLabelText("Equipo")).toHaveAccessibleDescription("Elige un equipo.");
  });

  it("un fallo sin campo se dice arriba, con el texto de su error, y no se pierde nada", async () => {
    mocks.createPractice.mockResolvedValue(fail("SAVE_FAILED"));
    renderForm();

    change("Título", "Salida de presión");
    change("Lugar", "Pabellón 2");
    create();

    expect(await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("Salida de presión");
    expect(screen.getByLabelText("Lugar")).toHaveValue("Pabellón 2");
    expect(screen.getByRole("button", { name: "Crear sesión" })).toBeEnabled();
    expect(screen.queryByText("Revisa los campos marcados.")).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("si la llamada se cae, es un SAVE_FAILED sin el mensaje del error, y lo escrito sigue ahí", async () => {
    mocks.createPractice.mockRejectedValue(new Error("fallo de red con datos internos"));
    renderForm();

    change("Título", "Salida de presión");
    create();

    expect(await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).toBeInTheDocument();
    expect(screen.queryByText(/fallo de red/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("Salida de presión");
  });

  it("al volver a enviar se quita el aviso anterior", async () => {
    mocks.createPractice.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderForm();

    change("Título", "Una sesión");
    create();
    await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED);

    create();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(ACTION_ERROR_COPY.SAVE_FAILED)).not.toBeInTheDocument();
  });
});

describe("PracticeForm · editar los datos", () => {
  it("no pregunta por el equipo, aunque haya varios, y añade las notas", () => {
    renderEdit();

    expect(screen.queryByLabelText("Equipo")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Notas")).toHaveValue("Una nota.");
    expect(screen.getByLabelText("Notas")).toHaveAttribute("maxlength", "2000");
    expect(screen.getByLabelText("Título")).toHaveValue("Salida de presión");
  });

  it("su botón es «Guardar datos», secondary: el primary de la pantalla es el de guardar la sesión", () => {
    renderEdit();

    const button = screen.getByRole("button", { name: "Guardar datos" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).not.toHaveClass("bg-brand-accent");
    expect(button).toHaveClass("border-line-strong");
    expect(screen.queryByRole("button", { name: "Crear sesión" })).not.toBeInTheDocument();
  });

  it("guarda con la copia esperada y avisa con la nueva, sin salir de la pantalla", async () => {
    const { onSaved } = renderEdit({ primaryFocusId: FOCUS_REBOTE, location: "Pabellón 2" });

    change("Título", "Salida de presión 2");
    change("Hora", "19:00");
    change("Notas", "Otra nota.");
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledWith(NEXT_UPDATED_AT);
    expect(mocks.updatePracticeMeta).toHaveBeenCalledTimes(1);
    expect(mocks.updatePracticeMeta).toHaveBeenCalledWith("club-a", {
      eventId: EVENT,
      expectedUpdatedAt: UPDATED_AT,
      title: "Salida de presión 2",
      date: "2026-10-06",
      time: "19:00",
      durationMinutes: 75,
      primaryFocusId: FOCUS_REBOTE,
      secondaryFocusId: "",
      location: "Pabellón 2",
      notes: "Otra nota.",
    });
    expect(mocks.createPractice).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("unas notas y un lugar vacíos se envían como null", async () => {
    renderEdit({ notes: "" });

    save();

    await waitFor(() => expect(mocks.updatePracticeMeta).toHaveBeenCalledTimes(1));
    expect(mocks.updatePracticeMeta).toHaveBeenCalledWith(
      "club-a",
      expect.objectContaining({ notes: null, location: null }),
    );
  });

  it("dice «Datos guardados.» en una región de estado, y tocar un campo lo quita", async () => {
    renderEdit();
    // La región está siempre en el árbol, vacía: un lector de pantalla solo anuncia lo que cambia dentro.
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    save();

    await waitFor(() => expect(status).toHaveTextContent("Datos guardados."));

    change("Título", "Otro título");
    expect(status).toBeEmptyDOMElement();
  });

  it("el siguiente guardado usa la copia que le da quien lo monta", async () => {
    const { onSaved, update, edit } = renderEdit();

    save();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(NEXT_UPDATED_AT));

    update({ edit: { ...edit, expectedUpdatedAt: NEXT_UPDATED_AT } });
    save();

    await waitFor(() => expect(mocks.updatePracticeMeta).toHaveBeenCalledTimes(2));
    expect(mocks.updatePracticeMeta).toHaveBeenLastCalledWith(
      "club-a",
      expect.objectContaining({ expectedUpdatedAt: NEXT_UPDATED_AT }),
    );
  });

  it("si falla, dice por qué arriba, no avisa de que se guardó y no pierde lo escrito", async () => {
    mocks.updatePracticeMeta.mockResolvedValue(fail("STALE_COPY"));
    const { onSaved } = renderEdit();

    change("Título", "Otro título");
    save();

    expect(await screen.findByText(ACTION_ERROR_COPY.STALE_COPY)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByLabelText("Título")).toHaveValue("Otro título");
    expect(screen.getByRole("button", { name: "Guardar datos" })).toBeEnabled();
  });

  it("los errores de campo salen bajo el suyo, también el de las notas", async () => {
    mocks.updatePracticeMeta.mockResolvedValue(
      fail("INVALID", { title: "Escribe un título.", notes: "Máximo 2000 caracteres." }),
    );
    renderEdit();

    save();

    await screen.findByText("Escribe un título.");
    expect(screen.getByLabelText("Título")).toHaveAccessibleDescription("Escribe un título.");
    expect(screen.getByLabelText("Notas")).toHaveAccessibleDescription("Máximo 2000 caracteres.");
  });

  // Review Focus 2: otra persona guardó antes.
  it("una copia obsoleta ofrece «Recargar», que avisa a quien lo monta; lo escrito sigue ahí", async () => {
    mocks.updatePracticeMeta.mockResolvedValue(fail("STALE_COPY"));
    const { onReload } = renderEdit();

    change("Lugar", "Pabellón 3");
    save();

    const alert = (await screen.findByText(ACTION_ERROR_COPY.STALE_COPY)).closest('[role="alert"]') as HTMLElement;
    const reload = within(alert).getByRole("button", { name: "Recargar" });
    expect(reload).toHaveAttribute("type", "button");
    expect(reload).toHaveClass("border-line-strong");
    expect(screen.getByLabelText("Lugar")).toHaveValue("Pabellón 3");
    expect(onReload).not.toHaveBeenCalled();

    fireEvent.click(reload);

    expect(onReload).toHaveBeenCalledTimes(1);
    // «Recargar» no envía el formulario.
    expect(mocks.updatePracticeMeta).toHaveBeenCalledTimes(1);
  });

  it.each(["SAVE_FAILED", "SESSION_CLOSED", "INVALID"] as const)("un %s no ofrece «Recargar»", async (error) => {
    mocks.updatePracticeMeta.mockResolvedValue(fail(error));
    renderEdit();

    save();

    await screen.findByText(ACTION_ERROR_COPY[error]);
    expect(screen.queryByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
  });
});

describe("PracticeForm · editar los datos · con otro guardado de la pantalla en marcha", () => {
  it("con `locked`, «Guardar datos» espera, también si se envía con Intro, y vuelve al quitarse", () => {
    const { edit, update } = renderEdit();
    update({ edit: { ...edit, locked: true } });

    change("Lugar", "Pabellón 3");
    expect(screen.getByRole("button", { name: "Guardar datos" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Guardar datos" }).closest("form") as HTMLFormElement);
    expect(mocks.updatePracticeMeta).not.toHaveBeenCalled();
    // Lo que se escribe no espera: solo el guardado.
    expect(screen.getByLabelText("Lugar")).toHaveValue("Pabellón 3");

    update({ edit: { ...edit, locked: false } });
    expect(screen.getByRole("button", { name: "Guardar datos" })).toBeEnabled();
  });

  it("avisa a quien lo monta de que está guardando, desde el toque, y de que ha terminado", async () => {
    const pending = deferred<{ updatedAt: string }>();
    mocks.updatePracticeMeta.mockReturnValue(pending.promise);
    const { onPendingChange } = renderEdit();
    expect(onPendingChange).not.toHaveBeenCalledWith(true);

    save();
    // En el mismo toque, sin esperar a ninguna pintura: el otro guardado se cierra ya.
    expect(onPendingChange).toHaveBeenLastCalledWith(true);

    pending.finish(ok({ updatedAt: NEXT_UPDATED_AT }));
    await screen.findByText("Datos guardados.");
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(false));
  });

  it("si el guardado falla, también avisa de que ha terminado", async () => {
    mocks.updatePracticeMeta.mockResolvedValue(fail("SAVE_FAILED"));
    const { onPendingChange } = renderEdit();

    save();

    await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED);
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(false));
    expect(onPendingChange).toHaveBeenCalledWith(true);
  });
});

describe("PracticeForm · editar los datos · cambios sin guardar", () => {
  it("avisa a quien lo monta cuando algo difiere de lo guardado, y cuando vuelve a coincidir", () => {
    const { onDirtyChange } = renderEdit({ location: "Pabellón 2" });
    expect(onDirtyChange).not.toHaveBeenCalled();

    change("Lugar", "Pabellón 3");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    change("Hora", "19:00");
    change("Lugar", "Pabellón 2");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    change("Hora", "18:00");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ["Título", "Otro título"],
    ["Fecha", "2026-10-09"],
    ["Hora", "19:00"],
    ["Duración (min)", "60"],
    ["Objetivo principal", FOCUS_REBOTE],
    ["Objetivo secundario", FOCUS_TRANSICION],
    ["Lugar", "Pabellón 3"],
    ["Notas", "Otra nota."],
  ])("cambiar «%s» cuenta como cambio sin guardar", (label, value) => {
    const { onDirtyChange } = renderEdit();

    change(label, value);

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it("al guardar deja de haberlos: lo enviado es la nueva copia guardada", async () => {
    const { onDirtyChange, onSaved } = renderEdit();

    change("Lugar", "Pabellón 3");
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);

    // Volver a lo de antes de guardar ya es un cambio.
    change("Lugar", "");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    change("Lugar", "Pabellón 3");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it("si falla, los cambios siguen sin guardar", async () => {
    mocks.updatePracticeMeta.mockResolvedValue(fail("SAVE_FAILED"));
    const { onDirtyChange } = renderEdit();

    change("Lugar", "Pabellón 3");
    save();

    await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(onDirtyChange).not.toHaveBeenCalledWith(false);
  });

  it("lo que se escribe mientras guarda sigue sin guardar", async () => {
    const pending = deferred<{ updatedAt: string }>();
    mocks.updatePracticeMeta.mockReturnValue(pending.promise);
    const { onDirtyChange, onSaved } = renderEdit();

    change("Lugar", "Pabellón 3");
    save();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar datos" })).toBeDisabled());
    change("Lugar", "Pabellón 4");
    pending.finish(ok({ updatedAt: NEXT_UPDATED_AT }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByLabelText("Lugar")).toHaveValue("Pabellón 4");
  });
});
