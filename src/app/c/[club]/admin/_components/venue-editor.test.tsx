import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { Venue } from "@/modules/calendar/types";

const mocks = vi.hoisted(() => ({
  createVenue: vi.fn(),
  renameVenue: vi.fn(),
  deleteVenue: vi.fn(),
}));

vi.mock("@/modules/calendar/actions", () => ({
  createVenue: mocks.createVenue,
  renameVenue: mocks.renameVenue,
  deleteVenue: mocks.deleteVenue,
}));

import { VenueEditor } from "./venue-editor";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ID = "00000000-0000-4000-8000-000000000001";
const NEW_ID = "00000000-0000-4000-8000-0000000000aa";

function venue(overrides: Partial<Venue> = {}): Venue {
  return { id: ID, name: "Pista 1", usedBy: [], ...overrides };
}

function renderExisting(overrides: Partial<Venue> = {}) {
  return render(<VenueEditor clubSlug="club-a" venue={venue(overrides)} />);
}

const type = (text: string) => fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: text } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Crear pista" }));

const DUPLICATE = "Ya hay una pista con ese nombre.";
/** El arranque de lo que dice la pista que usa algún horario, en vez de ofrecer borrarla. */
const IN_USE = /^No se puede borrar: la usa el horario de /;
const DELETE_TITLE = "¿Borrar la pista Pista 1?";
const askDelete = () => fireEvent.click(screen.getByRole("button", { name: "Borrar pista" }));
async function confirmDelete() {
  const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
  fireEvent.click(within(dialog).getByRole("button", { name: "Borrar pista" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createVenue.mockResolvedValue(ok({ id: NEW_ID }));
  mocks.renameVenue.mockResolvedValue(ok(null));
  mocks.deleteVenue.mockResolvedValue(ok(null));
});

describe("VenueEditor · una pista nueva", () => {
  it("es el alta: su encabezado da nombre al formulario, con el nombre vacío", () => {
    render(<VenueEditor clubSlug="club-a" />);

    // Un `<h3>`: el alta va dentro del apartado «Pistas» de la página, que es su `<h2>`.
    expect(screen.getByRole("heading", { level: 3, name: "Nueva pista" })).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Nueva pista" });
    expect(within(form).getByLabelText("Nombre")).toHaveValue("");
  });

  it("el nombre dice su tope y lleva un ejemplo", () => {
    render(<VenueEditor clubSlug="club-a" />);

    const name = screen.getByLabelText("Nombre");
    expect(name).toHaveAttribute("maxlength", "60");
    expect(name).toHaveAccessibleDescription("Por ejemplo, Pabellón 2.");
  });

  it("«Crear pista» es el botón principal, y el alta no se puede borrar", () => {
    render(<VenueEditor clubSlug="club-a" />);

    expect(screen.getByRole("button", { name: "Crear pista" })).toHaveClass("bg-brand-accent");
    expect(screen.queryByRole("button", { name: "Borrar pista" })).not.toBeInTheDocument();
    expect(screen.queryByText(IN_USE)).not.toBeInTheDocument();
  });

  it("crea con lo escrito, en el club de la página", async () => {
    render(<VenueEditor clubSlug="club-a" />);

    type("Pista 2");
    create();

    await screen.findByText("Pista creada.");
    expect(mocks.createVenue).toHaveBeenCalledTimes(1);
    expect(mocks.createVenue).toHaveBeenCalledWith("club-a", { name: "Pista 2" });
    expect(mocks.renameVenue).not.toHaveBeenCalled();
  });

  it("tras crear, vacía el nombre y vuelve a él, lista para la siguiente", async () => {
    render(<VenueEditor clubSlug="club-a" />);

    type("Pista 2");
    create();

    await screen.findByText("Pista creada.");
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText("Nombre")).toHaveFocus());
  });

  it("la confirmación se anuncia en la región de estado, que ya estaba ahí", async () => {
    render(<VenueEditor clubSlug="club-a" />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();

    type("Pista 2");
    create();

    await waitFor(() => expect(status).toHaveTextContent("Pista creada."));
  });

  it("el nombre vacío lo rechaza la acción: el aviso general y el error bajo el campo, enlazado", async () => {
    mocks.createVenue.mockResolvedValue(fail("INVALID", { name: "Escribe un nombre." }));
    render(<VenueEditor clubSlug="club-a" />);

    create();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    const field = screen.getByLabelText("Nombre");
    const message = screen.getByText("Escribe un nombre.");
    expect(mocks.createVenue).toHaveBeenCalledWith("club-a", { name: "" });
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
    expect(screen.queryByText("Pista creada.")).not.toBeInTheDocument();
  });

  it("un nombre repetido se dice bajo el nombre, y no vacía lo escrito", async () => {
    mocks.createVenue.mockResolvedValue(fail("INVALID", { name: DUPLICATE }));
    render(<VenueEditor clubSlug="club-a" />);

    type("Pista 1");
    create();

    const message = await screen.findByText(DUPLICATE);
    expect(screen.getByLabelText("Nombre").getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
    expect(screen.getByLabelText("Nombre")).toHaveValue("Pista 1");
  });

  it("el aviso de creada se quita al escribir la siguiente", async () => {
    render(<VenueEditor clubSlug="club-a" />);

    type("Pista 2");
    create();
    await screen.findByText("Pista creada.");
    type("P");

    expect(screen.queryByText("Pista creada.")).not.toBeInTheDocument();
  });

  it("al reintentar, el error del intento anterior desaparece", async () => {
    mocks.createVenue.mockResolvedValueOnce(fail("INVALID", { name: DUPLICATE }));
    render(<VenueEditor clubSlug="club-a" />);

    type("Pista 1");
    create();
    await screen.findByText(DUPLICATE);
    type("Pista 2");
    create();

    await screen.findByText("Pista creada.");
    expect(screen.queryByText(DUPLICATE)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mientras crea, el botón espera y no se lanza un segundo alta", async () => {
    let finish: (result: ActionResult<{ id: string }>) => void = () => {};
    mocks.createVenue.mockReturnValue(
      new Promise<ActionResult<{ id: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    render(<VenueEditor clubSlug="club-a" />);

    type("Pista 2");
    create();
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear pista" })).toBeDisabled());
    create();
    expect(mocks.createVenue).toHaveBeenCalledTimes(1);

    finish(ok({ id: NEW_ID }));
    await screen.findByText("Pista creada.");
  });

  it("si la acción lanza, lo dice sin el error técnico y no vacía lo escrito", async () => {
    mocks.createVenue.mockRejectedValue(new Error("fetch failed"));
    render(<VenueEditor clubSlug="club-a" />);

    type("Pista 2");
    create();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Pista 2");
  });
});

describe("VenueEditor · una pista que existe", () => {
  it("la card se llama como la pista y empieza con su nombre", () => {
    renderExisting();

    expect(screen.getByRole("heading", { level: 3, name: "Pista 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Pista 1");
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("maxlength", "60");
  });

  it("el nombre ya no lleva el ejemplo del alta", () => {
    renderExisting();

    expect(screen.getByLabelText("Nombre")).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText("Por ejemplo, Pabellón 2.")).not.toBeInTheDocument();
  });

  it("«Guardar» es secondary y lo describe el nombre de la pista; su formulario no es un punto de referencia", () => {
    renderExisting();

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).not.toHaveClass("bg-brand-accent");
    expect(button).toHaveAccessibleDescription("Pista 1");
    expect(screen.queryByRole("button", { name: "Crear pista" })).not.toBeInTheDocument();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("cambia el nombre de esa pista, con su id", async () => {
    renderExisting();

    type("Pista central");
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.renameVenue).toHaveBeenCalledTimes(1);
    expect(mocks.renameVenue).toHaveBeenCalledWith("club-a", { id: ID, name: "Pista central" });
    expect(mocks.createVenue).not.toHaveBeenCalled();
  });

  it("guardar sin tocar nada manda el nombre que había", async () => {
    renderExisting();

    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.renameVenue).toHaveBeenCalledWith("club-a", { id: ID, name: "Pista 1" });
  });

  it("lo guardado no vacía el formulario, y el aviso se quita al tocar el nombre", async () => {
    renderExisting();

    type("Pista central");
    save();
    await screen.findByText("Cambios guardados.");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Pista central");

    type("Pista central 2");
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("repintar con datos nuevos (la acción revalida) no pisa lo que se está escribiendo", () => {
    const { rerender } = renderExisting();

    type("Lo que escribo");
    rerender(<VenueEditor clubSlug="club-a" venue={venue({ name: "Lo de la base" })} />);

    expect(screen.getByLabelText("Nombre")).toHaveValue("Lo que escribo");
    expect(screen.getByRole("heading", { level: 3, name: "Lo de la base" })).toBeInTheDocument();
  });

  it("un nombre repetido se dice bajo el nombre", async () => {
    mocks.renameVenue.mockResolvedValue(fail("INVALID", { name: DUPLICATE }));
    renderExisting();

    type("Pista 2");
    save();

    const message = await screen.findByText(DUPLICATE);
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-describedby", message.id);
    expect(screen.getByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("si la pista ya no existe (NOT_FOUND), lo dice", async () => {
    mocks.renameVenue.mockResolvedValue(fail("NOT_FOUND"));
    renderExisting();

    save();

    expect(await screen.findByText(ACTION_ERROR_COPY.NOT_FOUND)).toBeInTheDocument();
  });

  it("mientras guarda, «Guardar» y «Borrar pista» esperan", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.renameVenue.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderExisting();

    save();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Borrar pista" })).toBeDisabled();
    save();
    expect(mocks.renameVenue).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await screen.findByText("Cambios guardados.");
    expect(screen.getByRole("button", { name: "Borrar pista" })).toBeEnabled();
  });
});

describe("VenueEditor · borrar", () => {
  it("la que ningún horario usa se puede borrar: el botón va en `danger` y dice de cuál habla", () => {
    renderExisting();

    const button = screen.getByRole("button", { name: "Borrar pista" });
    expect(button).toHaveClass("border-danger", "text-danger");
    expect(button).toHaveAccessibleDescription("Pista 1");
    expect(screen.queryByText(IN_USE)).not.toBeInTheDocument();
  });

  it("la que usa algún horario no ofrece borrarla: dice de qué equipos y qué hacer", () => {
    renderExisting({ usedBy: ["Equipo A", "Equipo B"] });

    expect(screen.queryByRole("button", { name: "Borrar pista" })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "No se puede borrar: la usa el horario de Equipo A, Equipo B. Quítaselo o cámbiale la pista en la página del equipo.",
      ),
    ).toBeInTheDocument();
    // Cambiarle el nombre sí se puede.
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("con un solo equipo, dice ese", () => {
    renderExisting({ usedBy: ["Equipo A"] });

    expect(
      screen.getByText(
        "No se puede borrar: la usa el horario de Equipo A. Quítaselo o cámbiale la pista en la página del equipo.",
      ),
    ).toBeInTheDocument();
  });

  it("si al repintar ya no la usa nadie, vuelve a ofrecer borrarla", () => {
    const { rerender } = renderExisting({ usedBy: ["Equipo A"] });

    rerender(<VenueEditor clubSlug="club-a" venue={venue()} />);

    expect(screen.getByRole("button", { name: "Borrar pista" })).toBeInTheDocument();
    expect(screen.queryByText(IN_USE)).not.toBeInTheDocument();
  });

  it("pregunta antes de borrar, con el nombre de la pista y lo que pasa con sus eventos, y aún no borra", async () => {
    renderExisting();

    askDelete();

    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    expect(dialog).toHaveAccessibleDescription(
      "Los entrenamientos y los partidos que la tenían conservan su lugar. No se puede deshacer.",
    );
    expect(within(dialog).getByRole("button", { name: "Borrar pista" })).toHaveClass("border-danger");
    expect(within(dialog).getByRole("button", { name: "Volver" })).toBeInTheDocument();
    expect(mocks.deleteVenue).not.toHaveBeenCalled();
  });

  it("al confirmar, borra esa pista y cierra el diálogo", async () => {
    renderExisting();

    askDelete();
    await confirmDelete();

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deleteVenue).toHaveBeenCalledTimes(1);
    expect(mocks.deleteVenue).toHaveBeenCalledWith("club-a", { id: ID });
    expect(mocks.renameVenue).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("«Volver» cierra el diálogo sin borrar", async () => {
    renderExisting();

    askDelete();
    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deleteVenue).not.toHaveBeenCalled();
  });

  it("si entre tanto algún horario la usa (IN_USE), cierra el diálogo y lo dice", async () => {
    mocks.deleteVenue.mockResolvedValue(fail("IN_USE"));
    renderExisting();

    askDelete();
    await confirmDelete();

    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede borrar porque se está usando.");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("si la acción lanza, el diálogo no se queda abierto y sale el aviso", async () => {
    mocks.deleteVenue.mockRejectedValue(new Error("fetch failed"));
    renderExisting();

    askDelete();
    await confirmDelete();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mientras borra, los botones esperan y no se borra dos veces", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.deleteVenue.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderExisting();

    askDelete();
    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    const confirm = within(dialog).getByRole("button", { name: "Borrar pista" });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    fireEvent.click(confirm);
    expect(mocks.deleteVenue).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});
