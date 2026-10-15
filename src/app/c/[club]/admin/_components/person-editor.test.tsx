import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";

const mocks = vi.hoisted(() => ({
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  setPersonArchived: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/modules/structure/actions", () => ({
  createPerson: mocks.createPerson,
  updatePerson: mocks.updatePerson,
  setPersonArchived: mocks.setPersonArchived,
}));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

import { PersonArchive, PersonEditor } from "./person-editor";

// Datos ficticios; de las personas, solo el año de nacimiento.
const ID = "00000000-0000-4000-8000-000000000001";
const NEW_ID = "00000000-0000-4000-8000-0000000000aa";

const PERSON = { id: ID, firstName: "Ana", lastName: "García López", birthYear: 2014 as number | null };

const YEAR = "Año de nacimiento (opcional)";
const type = (label: string, text: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Dar de alta" }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createPerson.mockResolvedValue(ok({ id: NEW_ID }));
  mocks.updatePerson.mockResolvedValue(ok(null));
  mocks.setPersonArchived.mockResolvedValue(ok(null));
});

describe("PersonEditor · una persona nueva", () => {
  it("es el alta: su encabezado da nombre al formulario, que empieza vacío", () => {
    render(<PersonEditor clubSlug="club-a" />);

    expect(screen.getByRole("heading", { level: 2, name: "Nueva persona" })).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Nueva persona" });
    expect(within(form).getByLabelText("Nombre")).toHaveValue("");
    expect(within(form).getByLabelText("Apellidos")).toHaveValue("");
    expect(within(form).getByLabelText(YEAR)).toHaveValue(null);
  });

  it("nombre y apellidos tienen tope; el año es un número desde 1900", () => {
    render(<PersonEditor clubSlug="club-a" />);

    expect(screen.getByLabelText("Nombre")).toHaveAttribute("maxlength", "60");
    expect(screen.getByLabelText("Apellidos")).toHaveAttribute("maxlength", "60");
    expect(screen.getByLabelText(YEAR)).toHaveAttribute("type", "number");
    expect(screen.getByLabelText(YEAR)).toHaveAttribute("min", "1900");
  });

  it("pide solo el año de nacimiento, y lo dice: no hay ningún campo de fecha", () => {
    const { container } = render(<PersonEditor clubSlug="club-a" />);

    expect(screen.getByLabelText(YEAR)).toHaveAccessibleDescription("Solo el año, nunca la fecha completa.");
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(screen.queryByLabelText(/fecha/i)).not.toBeInTheDocument();
  });

  it("«Dar de alta» es el botón principal", () => {
    render(<PersonEditor clubSlug="club-a" />);

    expect(screen.getByRole("button", { name: "Dar de alta" })).toHaveClass("bg-brand-accent");
    expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  });

  it("da de alta con lo escrito, el año como número, y lleva a la página de la persona", async () => {
    render(<PersonEditor clubSlug="club-a" />);

    type("Nombre", "Ana");
    type("Apellidos", "García López");
    type(YEAR, "2014");
    create();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/admin/people/${NEW_ID}`);
    expect(mocks.createPerson).toHaveBeenCalledTimes(1);
    expect(mocks.createPerson).toHaveBeenCalledWith("club-a", {
      firstName: "Ana",
      lastName: "García López",
      birthYear: 2014,
    });
    expect(mocks.updatePerson).not.toHaveBeenCalled();
  });

  it("sin año, viaja null: ni 0 ni «no es un número»", async () => {
    render(<PersonEditor clubSlug="club-a" />);

    type("Nombre", "Ana");
    type("Apellidos", "García López");
    create();

    await waitFor(() => expect(mocks.createPerson).toHaveBeenCalledTimes(1));
    expect(mocks.createPerson.mock.calls[0][1].birthYear).toBeNull();
  });

  it("usa el club que le pasan, también para navegar", async () => {
    render(<PersonEditor clubSlug="club-b" />);

    type("Nombre", "Ana");
    type("Apellidos", "García López");
    create();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-b/admin/people/${NEW_ID}`));
    expect(mocks.createPerson.mock.calls[0][0]).toBe("club-b");
  });

  it("entrada inválida: el aviso general y cada error bajo su campo, enlazado; no navega", async () => {
    mocks.createPerson.mockResolvedValue(
      fail("INVALID", {
        firstName: "Escribe un nombre.",
        lastName: "Escribe los apellidos.",
        birthYear: "Escribe un año de nacimiento válido.",
      }),
    );
    render(<PersonEditor clubSlug="club-a" />);

    type(YEAR, "1800");
    create();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message] of [
      ["Nombre", "Escribe un nombre."],
      ["Apellidos", "Escribe los apellidos."],
      [YEAR, "Escribe un año de nacimiento válido."],
    ]) {
      const field = screen.getByLabelText(label);
      const text = screen.getByText(message);
      expect(field, label).toHaveAttribute("aria-invalid", "true");
      expect(field.getAttribute("aria-describedby")?.split(" "), label).toContain(text.id);
    }
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.createPerson).toHaveBeenCalledWith("club-a", { firstName: "", lastName: "", birthYear: 1800 });
  });

  it("mientras da de alta, el botón espera y no se lanza un segundo alta", async () => {
    let finish: (result: ActionResult<{ id: string }>) => void = () => {};
    mocks.createPerson.mockReturnValue(
      new Promise<ActionResult<{ id: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    render(<PersonEditor clubSlug="club-a" />);

    create();
    await waitFor(() => expect(screen.getByRole("button", { name: "Dar de alta" })).toBeDisabled());
    create();
    expect(mocks.createPerson).toHaveBeenCalledTimes(1);

    finish(ok({ id: NEW_ID }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  });

  it("si no se puede guardar, lo dice sin el error técnico y no pierde lo escrito", async () => {
    mocks.createPerson.mockRejectedValue(new Error("fetch failed"));
    render(<PersonEditor clubSlug="club-a" />);

    type("Nombre", "Ana");
    create();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Ana");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("PersonEditor · una persona que existe", () => {
  it("empieza con sus datos, bajo «Datos»", () => {
    render(<PersonEditor clubSlug="club-a" person={PERSON} />);

    expect(screen.getByRole("heading", { level: 2, name: "Datos" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Ana");
    expect(screen.getByLabelText("Apellidos")).toHaveValue("García López");
    expect(screen.getByLabelText(YEAR)).toHaveValue(2014);
  });

  it("quien no tiene año de nacimiento empieza con el campo vacío", () => {
    render(<PersonEditor clubSlug="club-a" person={{ ...PERSON, birthYear: null }} />);

    expect(screen.getByLabelText(YEAR)).toHaveValue(null);
  });

  it("«Guardar» es secondary, lo describe su encabezado y no hay botón de alta", () => {
    render(<PersonEditor clubSlug="club-a" person={PERSON} />);

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).toHaveAccessibleDescription("Datos");
    expect(screen.queryByRole("button", { name: "Dar de alta" })).not.toBeInTheDocument();
  });

  it("guarda lo escrito con el id de la persona, y lo confirma sin navegar", async () => {
    render(<PersonEditor clubSlug="club-a" person={PERSON} />);

    type("Nombre", "Ana María");
    type("Apellidos", "García Ruiz");
    type(YEAR, "2013");
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updatePerson).toHaveBeenCalledTimes(1);
    expect(mocks.updatePerson).toHaveBeenCalledWith("club-a", {
      id: ID,
      firstName: "Ana María",
      lastName: "García Ruiz",
      birthYear: 2013,
    });
    expect(mocks.createPerson).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("vaciar el año lo manda como null: se guarda «sin año»", async () => {
    render(<PersonEditor clubSlug="club-a" person={PERSON} />);

    type(YEAR, "");
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updatePerson.mock.calls[0][1].birthYear).toBeNull();
  });

  it("no archiva ni recupera: de eso se encarga «Archivar»", async () => {
    render(<PersonEditor clubSlug="club-a" person={PERSON} />);

    save();

    await screen.findByText("Cambios guardados.");
    expect(Object.keys(mocks.updatePerson.mock.calls[0][1]).sort()).toEqual([
      "birthYear",
      "firstName",
      "id",
      "lastName",
    ]);
    expect(mocks.setPersonArchived).not.toHaveBeenCalled();
  });

  it("el aviso de guardado se quita al tocar un campo, y lo escrito sigue ahí", async () => {
    render(<PersonEditor clubSlug="club-a" person={PERSON} />);

    type("Nombre", "Ana María");
    save();
    await screen.findByText("Cambios guardados.");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Ana María");

    type(YEAR, "2012");
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("repintar con datos nuevos (la acción revalida) no pisa lo que se está escribiendo", () => {
    const { rerender } = render(<PersonEditor clubSlug="club-a" person={PERSON} />);

    type("Apellidos", "Lo que escribo");
    rerender(<PersonEditor clubSlug="club-a" person={{ ...PERSON, lastName: "Lo de la base" }} />);

    expect(screen.getByLabelText("Apellidos")).toHaveValue("Lo que escribo");
  });

  it("un año que no vale se dice bajo su campo", async () => {
    mocks.updatePerson.mockResolvedValue(fail("INVALID", { birthYear: "Escribe un año de nacimiento válido." }));
    render(<PersonEditor clubSlug="club-a" person={PERSON} />);

    type(YEAR, "2999");
    save();

    await screen.findByText("Escribe un año de nacimiento válido.");
    expect(screen.getByLabelText(YEAR)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nombre")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("si la persona ya no existe, lo dice", async () => {
    mocks.updatePerson.mockResolvedValue(fail("NOT_FOUND"));
    render(<PersonEditor clubSlug="club-a" person={PERSON} />);

    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
  });
});

// ── Archivar y recuperar ────────────────────────────────────────────────────────────────

const ARCHIVE_TITLE = "¿Archivar a Ana García López?";
const STILL_IN_TEAM = "Sigue en un equipo de esta temporada. Quítala antes de él.";

function renderArchive(archived = false, clubSlug = "club-a") {
  return render(<PersonArchive clubSlug={clubSlug} person={PERSON} archived={archived} />);
}

const askArchive = () => fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
async function confirmArchive() {
  const dialog = await screen.findByRole("alertdialog", { name: ARCHIVE_TITLE });
  fireEvent.click(within(dialog).getByRole("button", { name: "Archivar" }));
}

describe("PersonArchive · archivar", () => {
  it("quien está en el club se puede archivar, en `danger`; no se ofrece recuperar", () => {
    renderArchive();

    expect(screen.getByRole("button", { name: "Archivar" })).toHaveClass("border-danger", "text-danger");
    expect(screen.queryByRole("button", { name: "Recuperar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pregunta antes, con su nombre, diciendo que no se borra nada, y aún no archiva", async () => {
    renderArchive();

    askArchive();

    const dialog = await screen.findByRole("alertdialog", { name: ARCHIVE_TITLE });
    expect(dialog).toHaveAccessibleDescription(
      "Sale de la lista de personas y de los buscadores. No se borra nada y se puede recuperar.",
    );
    expect(within(dialog).getByRole("button", { name: "Archivar" })).toHaveClass("border-danger");
    expect(mocks.setPersonArchived).not.toHaveBeenCalled();
  });

  it("al confirmar, archiva a esa persona y cierra el diálogo", async () => {
    renderArchive();

    askArchive();
    await confirmArchive();

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.setPersonArchived).toHaveBeenCalledTimes(1);
    expect(mocks.setPersonArchived).toHaveBeenCalledWith("club-a", { id: ID, archived: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("«Volver» cierra el diálogo sin archivar", async () => {
    renderArchive();

    askArchive();
    const dialog = await screen.findByRole("alertdialog", { name: ARCHIVE_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.setPersonArchived).not.toHaveBeenCalled();
  });

  it("a quien sigue en un equipo no se la archiva: enseña el mensaje del campo `archived`, no el genérico", async () => {
    mocks.setPersonArchived.mockResolvedValue(fail("INVALID", { archived: STILL_IN_TEAM }));
    renderArchive();

    askArchive();
    await confirmArchive();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(STILL_IN_TEAM);
    expect(alert).not.toHaveTextContent(ACTION_ERROR_COPY.INVALID);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // Sigue pudiéndose intentar, cuando se la haya quitado del equipo.
    expect(screen.getByRole("button", { name: "Archivar" })).toBeEnabled();
  });

  it.each(["NOT_FOUND", "SAVE_FAILED", "INVALID"] as const)(
    "un fallo sin mensaje de campo (%s) se dice con el copy del contrato",
    async (error) => {
      mocks.setPersonArchived.mockResolvedValue(fail(error));
      renderArchive();

      askArchive();
      await confirmArchive();

      expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY[error]);
    },
  );

  it("si la acción lanza, el diálogo no se queda abierto y sale el aviso", async () => {
    mocks.setPersonArchived.mockRejectedValue(new Error("fetch failed"));
    renderArchive();

    askArchive();
    await confirmArchive();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mientras archiva, los botones esperan y no se archiva dos veces", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.setPersonArchived.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderArchive();

    askArchive();
    const dialog = await screen.findByRole("alertdialog", { name: ARCHIVE_TITLE });
    const confirm = within(dialog).getByRole("button", { name: "Archivar" });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    fireEvent.click(confirm);
    expect(mocks.setPersonArchived).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("un aviso anterior se quita al intentarlo de nuevo", async () => {
    mocks.setPersonArchived.mockResolvedValueOnce(fail("INVALID", { archived: STILL_IN_TEAM }));
    renderArchive();

    askArchive();
    await confirmArchive();
    await screen.findByRole("alert");
    askArchive();
    await confirmArchive();

    await waitFor(() => expect(mocks.setPersonArchived).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("PersonArchive · recuperar", () => {
  it("a quien está archivada se le ofrece recuperarla, no archivarla", () => {
    renderArchive(true);

    const button = screen.getByRole("button", { name: "Recuperar" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).not.toHaveClass("border-danger");
    expect(screen.queryByRole("button", { name: "Archivar" })).not.toBeInTheDocument();
  });

  it("recupera sin preguntar: no se pierde nada", async () => {
    renderArchive(true);

    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));

    await waitFor(() => expect(mocks.setPersonArchived).toHaveBeenCalledTimes(1));
    expect(mocks.setPersonArchived).toHaveBeenCalledWith("club-a", { id: ID, archived: false });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("si recuperar falla, lo dice", async () => {
    mocks.setPersonArchived.mockResolvedValue(fail("NOT_FOUND"));
    renderArchive(true);

    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
  });

  it("mientras recupera, el botón espera", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.setPersonArchived.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderArchive(true);

    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Recuperar" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    expect(mocks.setPersonArchived).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await waitFor(() => expect(screen.getByRole("button", { name: "Recuperar" })).toBeEnabled());
  });

  it("usa el club que le pasan", async () => {
    renderArchive(true, "club-b");

    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));

    await waitFor(() => expect(mocks.setPersonArchived).toHaveBeenCalledWith("club-b", { id: ID, archived: false }));
  });
});
