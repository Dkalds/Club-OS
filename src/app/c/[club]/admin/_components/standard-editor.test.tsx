import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { AdminStandard } from "@/modules/methodology/types";

const mocks = vi.hoisted(() => ({
  createStandard: vi.fn(),
  updateStandard: vi.fn(),
  moveMethodologyItem: vi.fn(),
  setMethodologyStatus: vi.fn(),
}));

vi.mock("@/modules/methodology/actions", () => ({
  createStandard: mocks.createStandard,
  updateStandard: mocks.updateStandard,
  moveMethodologyItem: mocks.moveMethodologyItem,
  setMethodologyStatus: mocks.setMethodologyStatus,
}));

import { StandardEditor } from "./standard-editor";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ID = "00000000-0000-4000-8000-000000000001";
const NEW_ID = "00000000-0000-4000-8000-0000000000aa";
const REPEATED = "Ya existe un Standard con ese número.";

function standard(overrides: Partial<AdminStandard> = {}): AdminStandard {
  return {
    id: ID,
    number: 3,
    title: "STANDARD A",
    description: "Una descripción.",
    status: "published",
    ...overrides,
  };
}

function renderEditor(props: Partial<Parameters<typeof StandardEditor>[0]> = {}) {
  return render(<StandardEditor clubSlug="club-a" standard={standard()} {...props} />);
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Crear Standard" }));
const type = (label: string, text: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createStandard.mockResolvedValue(ok({ id: NEW_ID }));
  mocks.updateStandard.mockResolvedValue(ok(null));
  mocks.moveMethodologyItem.mockResolvedValue(ok(null));
  mocks.setMethodologyStatus.mockResolvedValue(ok(null));
});

describe("StandardEditor · un Standard que existe", () => {
  it("empieza con lo que tiene guardado: el número es un campo numérico", () => {
    renderEditor();

    const number = screen.getByLabelText("Número");
    expect(number).toHaveAttribute("type", "number");
    expect(number).toHaveValue(3);
    expect(screen.getByLabelText("Título")).toHaveValue("STANDARD A");
    expect(screen.getByLabelText("Título")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Descripción")).toHaveValue("Una descripción.");
    expect(screen.getByLabelText("Descripción")).toHaveAttribute("maxlength", "500");
  });

  it("la card lleva su número de dos cifras, su título y su estado", () => {
    renderEditor({ standard: standard({ number: 3 }) });

    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "STANDARD A" })).toBeInTheDocument();
    expect(screen.getByText("Publicado")).toBeInTheDocument();
  });

  it("el número de la card es el guardado, no el que se está escribiendo", () => {
    renderEditor({ standard: standard({ number: 3 }) });

    type("Número", "12");

    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.queryByText("12")).not.toBeInTheDocument();
  });

  it("un borrador lo dice y se publica desde sus controles, con el título en el nombre", async () => {
    renderEditor({ standard: standard({ status: "draft" }), isFirst: true });

    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir STANDARD A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar STANDARD A" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Publicar STANDARD A" }));
    await waitFor(() => expect(mocks.setMethodologyStatus).toHaveBeenCalledTimes(1));
    expect(mocks.setMethodologyStatus).toHaveBeenCalledWith("club-a", {
      kind: "standards",
      id: ID,
      status: "published",
    });
  });

  it("los controles mueven dentro de la lista de Standards; el último no baja", async () => {
    renderEditor({ isLast: true });

    expect(screen.getByRole("button", { name: "Bajar STANDARD A" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Subir STANDARD A" }));

    await waitFor(() => expect(mocks.moveMethodologyItem).toHaveBeenCalledTimes(1));
    expect(mocks.moveMethodologyItem).toHaveBeenCalledWith("club-a", {
      kind: "standards",
      id: ID,
      direction: "up",
    });
  });

  it("«Guardar» es secondary y no hay botón de alta", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Guardar" })).toHaveClass("border-line-strong");
    expect(screen.getByRole("button", { name: "Guardar" })).not.toHaveClass("bg-brand-accent");
    expect(screen.queryByRole("button", { name: "Crear Standard" })).not.toBeInTheDocument();
  });

  it("guarda lo escrito con el id y el número como número", async () => {
    renderEditor();

    type("Número", "7");
    type("Título", "STANDARD B");
    type("Descripción", "Otra descripción.");
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updateStandard).toHaveBeenCalledTimes(1);
    expect(mocks.updateStandard).toHaveBeenCalledWith("club-a", {
      id: ID,
      number: 7,
      title: "STANDARD B",
      description: "Otra descripción.",
    });
    expect(mocks.createStandard).not.toHaveBeenCalled();
  });

  it("un número vacío no se inventa: llega como 0 y la acción lo rechaza con su mensaje", async () => {
    mocks.updateStandard.mockResolvedValue(
      fail("INVALID", { number: "El número tiene que estar entre 1 y 99." }),
    );
    renderEditor();

    type("Número", "");
    save();

    await screen.findByText("El número tiene que estar entre 1 y 99.");
    expect(mocks.updateStandard.mock.calls[0][1].number).toBe(0);
  });

  it("el aviso de guardado es un estado y se vacía al tocar un campo", async () => {
    renderEditor();
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();

    save();
    await screen.findByText("Cambios guardados.");
    expect(screen.getByRole("status")).toBe(region);

    type("Título", "Otro");
    expect(region).toBeEmptyDOMElement();
  });

  it("un número que ya existe se explica bajo «Número» y deja el resto como está", async () => {
    mocks.updateStandard.mockResolvedValue(fail("INVALID", { number: REPEATED }));
    renderEditor();

    type("Número", "4");
    save();

    const message = await screen.findByText(REPEATED);
    const number = screen.getByLabelText("Número");
    expect(number).toHaveAttribute("aria-invalid", "true");
    expect(number).toHaveAttribute("aria-describedby", message.id);
    expect(screen.getByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).not.toHaveAttribute("aria-invalid");
    expect(number).toHaveValue(4);
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("entrada inválida: cada error bajo su campo", async () => {
    mocks.updateStandard.mockResolvedValue(
      fail("INVALID", { title: "Escribe un título.", description: "Escribe una descripción." }),
    );
    renderEditor();

    save();

    await screen.findByText(ACTION_ERROR_COPY.INVALID);
    for (const [label, text] of [
      ["Título", "Escribe un título."],
      ["Descripción", "Escribe una descripción."],
    ]) {
      expect(screen.getByLabelText(label), label).toHaveAttribute(
        "aria-describedby",
        screen.getByText(text).id,
      );
    }
  });

  it("mientras guarda, el botón espera y no se lanza un segundo guardado", async () => {
    let finish: (result: ActionResult<null>) => void = () => {};
    mocks.updateStandard.mockReturnValue(
      new Promise<ActionResult<null>>((resolve) => {
        finish = resolve;
      }),
    );
    renderEditor();

    save();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled());
    save();
    expect(mocks.updateStandard).toHaveBeenCalledTimes(1);

    finish(ok(null));
    await screen.findByText("Cambios guardados.");
  });

  it("si no se puede guardar, lo dice con el copy del contrato y no pierde lo escrito", async () => {
    mocks.updateStandard.mockResolvedValue(fail("SAVE_FAILED"));
    renderEditor();

    type("Título", "No se pierde");
    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.getByLabelText("Título")).toHaveValue("No se pierde");
  });

  it("si la acción lanza, tampoco se queda sin avisar", async () => {
    mocks.updateStandard.mockRejectedValue(new Error("fetch failed"));
    renderEditor();

    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
  });

  it("repintar la card con datos nuevos no pisa lo que se está escribiendo", () => {
    const { rerender } = renderEditor();

    type("Título", "Lo que escribo");
    rerender(<StandardEditor clubSlug="club-a" standard={standard({ title: "Lo de la base" })} />);

    expect(screen.getByLabelText("Título")).toHaveValue("Lo que escribo");
    // El encabezado sí es lo guardado.
    expect(screen.getByRole("heading", { level: 2, name: "Lo de la base" })).toBeInTheDocument();
  });
});

describe("StandardEditor · el alta", () => {
  function renderCreate(defaultNumber?: number) {
    return render(<StandardEditor clubSlug="club-a" defaultNumber={defaultNumber} />);
  }

  it("es un formulario con nombre, con el número propuesto y el resto vacío", () => {
    renderCreate(6);

    const form = screen.getByRole("form", { name: "Nuevo Standard" });
    expect(within(form).getByLabelText("Número")).toHaveValue(6);
    expect(within(form).getByLabelText("Título")).toHaveValue("");
    expect(within(form).getByLabelText("Descripción")).toHaveValue("");
    expect(screen.getByRole("heading", { level: 2, name: "Nuevo Standard" })).toBeInTheDocument();
  });

  it("sin número propuesto empieza en 1", () => {
    renderCreate();

    expect(screen.getByLabelText("Número")).toHaveValue(1);
  });

  it("«Crear Standard» es el único primary; no hay estado ni controles", () => {
    renderCreate(6);

    const button = screen.getByRole("button", { name: "Crear Standard" });
    expect(button).toHaveClass("bg-brand-accent", "text-brand-on-accent");
    expect(button).toHaveAttribute("type", "submit");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Borrador")).not.toBeInTheDocument();
  });

  it("crea el Standard con el número propuesto sin tocarlo", async () => {
    renderCreate(6);

    type("Título", "STANDARD NUEVO");
    type("Descripción", "Su descripción.");
    create();

    await screen.findByText("Standard creado.");
    expect(mocks.createStandard).toHaveBeenCalledTimes(1);
    expect(mocks.createStandard).toHaveBeenCalledWith("club-a", {
      number: 6,
      title: "STANDARD NUEVO",
      description: "Su descripción.",
    });
    expect(mocks.updateStandard).not.toHaveBeenCalled();
  });

  it("crea con el número que se elige, no con el propuesto", async () => {
    renderCreate(6);

    type("Número", "9");
    type("Título", "STANDARD NUEVO");
    type("Descripción", "Su descripción.");
    create();

    await screen.findByText("Standard creado.");
    expect(mocks.createStandard.mock.calls[0][1].number).toBe(9);
  });

  it("al crear, vacía el formulario, lo anuncia, lleva el foco al título y propone el siguiente número", async () => {
    renderCreate(6);

    type("Título", "STANDARD NUEVO");
    type("Descripción", "Su descripción.");
    create();

    const status = await screen.findByText("Standard creado.");
    expect(status.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText("Descripción")).toHaveValue("");
    expect(screen.getByLabelText("Número")).toHaveValue(7);
    // El número ya viene propuesto: se sigue por el título.
    await waitFor(() => expect(screen.getByLabelText("Título")).toHaveFocus());
  });

  it("si se crea uno con un número más alto, el siguiente propuesto lo supera", async () => {
    renderCreate(6);

    type("Número", "10");
    type("Título", "A");
    type("Descripción", "B");
    create();

    await screen.findByText("Standard creado.");
    expect(screen.getByLabelText("Número")).toHaveValue(11);
  });

  it("si se rellena un hueco más bajo, el siguiente propuesto sigue siendo el máximo más uno", async () => {
    renderCreate(6);

    type("Número", "2");
    type("Título", "A");
    type("Descripción", "B");
    create();

    await screen.findByText("Standard creado.");
    expect(screen.getByLabelText("Número")).toHaveValue(6);
  });

  it("si la página se repinta con un número propuesto nuevo antes del alta, lo escrito manda", () => {
    const { rerender } = renderCreate(6);

    type("Número", "9");
    rerender(<StandardEditor clubSlug="club-a" defaultNumber={7} />);

    expect(screen.getByLabelText("Número")).toHaveValue(9);
  });

  it("un número repetido se explica bajo «Número», sin alta y con lo escrito en su sitio", async () => {
    mocks.createStandard.mockResolvedValue(fail("INVALID", { number: REPEATED }));
    renderCreate(6);

    type("Número", "3");
    type("Título", "STANDARD NUEVO");
    type("Descripción", "Su descripción.");
    create();

    const message = await screen.findByText(REPEATED);
    expect(screen.getByLabelText("Número")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Número")).toHaveAttribute("aria-describedby", message.id);
    expect(screen.getByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    expect(screen.getByLabelText("Número")).toHaveValue(3);
    expect(screen.getByLabelText("Título")).toHaveValue("STANDARD NUEVO");
    expect(screen.queryByText("Standard creado.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear Standard" })).toBeEnabled();
  });

  it("el error del número se quita al enviar de nuevo", async () => {
    mocks.createStandard.mockResolvedValueOnce(fail("INVALID", { number: REPEATED }));
    renderCreate(6);

    type("Título", "A");
    type("Descripción", "B");
    create();
    await screen.findByText(REPEATED);

    type("Número", "8");
    create();

    await screen.findByText("Standard creado.");
    expect(screen.queryByText(REPEATED)).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_ERROR_COPY.INVALID)).not.toBeInTheDocument();
  });

  it("mientras se crea, el botón espera: un doble toque no crea dos Standards", async () => {
    let finish: (result: ActionResult<{ id: string }>) => void = () => {};
    mocks.createStandard.mockReturnValue(
      new Promise<ActionResult<{ id: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    renderCreate(6);

    type("Título", "A");
    create();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Crear Standard" })).toBeDisabled(),
    );
    create();
    expect(mocks.createStandard).toHaveBeenCalledTimes(1);

    finish(ok({ id: NEW_ID }));
    await screen.findByText("Standard creado.");
  });

  it("si no se puede guardar, lo dice y no vacía el formulario", async () => {
    mocks.createStandard.mockResolvedValue(fail("SAVE_FAILED"));
    renderCreate(6);

    type("Título", "A");
    create();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.getByLabelText("Título")).toHaveValue("A");
    expect(screen.getByLabelText("Número")).toHaveValue(6);
  });
});
