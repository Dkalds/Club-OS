import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { ClubValue } from "@/modules/methodology/types";

const mocks = vi.hoisted(() => ({
  createValue: vi.fn(),
  updateValue: vi.fn(),
  moveMethodologyItem: vi.fn(),
  setMethodologyStatus: vi.fn(),
}));

vi.mock("@/modules/methodology/actions", () => ({
  createValue: mocks.createValue,
  updateValue: mocks.updateValue,
  moveMethodologyItem: mocks.moveMethodologyItem,
  setMethodologyStatus: mocks.setMethodologyStatus,
}));

import { ValueEditor } from "./value-editor";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ID = "00000000-0000-4000-8000-000000000001";
const NEW_ID = "00000000-0000-4000-8000-0000000000aa";

function value(overrides: Partial<ClubValue> = {}): ClubValue {
  return {
    id: ID,
    code: "VALOR A",
    title: "Un título",
    description: "Una descripción.",
    status: "published",
    ...overrides,
  };
}

function renderEditor(props: Partial<Parameters<typeof ValueEditor>[0]> = {}) {
  return render(<ValueEditor clubSlug="club-a" value={value()} {...props} />);
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Crear valor" }));
const type = (label: string, text: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createValue.mockResolvedValue(ok({ id: NEW_ID }));
  mocks.updateValue.mockResolvedValue(ok(null));
  mocks.moveMethodologyItem.mockResolvedValue(ok(null));
  mocks.setMethodologyStatus.mockResolvedValue(ok(null));
});

describe("ValueEditor · un valor que existe", () => {
  it("empieza con lo que tiene guardado, con los límites de cada campo", () => {
    renderEditor();

    expect(screen.getByLabelText("Código")).toHaveValue("VALOR A");
    expect(screen.getByLabelText("Código")).toHaveAttribute("maxlength", "40");
    expect(screen.getByLabelText("Título (opcional)")).toHaveValue("Un título");
    expect(screen.getByLabelText("Título (opcional)")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Una descripción.");
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("maxlength", "500");
  });

  it("un valor sin título empieza con el campo vacío", () => {
    renderEditor({ value: value({ title: null }) });

    expect(screen.getByLabelText("Título (opcional)")).toHaveValue("");
  });

  it("la card se llama como el código del valor y dice su estado", () => {
    renderEditor();

    expect(screen.getByRole("heading", { level: 2, name: "VALOR A" })).toBeInTheDocument();
    expect(screen.getByText("Publicado")).toBeInTheDocument();
  });

  it("un valor en borrador lo dice, y su botón de estado es «Publicar»", () => {
    renderEditor({ value: value({ status: "draft" }) });

    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar VALOR A" })).toBeInTheDocument();
  });

  it("lleva los controles de la fila, con el código en su nombre, y el primero no sube", () => {
    renderEditor({ isFirst: true });

    expect(screen.getByRole("button", { name: "Subir VALOR A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar VALOR A" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Pasar a borrador VALOR A" })).toBeEnabled();
  });

  it("el último no baja", () => {
    renderEditor({ isLast: true });

    expect(screen.getByRole("button", { name: "Subir VALOR A" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Bajar VALOR A" })).toBeDisabled();
  });

  it("por defecto es una fila intermedia: ni «Subir» ni «Bajar» se bloquean", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Subir VALOR A" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Bajar VALOR A" })).toBeEnabled();
  });

  it("los controles actúan sobre la lista de valores", async () => {
    renderEditor({ value: value({ status: "draft" }) });

    fireEvent.click(screen.getByRole("button", { name: "Subir VALOR A" }));
    await waitFor(() => expect(mocks.moveMethodologyItem).toHaveBeenCalledTimes(1));
    expect(mocks.moveMethodologyItem).toHaveBeenCalledWith("club-a", {
      kind: "club_values",
      id: ID,
      direction: "up",
    });

    fireEvent.click(screen.getByRole("button", { name: "Publicar VALOR A" }));
    await waitFor(() => expect(mocks.setMethodologyStatus).toHaveBeenCalledTimes(1));
    expect(mocks.setMethodologyStatus).toHaveBeenCalledWith("club-a", {
      kind: "club_values",
      id: ID,
      status: "published",
    });
  });

  it("«Guardar» es secondary, no el botón principal, y no hay botón de alta", () => {
    renderEditor();

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).not.toHaveClass("bg-brand-accent");
    expect(screen.queryByRole("button", { name: "Crear valor" })).not.toBeInTheDocument();
  });

  it("guarda lo escrito con el id del valor", async () => {
    renderEditor();

    type("Código", "VALOR B");
    type("Título (opcional)", "Otro título");
    type("Descripción", "Otra descripción.");
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updateValue).toHaveBeenCalledTimes(1);
    expect(mocks.updateValue).toHaveBeenCalledWith("club-a", {
      id: ID,
      code: "VALOR B",
      title: "Otro título",
      description: "Otra descripción.",
    });
    expect(mocks.createValue).not.toHaveBeenCalled();
  });

  it("vaciar el título lo manda vacío: la acción lo guarda como «sin título»", async () => {
    renderEditor();

    type("Título (opcional)", "");
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updateValue.mock.calls[0][1].title).toBe("");
  });

  it("el aviso de guardado es un estado: la región ya está antes y se vacía al tocar un campo", async () => {
    renderEditor();
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    save();
    await screen.findByText("Cambios guardados.");
    expect(screen.getByRole("status")).toBe(region);

    type("Descripción", "Algo más.");
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    expect(region).toBeEmptyDOMElement();
  });

  it("al guardar de nuevo, el aviso se quita al empezar y vuelve al terminar", async () => {
    renderEditor();

    save();
    await screen.findByText("Cambios guardados.");
    save();

    await waitFor(() => expect(mocks.updateValue).toHaveBeenCalledTimes(2));
    await screen.findByText("Cambios guardados.");
  });

  it("lo guardado no vacía el formulario: lo escrito sigue ahí", async () => {
    renderEditor();

    type("Descripción", "Texto nuevo.");
    save();

    await screen.findByText("Cambios guardados.");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Texto nuevo.");
  });

  it("repintar la card con datos nuevos (la acción revalida) no pisa lo que se está escribiendo", () => {
    const { rerender } = renderEditor();

    type("Descripción", "Lo que escribo ahora.");
    rerender(<ValueEditor clubSlug="club-a" value={value({ description: "Lo de la base." })} />);

    expect(screen.getByLabelText("Descripción")).toHaveValue("Lo que escribo ahora.");
  });

  it("mientras guarda, el botón espera y no se lanza un segundo guardado", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.updateValue.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderEditor();

    save();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled());
    save();
    expect(mocks.updateValue).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await screen.findByText("Cambios guardados.");
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("entrada inválida: el aviso general arriba y cada error bajo su campo, enlazado", async () => {
    mocks.updateValue.mockResolvedValue(
      fail("INVALID", {
        code: "Escribe el código del valor.",
        title: "Máximo 80 caracteres.",
        description: "Escribe una descripción.",
      }),
    );
    renderEditor();

    save();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message] of [
      ["Código", "Escribe el código del valor."],
      ["Título (opcional)", "Máximo 80 caracteres."],
      ["Descripción", "Escribe una descripción."],
    ]) {
      const field = screen.getByLabelText(label);
      const text = screen.getByText(message);
      expect(field, label).toHaveAttribute("aria-invalid", "true");
      expect(field, label).toHaveAttribute("aria-describedby", text.id);
    }
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("un error de campo se quita al guardar de nuevo", async () => {
    mocks.updateValue.mockResolvedValueOnce(
      fail("INVALID", { description: "Escribe una descripción." }),
    );
    renderEditor();

    save();
    await screen.findByText("Escribe una descripción.");
    save();

    await screen.findByText("Cambios guardados.");
    expect(screen.queryByText("Escribe una descripción.")).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_ERROR_COPY.INVALID)).not.toBeInTheDocument();
  });

  it("si no se puede guardar, lo dice con el copy del contrato y no pierde lo escrito", async () => {
    mocks.updateValue.mockResolvedValue(fail("SAVE_FAILED"));
    renderEditor();

    type("Descripción", "Un texto que no se puede perder.");
    save();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText("Descripción")).toHaveValue("Un texto que no se puede perder.");
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("si el valor ya no existe, lo dice sin inventar un error de campo", async () => {
    mocks.updateValue.mockResolvedValue(fail("NOT_FOUND"));
    renderEditor();

    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
  });

  it("si la acción lanza, tampoco se queda sin avisar", async () => {
    mocks.updateValue.mockRejectedValue(new Error("fetch failed"));
    renderEditor();

    save();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
  });

  it("un código muy largo no desborda la card", () => {
    renderEditor({ value: value({ code: "X".repeat(40) }) });

    expect(screen.getByRole("heading", { level: 2 })).toHaveClass("wrap-break-word");
  });
});

describe("ValueEditor · el alta", () => {
  function renderCreate() {
    return render(<ValueEditor clubSlug="club-a" />);
  }

  it("es un formulario con nombre: «Nuevo valor», con los tres campos vacíos", () => {
    renderCreate();

    const form = screen.getByRole("form", { name: "Nuevo valor" });
    expect(within(form).getByLabelText("Código")).toHaveValue("");
    expect(within(form).getByLabelText("Título (opcional)")).toHaveValue("");
    expect(within(form).getByLabelText("Descripción")).toHaveValue("");
    expect(screen.getByRole("heading", { level: 2, name: "Nuevo valor" })).toBeInTheDocument();
  });

  it("«Crear valor» es el único primary; no hay estado, ni controles, ni «Guardar»", () => {
    renderCreate();

    expect(screen.getByRole("button", { name: "Crear valor" })).toHaveClass(
      "bg-brand-accent",
      "text-brand-on-accent",
    );
    expect(screen.getByRole("button", { name: "Crear valor" })).toHaveAttribute("type", "submit");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Borrador")).not.toBeInTheDocument();
    expect(screen.queryByText("Publicado")).not.toBeInTheDocument();
  });

  it("crea el valor con lo escrito", async () => {
    renderCreate();

    type("Código", "VALOR NUEVO");
    type("Título (opcional)", "Su título");
    type("Descripción", "Su descripción.");
    create();

    await screen.findByText("Valor creado.");
    expect(mocks.createValue).toHaveBeenCalledTimes(1);
    expect(mocks.createValue).toHaveBeenCalledWith("club-a", {
      code: "VALOR NUEVO",
      title: "Su título",
      description: "Su descripción.",
    });
    expect(mocks.updateValue).not.toHaveBeenCalled();
  });

  it("al crear, el formulario queda vacío, lo anuncia y lleva el foco al primer campo", async () => {
    renderCreate();

    type("Código", "VALOR NUEVO");
    type("Título (opcional)", "Su título");
    type("Descripción", "Su descripción.");
    create();

    const status = await screen.findByText("Valor creado.");
    expect(status.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByLabelText("Código")).toHaveValue("");
    expect(screen.getByLabelText("Título (opcional)")).toHaveValue("");
    expect(screen.getByLabelText("Descripción")).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText("Código")).toHaveFocus());
  });

  it("el aviso de «Valor creado.» se quita al empezar el siguiente", async () => {
    renderCreate();

    type("Código", "A");
    type("Descripción", "B");
    create();
    await screen.findByText("Valor creado.");

    type("Código", "C");

    expect(screen.queryByText("Valor creado.")).not.toBeInTheDocument();
  });

  it("se pueden crear dos seguidos, cada uno con lo suyo", async () => {
    renderCreate();

    type("Código", "UNO");
    type("Descripción", "Primero.");
    create();
    await screen.findByText("Valor creado.");

    type("Código", "DOS");
    type("Descripción", "Segundo.");
    create();
    await waitFor(() => expect(mocks.createValue).toHaveBeenCalledTimes(2));

    expect(mocks.createValue.mock.calls[1][1]).toEqual({
      code: "DOS",
      title: "",
      description: "Segundo.",
    });
  });

  it("mientras se crea, el botón espera: un doble toque no crea dos valores", async () => {
    let finish: (result: ActionResult<{ id: string }>) => void = () => {};
    mocks.createValue.mockReturnValue(
      new Promise<ActionResult<{ id: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    renderCreate();

    type("Código", "UNO");
    create();
    await waitFor(() => expect(screen.getByRole("button", { name: "Crear valor" })).toBeDisabled());
    create();
    expect(mocks.createValue).toHaveBeenCalledTimes(1);

    finish(ok({ id: NEW_ID }));
    await screen.findByText("Valor creado.");
  });

  it("sin código ni descripción: cada error bajo su campo y lo escrito se queda", async () => {
    mocks.createValue.mockResolvedValue(
      fail("INVALID", {
        code: "Escribe el código del valor.",
        description: "Escribe una descripción.",
      }),
    );
    renderCreate();

    type("Título (opcional)", "Solo el título");
    create();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message] of [
      ["Código", "Escribe el código del valor."],
      ["Descripción", "Escribe una descripción."],
    ]) {
      expect(screen.getByLabelText(label), label).toHaveAttribute(
        "aria-describedby",
        screen.getByText(message).id,
      );
    }
    expect(screen.getByLabelText("Título (opcional)")).toHaveValue("Solo el título");
    expect(screen.queryByText("Valor creado.")).not.toBeInTheDocument();
  });

  it("si no se puede guardar, lo dice y no vacía el formulario", async () => {
    mocks.createValue.mockResolvedValue(fail("SAVE_FAILED"));
    renderCreate();

    type("Código", "UNO");
    type("Descripción", "Primero.");
    create();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.getByLabelText("Código")).toHaveValue("UNO");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Primero.");
    expect(screen.getByRole("button", { name: "Crear valor" })).toBeEnabled();
  });

  it("si la acción lanza, tampoco se queda sin avisar", async () => {
    mocks.createValue.mockRejectedValue(new Error("fetch failed"));
    renderCreate();

    type("Código", "UNO");
    create();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
  });
});
