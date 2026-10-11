import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { Category } from "@/modules/structure/types";

const mocks = vi.hoisted(() => ({
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));

vi.mock("@/modules/structure/actions", () => ({
  createCategory: mocks.createCategory,
  updateCategory: mocks.updateCategory,
  deleteCategory: mocks.deleteCategory,
}));

import { CategoryEditor } from "./category-editor";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ID = "00000000-0000-4000-8000-000000000001";
const NEW_ID = "00000000-0000-4000-8000-0000000000aa";

function category(overrides: Partial<Category> = {}): Category {
  return { id: ID, name: "Pequeños", ageBand: "U12", sort: 10, inUse: false, ...overrides };
}

function renderExisting(overrides: Partial<Category> = {}) {
  return render(<CategoryEditor clubSlug="club-a" category={category(overrides)} />);
}

const type = (label: string, text: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Crear categoría" }));

const DELETE_TITLE = "¿Borrar la categoría Pequeños?";
const askDelete = () => fireEvent.click(screen.getByRole("button", { name: "Borrar categoría" }));
async function confirmDelete() {
  const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
  fireEvent.click(within(dialog).getByRole("button", { name: "Borrar categoría" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createCategory.mockResolvedValue(ok({ id: NEW_ID }));
  mocks.updateCategory.mockResolvedValue(ok(null));
  mocks.deleteCategory.mockResolvedValue(ok(null));
});

describe("CategoryEditor · una categoría nueva", () => {
  it("es el alta: su encabezado da nombre al formulario, vacío salvo el orden que se propone", () => {
    render(<CategoryEditor clubSlug="club-a" nextSort={30} />);

    expect(screen.getByRole("heading", { level: 2, name: "Nueva categoría" })).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Nueva categoría" });
    expect(within(form).getByLabelText("Nombre")).toHaveValue("");
    expect(within(form).getByLabelText("Edad (sub)")).toHaveValue(null);
    expect(within(form).getByLabelText("Orden")).toHaveValue(30);
  });

  it("sin orden propuesto, empieza en 0", () => {
    render(<CategoryEditor clubSlug="club-a" />);

    expect(screen.getByLabelText("Orden")).toHaveValue(0);
  });

  it("los campos dicen su tope, su rango y para qué son", () => {
    render(<CategoryEditor clubSlug="club-a" />);

    expect(screen.getByLabelText("Nombre")).toHaveAttribute("maxlength", "60");
    const age = screen.getByLabelText("Edad (sub)");
    expect(age).toHaveAttribute("type", "number");
    expect(age).toHaveAttribute("min", "1");
    expect(age).toHaveAttribute("max", "99");
    expect(age).toHaveAccessibleDescription("12 para una categoría sub 12.");
    const sort = screen.getByLabelText("Orden");
    expect(sort).toHaveAttribute("min", "0");
    expect(sort).toHaveAttribute("max", "9999");
    expect(sort).toHaveAccessibleDescription("Las categorías se listan de menor a mayor.");
  });

  it("«Crear categoría» es el botón principal, y el alta no se puede borrar", () => {
    render(<CategoryEditor clubSlug="club-a" />);

    expect(screen.getByRole("button", { name: "Crear categoría" })).toHaveClass("bg-brand-accent");
    expect(screen.queryByRole("button", { name: "Borrar categoría" })).not.toBeInTheDocument();
    expect(screen.queryByText("La lleva algún equipo: no se puede borrar.")).not.toBeInTheDocument();
  });

  it("crea con lo escrito, la edad y el orden como números", async () => {
    render(<CategoryEditor clubSlug="club-a" nextSort={30} />);

    type("Nombre", "Mayores");
    type("Edad (sub)", "16");
    create();

    await screen.findByText("Categoría creada.");
    expect(mocks.createCategory).toHaveBeenCalledTimes(1);
    expect(mocks.createCategory).toHaveBeenCalledWith("club-a", { name: "Mayores", age: 16, sort: 30 });
    expect(mocks.updateCategory).not.toHaveBeenCalled();
  });

  it("tras crear, vacía el nombre y la edad, propone el orden siguiente y vuelve al nombre", async () => {
    render(<CategoryEditor clubSlug="club-a" nextSort={30} />);

    type("Nombre", "Mayores");
    type("Edad (sub)", "16");
    create();

    await screen.findByText("Categoría creada.");
    expect(screen.getByLabelText("Nombre")).toHaveValue("");
    expect(screen.getByLabelText("Edad (sub)")).toHaveValue(null);
    expect(screen.getByLabelText("Orden")).toHaveValue(40);
    await waitFor(() => expect(screen.getByLabelText("Nombre")).toHaveFocus());
  });

  it("el orden siguiente sale del que se acaba de usar, no del propuesto", async () => {
    render(<CategoryEditor clubSlug="club-a" nextSort={30} />);

    type("Nombre", "Mayores");
    type("Edad (sub)", "16");
    type("Orden", "5");
    create();

    await screen.findByText("Categoría creada.");
    expect(mocks.createCategory.mock.calls[0][1].sort).toBe(5);
    expect(screen.getByLabelText("Orden")).toHaveValue(15);
  });

  it("la edad vacía no viaja como 0: viaja como «no es un número», y la rechaza la acción", async () => {
    mocks.createCategory.mockResolvedValue(fail("INVALID", { age: "La edad tiene que estar entre 1 y 99." }));
    render(<CategoryEditor clubSlug="club-a" nextSort={30} />);

    type("Nombre", "Mayores");
    create();

    await screen.findByText("La edad tiene que estar entre 1 y 99.");
    const sent = mocks.createCategory.mock.calls[0][1];
    expect(sent.age).toBeNaN();
    expect(sent.age).not.toBe(0);
    expect(sent.sort).toBe(30);
  });

  it("el orden vacío tampoco viaja como 0", async () => {
    mocks.createCategory.mockResolvedValue(fail("INVALID", { sort: "El orden tiene que estar entre 0 y 9999." }));
    render(<CategoryEditor clubSlug="club-a" nextSort={30} />);

    type("Nombre", "Mayores");
    type("Edad (sub)", "16");
    type("Orden", "");
    create();

    await screen.findByText("El orden tiene que estar entre 0 y 9999.");
    expect(mocks.createCategory.mock.calls[0][1].sort).toBeNaN();
  });

  it("el orden 0 escrito sí es 0", async () => {
    render(<CategoryEditor clubSlug="club-a" nextSort={30} />);

    type("Nombre", "Mayores");
    type("Edad (sub)", "16");
    type("Orden", "0");
    create();

    await screen.findByText("Categoría creada.");
    expect(mocks.createCategory.mock.calls[0][1].sort).toBe(0);
  });

  it("entrada inválida: el aviso general y cada error bajo su campo, enlazado; no vacía nada", async () => {
    mocks.createCategory.mockResolvedValue(
      fail("INVALID", {
        name: "Ya hay una categoría con ese nombre.",
        age: "La edad tiene que estar entre 1 y 99.",
        sort: "El orden tiene que estar entre 0 y 9999.",
      }),
    );
    render(<CategoryEditor clubSlug="club-a" nextSort={30} />);

    type("Nombre", "Mayores");
    type("Edad (sub)", "160");
    create();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message] of [
      ["Nombre", "Ya hay una categoría con ese nombre."],
      ["Edad (sub)", "La edad tiene que estar entre 1 y 99."],
      ["Orden", "El orden tiene que estar entre 0 y 9999."],
    ]) {
      const field = screen.getByLabelText(label);
      const text = screen.getByText(message);
      expect(field, label).toHaveAttribute("aria-invalid", "true");
      expect(field.getAttribute("aria-describedby")?.split(" "), label).toContain(text.id);
    }
    expect(screen.getByLabelText("Nombre")).toHaveValue("Mayores");
    expect(screen.getByLabelText("Edad (sub)")).toHaveValue(160);
    expect(screen.queryByText("Categoría creada.")).not.toBeInTheDocument();
  });

  it("el aviso de creada se quita al escribir la siguiente", async () => {
    render(<CategoryEditor clubSlug="club-a" nextSort={30} />);

    type("Nombre", "Mayores");
    type("Edad (sub)", "16");
    create();
    await screen.findByText("Categoría creada.");
    type("Nombre", "O");

    expect(screen.queryByText("Categoría creada.")).not.toBeInTheDocument();
  });

  it("mientras crea, el botón espera y no se lanza un segundo alta", async () => {
    let finish: (result: ActionResult<{ id: string }>) => void = () => {};
    mocks.createCategory.mockReturnValue(
      new Promise<ActionResult<{ id: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    render(<CategoryEditor clubSlug="club-a" />);

    create();
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear categoría" })).toBeDisabled());
    create();
    expect(mocks.createCategory).toHaveBeenCalledTimes(1);

    finish(ok({ id: NEW_ID }));
    await screen.findByText("Categoría creada.");
  });

  it("si la acción lanza, lo dice sin el error técnico y no vacía lo escrito", async () => {
    mocks.createCategory.mockRejectedValue(new Error("fetch failed"));
    render(<CategoryEditor clubSlug="club-a" />);

    type("Nombre", "Mayores");
    create();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Mayores");
  });
});

describe("CategoryEditor · una categoría que existe", () => {
  it("la card se llama como la categoría y dice su edad como «Sub 12»", () => {
    renderExisting();

    expect(screen.getByRole("heading", { level: 2, name: "Pequeños" })).toBeInTheDocument();
    expect(screen.getByText("Sub 12")).toBeInTheDocument();
  });

  it("empieza con lo que tiene guardado: la edad sale de `U12`", () => {
    renderExisting();

    expect(screen.getByLabelText("Nombre")).toHaveValue("Pequeños");
    expect(screen.getByLabelText("Edad (sub)")).toHaveValue(12);
    expect(screen.getByLabelText("Orden")).toHaveValue(10);
  });

  it("el orden 0 guardado se enseña como 0, no como el propuesto", () => {
    render(<CategoryEditor clubSlug="club-a" category={category({ sort: 0 })} nextSort={50} />);

    expect(screen.getByLabelText("Orden")).toHaveValue(0);
  });

  it("una edad guardada que no se entiende deja el campo vacío y se enseña tal cual", () => {
    renderExisting({ ageBand: "Sénior" });

    expect(screen.getByLabelText("Edad (sub)")).toHaveValue(null);
    expect(screen.getByText("Sénior")).toBeInTheDocument();
  });

  it("«Guardar» es secondary y lo describe el nombre de la categoría", () => {
    renderExisting();

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).not.toHaveClass("bg-brand-accent");
    expect(button).toHaveAccessibleDescription("Pequeños");
    expect(screen.queryByRole("button", { name: "Crear categoría" })).not.toBeInTheDocument();
  });

  it("guarda lo escrito con el id de la categoría", async () => {
    renderExisting();

    type("Nombre", "Benjamines");
    type("Edad (sub)", "10");
    type("Orden", "5");
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updateCategory).toHaveBeenCalledTimes(1);
    expect(mocks.updateCategory).toHaveBeenCalledWith("club-a", { id: ID, name: "Benjamines", age: 10, sort: 5 });
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });

  it("guardar sin tocar nada manda lo que había", async () => {
    renderExisting();

    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updateCategory).toHaveBeenCalledWith("club-a", { id: ID, name: "Pequeños", age: 12, sort: 10 });
  });

  it("vaciar la edad no la manda como 0", async () => {
    mocks.updateCategory.mockResolvedValue(fail("INVALID", { age: "La edad tiene que estar entre 1 y 99." }));
    renderExisting();

    type("Edad (sub)", "");
    save();

    await screen.findByText("La edad tiene que estar entre 1 y 99.");
    expect(mocks.updateCategory.mock.calls[0][1].age).toBeNaN();
  });

  it("lo guardado no vacía el formulario, y el aviso se quita al tocar un campo", async () => {
    renderExisting();

    type("Nombre", "Benjamines");
    save();
    await screen.findByText("Cambios guardados.");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Benjamines");

    type("Orden", "20");
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("repintar con datos nuevos (la acción revalida) no pisa lo que se está escribiendo", () => {
    const { rerender } = renderExisting();

    type("Nombre", "Lo que escribo");
    rerender(<CategoryEditor clubSlug="club-a" category={category({ name: "Lo de la base" })} />);

    expect(screen.getByLabelText("Nombre")).toHaveValue("Lo que escribo");
  });

  it("un nombre repetido se dice bajo el nombre", async () => {
    mocks.updateCategory.mockResolvedValue(fail("INVALID", { name: "Ya hay una categoría con ese nombre." }));
    renderExisting();

    save();

    const message = await screen.findByText("Ya hay una categoría con ese nombre.");
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Nombre")).toHaveAttribute("aria-describedby", message.id);
  });
});

describe("CategoryEditor · borrar", () => {
  it("la que ningún equipo lleva se puede borrar: el botón va en `danger` y dice de cuál habla", () => {
    renderExisting();

    const button = screen.getByRole("button", { name: "Borrar categoría" });
    expect(button).toHaveClass("border-danger", "text-danger");
    expect(button).toHaveAccessibleDescription("Pequeños");
    expect(screen.queryByText("La lleva algún equipo: no se puede borrar.")).not.toBeInTheDocument();
  });

  it("la que lleva algún equipo no ofrece borrarla, y dice por qué", () => {
    renderExisting({ inUse: true });

    expect(screen.queryByRole("button", { name: "Borrar categoría" })).not.toBeInTheDocument();
    expect(screen.getByText("La lleva algún equipo: no se puede borrar.")).toBeInTheDocument();
    // Editarla sí se puede.
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("pregunta antes de borrar, con el nombre de la categoría, y aún no borra", async () => {
    renderExisting();

    askDelete();

    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    expect(dialog).toHaveAccessibleDescription("Ningún equipo la lleva. No se puede deshacer.");
    expect(within(dialog).getByRole("button", { name: "Borrar categoría" })).toHaveClass("border-danger");
    expect(mocks.deleteCategory).not.toHaveBeenCalled();
  });

  it("al confirmar, borra esa categoría y cierra el diálogo", async () => {
    renderExisting();

    askDelete();
    await confirmDelete();

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deleteCategory).toHaveBeenCalledTimes(1);
    expect(mocks.deleteCategory).toHaveBeenCalledWith("club-a", { id: ID });
    expect(mocks.updateCategory).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("«Volver» cierra el diálogo sin borrar", async () => {
    renderExisting();

    askDelete();
    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deleteCategory).not.toHaveBeenCalled();
  });

  it("si entre tanto algún equipo la lleva (IN_USE), cierra el diálogo y lo dice", async () => {
    mocks.deleteCategory.mockResolvedValue(fail("IN_USE"));
    renderExisting();

    askDelete();
    await confirmDelete();

    expect(await screen.findByRole("alert")).toHaveTextContent("No se puede borrar porque se está usando.");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("si la acción lanza, el diálogo no se queda abierto y sale el aviso", async () => {
    mocks.deleteCategory.mockRejectedValue(new Error("fetch failed"));
    renderExisting();

    askDelete();
    await confirmDelete();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mientras borra, los botones esperan y no se borra dos veces", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.deleteCategory.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderExisting();

    askDelete();
    const dialog = await screen.findByRole("alertdialog", { name: DELETE_TITLE });
    const confirm = within(dialog).getByRole("button", { name: "Borrar categoría" });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    fireEvent.click(confirm);
    expect(mocks.deleteCategory).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});
