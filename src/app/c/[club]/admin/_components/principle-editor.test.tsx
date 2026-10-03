import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { GamePrinciple } from "@/modules/methodology/types";

const mocks = vi.hoisted(() => ({
  createPrinciple: vi.fn(),
  savePrinciple: vi.fn(),
  moveMethodologyItem: vi.fn(),
  setMethodologyStatus: vi.fn(),
}));

vi.mock("@/modules/methodology/actions", () => ({
  createPrinciple: mocks.createPrinciple,
  savePrinciple: mocks.savePrinciple,
  moveMethodologyItem: mocks.moveMethodologyItem,
  setMethodologyStatus: mocks.setMethodologyStatus,
}));

import { PrincipleEditor } from "./principle-editor";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ID = "00000000-0000-4000-8000-000000000001";
const NEW_ID = "00000000-0000-4000-8000-0000000000aa";
const AT_MOST_12 = "Un principio tiene como máximo 12 puntos.";

function principle(overrides: Partial<GamePrinciple> = {}, texts: string[] = []): GamePrinciple {
  return {
    id: ID,
    slug: "un-principio",
    title: "Un principio",
    summary: "Su resumen.",
    status: "published",
    points: texts.map((text, index) => ({ id: `point-${index + 1}`, text })),
    ...overrides,
  };
}

function renderEditor(texts: string[] = [], props: Partial<Parameters<typeof PrincipleEditor>[0]> = {}) {
  return render(
    <PrincipleEditor clubSlug="club-a" principle={principle({}, texts)} {...props} />,
  );
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Crear principio" }));
const type = (label: string, text: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

/** Los campos de los puntos, en el orden en que están en pantalla. */
const inputs = () => screen.queryAllByLabelText(/^Punto \d+$/) as HTMLInputElement[];
const texts = () => inputs().map((input) => input.value);
const add = () => screen.queryByRole("button", { name: "Añadir punto" });

function lastSaved() {
  return mocks.savePrinciple.mock.calls[mocks.savePrinciple.mock.calls.length - 1][1];
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createPrinciple.mockResolvedValue(ok({ id: NEW_ID }));
  mocks.savePrinciple.mockResolvedValue(ok(null));
  mocks.moveMethodologyItem.mockResolvedValue(ok(null));
  mocks.setMethodologyStatus.mockResolvedValue(ok(null));
});

describe("PrincipleEditor · un principio que existe", () => {
  it("empieza con lo que tiene guardado, con los límites de cada campo", () => {
    renderEditor(["Primero", "Segundo"]);

    expect(screen.getByLabelText("Título")).toHaveValue("Un principio");
    expect(screen.getByLabelText("Título")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Resumen (opcional)")).toHaveValue("Su resumen.");
    expect(screen.getByLabelText("Resumen (opcional)")).toHaveAttribute("maxlength", "300");
  });

  it("un principio sin resumen empieza con el campo vacío", () => {
    render(<PrincipleEditor clubSlug="club-a" principle={principle({ summary: null })} />);

    expect(screen.getByLabelText("Resumen (opcional)")).toHaveValue("");
  });

  it("la card se llama como el título del principio y dice su estado", () => {
    renderEditor();

    expect(screen.getByRole("heading", { level: 2, name: "Un principio" })).toBeInTheDocument();
    expect(screen.getByText("Publicado")).toBeInTheDocument();
  });

  it("lleva los controles de la fila sobre la lista de principios, con el título en su nombre", async () => {
    render(
      <PrincipleEditor
        clubSlug="club-a"
        principle={principle({ status: "draft" })}
        isFirst
        isLast={false}
      />,
    );

    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir Un principio" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Un principio" })).toBeEnabled();

    press("Publicar Un principio");
    await waitFor(() => expect(mocks.setMethodologyStatus).toHaveBeenCalledTimes(1));
    expect(mocks.setMethodologyStatus).toHaveBeenCalledWith("club-a", {
      kind: "game_principles",
      id: ID,
      status: "published",
    });
  });

  it("el último no baja", () => {
    renderEditor([], { isLast: true });

    expect(screen.getByRole("button", { name: "Bajar Un principio" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Subir Un principio" })).toBeEnabled();
  });

  it("«Guardar» es secondary y no hay botón de alta", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Guardar" })).toHaveClass("border-line-strong");
    expect(screen.getByRole("button", { name: "Guardar" })).not.toHaveClass("bg-brand-accent");
    expect(screen.queryByRole("button", { name: "Crear principio" })).not.toBeInTheDocument();
  });

  describe("los puntos", () => {
    it("son un grupo «Puntos» con una fila por punto, en su orden, cada una con sus controles", () => {
      renderEditor(["Primero", "Segundo", "Tercero"]);

      const group = screen.getByRole("group", { name: "Puntos" });
      expect(within(group).getAllByRole("listitem")).toHaveLength(3);
      expect(texts()).toEqual(["Primero", "Segundo", "Tercero"]);
      for (const input of inputs()) expect(input).toHaveAttribute("maxlength", "200");
      for (const n of [1, 2, 3]) {
        expect(screen.getByRole("button", { name: `Subir punto ${n}` })).toHaveTextContent("Subir");
        expect(screen.getByRole("button", { name: `Bajar punto ${n}` })).toHaveTextContent("Bajar");
        expect(screen.getByRole("button", { name: `Quitar punto ${n}` })).toHaveTextContent("Quitar");
      }
    });

    it("un principio sin puntos enseña el grupo sin filas y «Añadir punto»", () => {
      renderEditor([]);

      expect(screen.getByRole("group", { name: "Puntos" })).toBeInTheDocument();
      expect(within(screen.getByRole("group", { name: "Puntos" })).queryAllByRole("listitem")).toHaveLength(0);
      expect(add()).toBeInTheDocument();
    });

    it("el primero no sube y el último no baja", () => {
      renderEditor(["A", "B", "C"]);

      expect(screen.getByRole("button", { name: "Subir punto 1" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Bajar punto 1" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Subir punto 3" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Bajar punto 3" })).toBeDisabled();
    });

    it("un solo punto no se puede mover, pero sí quitar", () => {
      renderEditor(["A"]);

      expect(screen.getByRole("button", { name: "Subir punto 1" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Bajar punto 1" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Quitar punto 1" })).toBeEnabled();
    });

    it("«Añadir punto» pone una fila vacía al final y le da el foco", () => {
      renderEditor(["A", "B"]);

      press("Añadir punto");

      expect(texts()).toEqual(["A", "B", ""]);
      expect(screen.getByLabelText("Punto 3")).toHaveFocus();
    });

    it("se escribe en el punto que se ha añadido, sin perder los demás", () => {
      renderEditor(["A"]);

      press("Añadir punto");
      type("Punto 2", "Nuevo");

      expect(texts()).toEqual(["A", "Nuevo"]);
    });

    it("«Quitar» quita esa fila, renumera las demás y lleva el foco a la siguiente", () => {
      renderEditor(["A", "B", "C"]);

      press("Quitar punto 2");

      expect(texts()).toEqual(["A", "C"]);
      expect(screen.getByLabelText("Punto 2")).toHaveFocus();
      expect(screen.getByLabelText("Punto 2")).toHaveValue("C");
    });

    it("quitar el último lleva el foco al anterior", () => {
      renderEditor(["A", "B", "C"]);

      press("Quitar punto 3");

      expect(texts()).toEqual(["A", "B"]);
      expect(screen.getByLabelText("Punto 2")).toHaveFocus();
    });

    it("quitar el único punto lleva el foco a «Añadir punto»", () => {
      renderEditor(["A"]);

      press("Quitar punto 1");

      expect(texts()).toEqual([]);
      expect(add()).toHaveFocus();
    });

    it("«Subir» sube el punto y el foco sigue en su botón; si ya no puede subir, pasa a «Bajar»", () => {
      renderEditor(["A", "B", "C"]);

      press("Subir punto 3");
      expect(texts()).toEqual(["A", "C", "B"]);
      expect(screen.getByRole("button", { name: "Subir punto 2" })).toHaveFocus();

      press("Subir punto 2");
      expect(texts()).toEqual(["C", "A", "B"]);
      // Es el primero: su «Subir» está desactivado y el foco pasa a su pareja.
      expect(screen.getByRole("button", { name: "Subir punto 1" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Bajar punto 1" })).toHaveFocus();
    });

    it("«Bajar» baja el punto y el foco sigue en su botón; en el último pasa a «Subir»", () => {
      renderEditor(["A", "B", "C"]);

      press("Bajar punto 1");
      expect(texts()).toEqual(["B", "A", "C"]);
      expect(screen.getByRole("button", { name: "Bajar punto 2" })).toHaveFocus();

      press("Bajar punto 2");
      expect(texts()).toEqual(["B", "C", "A"]);
      expect(screen.getByRole("button", { name: "Bajar punto 3" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Subir punto 3" })).toHaveFocus();
    });

    it("lo escrito en un punto viaja con él al moverlo", () => {
      renderEditor(["A", "B"]);

      type("Punto 1", "A editado");
      press("Bajar punto 1");

      expect(texts()).toEqual(["B", "A editado"]);
    });

    it("con 12 puntos no se ofrece otro y se dice por qué", () => {
      renderEditor(Array.from({ length: 12 }, (_, index) => `Punto ${index + 1}`));

      expect(inputs()).toHaveLength(12);
      expect(add()).not.toBeInTheDocument();
      expect(screen.getByText(AT_MOST_12)).toBeInTheDocument();
    });

    it("con 11 se ofrece; al añadir el 12.º desaparece y al quitar uno vuelve", () => {
      renderEditor(Array.from({ length: 11 }, (_, index) => `Punto ${index + 1}`));
      expect(add()).toBeInTheDocument();
      expect(screen.queryByText(AT_MOST_12)).not.toBeInTheDocument();

      press("Añadir punto");
      expect(inputs()).toHaveLength(12);
      expect(add()).not.toBeInTheDocument();
      expect(screen.getByText(AT_MOST_12)).toBeInTheDocument();

      press("Quitar punto 12");
      expect(inputs()).toHaveLength(11);
      expect(add()).toBeInTheDocument();
      expect(screen.queryByText(AT_MOST_12)).not.toBeInTheDocument();
    });

    it("quitar un punto cuando hay 12 lleva el foco a la fila vecina, no al botón que aparece", () => {
      renderEditor(Array.from({ length: 12 }, (_, index) => `Punto ${index + 1}`));

      press("Quitar punto 5");

      expect(screen.getByLabelText("Punto 5")).toHaveFocus();
      expect(screen.getByLabelText("Punto 5")).toHaveValue("Punto 6");
    });

    it("la card de 12 puntos no se rompe: cada fila lleva sus tres controles", () => {
      renderEditor(Array.from({ length: 12 }, (_, index) => `Punto ${index + 1}`));

      for (const verb of ["Subir", "Bajar", "Quitar"]) {
        expect(screen.getAllByRole("button", { name: new RegExp(`^${verb} punto \\d+$`) })).toHaveLength(12);
      }
    });
  });

  describe("guardar", () => {
    it("manda el título, el resumen y los puntos en el orden en que están en pantalla", async () => {
      renderEditor(["A", "B", "C"]);

      type("Título", "Otro título");
      type("Resumen (opcional)", "Otro resumen.");
      type("Punto 2", "B editado");
      press("Subir punto 3");
      press("Añadir punto");
      type("Punto 4", "D");
      save();

      await screen.findByText("Cambios guardados.");
      expect(mocks.savePrinciple).toHaveBeenCalledTimes(1);
      expect(mocks.savePrinciple).toHaveBeenCalledWith("club-a", {
        id: ID,
        title: "Otro título",
        summary: "Otro resumen.",
        points: ["A", "C", "B editado", "D"],
      });
      expect(mocks.createPrinciple).not.toHaveBeenCalled();
    });

    it("sin tocar nada manda lo guardado tal cual", async () => {
      renderEditor(["A", "B"]);

      save();

      await screen.findByText("Cambios guardados.");
      expect(lastSaved()).toEqual({
        id: ID,
        title: "Un principio",
        summary: "Su resumen.",
        points: ["A", "B"],
      });
    });

    it("un principio sin puntos se guarda con la lista vacía", async () => {
      renderEditor([]);

      save();

      await screen.findByText("Cambios guardados.");
      expect(lastSaved().points).toEqual([]);
    });

    it("las filas en blanco viajan como están (la acción las descarta) y, guardado, desaparecen", async () => {
      renderEditor(["A", "B"]);

      press("Añadir punto");
      press("Añadir punto");
      type("Punto 4", "D");
      save();

      await screen.findByText("Cambios guardados.");
      expect(lastSaved().points).toEqual(["A", "B", "", "D"]);
      // Lo que la base de datos guardó es lo que se ve: sin el hueco en blanco.
      expect(texts()).toEqual(["A", "B", "D"]);
    });

    it("una fila de solo espacios cuenta como en blanco y también se va", async () => {
      renderEditor(["A"]);

      press("Añadir punto");
      type("Punto 2", "   ");
      save();

      await screen.findByText("Cambios guardados.");
      expect(texts()).toEqual(["A"]);
    });

    it("si no se guarda, las filas en blanco se quedan donde están", async () => {
      mocks.savePrinciple.mockResolvedValue(fail("SAVE_FAILED"));
      renderEditor(["A"]);

      press("Añadir punto");
      save();

      await screen.findByRole("alert");
      expect(texts()).toEqual(["A", ""]);
    });

    it("el aviso de guardado es un estado: la región ya está y se vacía al tocar cualquier cosa de los puntos", async () => {
      renderEditor(["A", "B"]);
      const region = screen.getByRole("status");
      expect(region).toBeEmptyDOMElement();

      save();
      await screen.findByText("Cambios guardados.");
      expect(screen.getByRole("status")).toBe(region);

      press("Bajar punto 1");
      expect(region).toBeEmptyDOMElement();

      save();
      await screen.findByText("Cambios guardados.");
      press("Quitar punto 1");
      expect(region).toBeEmptyDOMElement();

      save();
      await screen.findByText("Cambios guardados.");
      press("Añadir punto");
      expect(region).toBeEmptyDOMElement();

      save();
      await screen.findByText("Cambios guardados.");
      type("Punto 1", "otro");
      expect(region).toBeEmptyDOMElement();
    });

    it("repintar la card con datos nuevos (la acción revalida) no pisa los puntos que se están editando", () => {
      const { rerender } = renderEditor(["A", "B"]);

      press("Quitar punto 1");
      type("Título", "Lo que escribo");
      rerender(
        <PrincipleEditor
          clubSlug="club-a"
          principle={principle({ title: "Lo de la base" }, ["X", "Y", "Z"])}
        />,
      );

      expect(texts()).toEqual(["B"]);
      expect(screen.getByLabelText("Título")).toHaveValue("Lo que escribo");
      // El encabezado sí es lo guardado.
      expect(screen.getByRole("heading", { level: 2, name: "Lo de la base" })).toBeInTheDocument();
    });

    it("mientras guarda, el botón espera y no se lanza un segundo guardado", async () => {
      let finish: (result: ActionResult<null>) => void = () => {};
      mocks.savePrinciple.mockReturnValue(
        new Promise<ActionResult<null>>((resolve) => {
          finish = resolve;
        }),
      );
      renderEditor(["A"]);

      save();
      await waitFor(() => expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled());
      save();
      expect(mocks.savePrinciple).toHaveBeenCalledTimes(1);

      finish(ok(null));
      await screen.findByText("Cambios guardados.");
      expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    });
  });

  describe("errores", () => {
    it("entrada inválida: el aviso general arriba y el error de cada campo bajo él, enlazado", async () => {
      mocks.savePrinciple.mockResolvedValue(
        fail("INVALID", { title: "Escribe un título.", summary: "Máximo 300 caracteres." }),
      );
      renderEditor(["A"]);

      save();

      expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
      for (const [label, message] of [
        ["Título", "Escribe un título."],
        ["Resumen (opcional)", "Máximo 300 caracteres."],
      ]) {
        const field = screen.getByLabelText(label);
        expect(field, label).toHaveAttribute("aria-invalid", "true");
        expect(field, label).toHaveAttribute("aria-describedby", screen.getByText(message).id);
      }
      expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    });

    it("el error de un punto sale bajo su fila y lo señala", async () => {
      mocks.savePrinciple.mockResolvedValue(fail("INVALID", { "points.1": "Máximo 200 caracteres." }));
      renderEditor(["A", "B", "C"]);

      save();

      const message = await screen.findByText("Máximo 200 caracteres.");
      expect(screen.getByLabelText("Punto 2")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText("Punto 2")).toHaveAttribute("aria-describedby", message.id);
      expect(screen.getByLabelText("Punto 1")).not.toHaveAttribute("aria-invalid");
      expect(screen.getByLabelText("Punto 3")).not.toHaveAttribute("aria-invalid");
    });

    it("el error de un punto sigue a su fila cuando se mueve, y desaparece si se quita", async () => {
      mocks.savePrinciple.mockResolvedValue(fail("INVALID", { "points.1": "Máximo 200 caracteres." }));
      renderEditor(["A", "B", "C"]);

      save();
      await screen.findByText("Máximo 200 caracteres.");

      // «B» sube al primer puesto: el error la acompaña, no se queda en el segundo.
      press("Subir punto 2");
      expect(texts()).toEqual(["B", "A", "C"]);
      expect(screen.getByLabelText("Punto 1")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText("Punto 2")).not.toHaveAttribute("aria-invalid");

      press("Quitar punto 1");
      expect(screen.queryByText("Máximo 200 caracteres.")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Punto 1")).not.toHaveAttribute("aria-invalid");
    });

    it("el error de un punto no cae en una fila que se añade después", async () => {
      mocks.savePrinciple.mockResolvedValue(fail("INVALID", { "points.1": "Máximo 200 caracteres." }));
      renderEditor(["A", "B"]);

      save();
      await screen.findByText("Máximo 200 caracteres.");
      press("Añadir punto");

      expect(screen.getByLabelText("Punto 3")).not.toHaveAttribute("aria-invalid");
    });

    it("demasiados puntos: el error del grupo sale bajo la lista", async () => {
      mocks.savePrinciple.mockResolvedValue(fail("INVALID", { points: AT_MOST_12 }));
      renderEditor(["A"]);

      save();

      const message = await screen.findByText(AT_MOST_12);
      expect(message).toHaveAttribute("role", "alert");
      expect(screen.getByRole("group", { name: "Puntos" })).toContainElement(message);
    });

    it("un error se quita al guardar de nuevo", async () => {
      mocks.savePrinciple.mockResolvedValueOnce(
        fail("INVALID", { title: "Escribe un título.", "points.0": "Máximo 200 caracteres." }),
      );
      renderEditor(["A"]);

      save();
      await screen.findByText("Escribe un título.");
      save();

      await screen.findByText("Cambios guardados.");
      expect(screen.queryByText("Escribe un título.")).not.toBeInTheDocument();
      expect(screen.queryByText("Máximo 200 caracteres.")).not.toBeInTheDocument();
      expect(screen.queryByText(ACTION_ERROR_COPY.INVALID)).not.toBeInTheDocument();
    });

    it("si no se puede guardar, lo dice con el copy del contrato y no pierde lo escrito", async () => {
      mocks.savePrinciple.mockResolvedValue(fail("SAVE_FAILED"));
      renderEditor(["A"]);

      press("Añadir punto");
      type("Punto 2", "No se pierde");
      save();

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
      await waitFor(() => expect(alert).toHaveFocus());
      expect(texts()).toEqual(["A", "No se pierde"]);
      expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    });

    it("si la acción lanza, tampoco se queda sin avisar", async () => {
      mocks.savePrinciple.mockRejectedValue(new Error("fetch failed"));
      renderEditor(["A"]);

      save();

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
      expect(alert).not.toHaveTextContent("fetch failed");
    });
  });
});

describe("PrincipleEditor · el alta", () => {
  function renderCreate() {
    return render(<PrincipleEditor clubSlug="club-a" />);
  }

  it("es un formulario con nombre que solo pide el título y el resumen", () => {
    renderCreate();

    const form = screen.getByRole("form", { name: "Nuevo principio" });
    expect(within(form).getByLabelText("Título")).toHaveValue("");
    expect(within(form).getByLabelText("Resumen (opcional)")).toHaveValue("");
    expect(screen.getByRole("heading", { level: 2, name: "Nuevo principio" })).toBeInTheDocument();
    // Los puntos se añaden al guardar el principio, ya creado.
    expect(screen.queryByRole("group", { name: "Puntos" })).not.toBeInTheDocument();
    expect(add()).not.toBeInTheDocument();
  });

  it("«Crear principio» es el único primary; no hay estado ni controles", () => {
    renderCreate();

    const button = screen.getByRole("button", { name: "Crear principio" });
    expect(button).toHaveClass("bg-brand-accent", "text-brand-on-accent");
    expect(button).toHaveAttribute("type", "submit");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("Borrador")).not.toBeInTheDocument();
  });

  it("crea el principio con el título y el resumen", async () => {
    renderCreate();

    type("Título", "Principio nuevo");
    type("Resumen (opcional)", "Su resumen.");
    create();

    await screen.findByText("Principio creado.");
    expect(mocks.createPrinciple).toHaveBeenCalledTimes(1);
    expect(mocks.createPrinciple).toHaveBeenCalledWith("club-a", {
      title: "Principio nuevo",
      summary: "Su resumen.",
    });
    expect(mocks.savePrinciple).not.toHaveBeenCalled();
  });

  it("al crear, vacía el formulario, lo anuncia y lleva el foco al título", async () => {
    renderCreate();

    type("Título", "Principio nuevo");
    type("Resumen (opcional)", "Su resumen.");
    create();

    const status = await screen.findByText("Principio creado.");
    expect(status.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText("Resumen (opcional)")).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText("Título")).toHaveFocus());
  });

  it("sin título: el error bajo el campo y lo escrito se queda", async () => {
    mocks.createPrinciple.mockResolvedValue(fail("INVALID", { title: "Escribe un título." }));
    renderCreate();

    type("Resumen (opcional)", "Solo el resumen");
    create();

    const message = await screen.findByText("Escribe un título.");
    expect(screen.getByLabelText("Título")).toHaveAttribute("aria-describedby", message.id);
    expect(screen.getByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    expect(screen.getByLabelText("Resumen (opcional)")).toHaveValue("Solo el resumen");
    expect(screen.queryByText("Principio creado.")).not.toBeInTheDocument();
  });

  it("mientras se crea, el botón espera: un doble toque no crea dos principios", async () => {
    let finish: (result: ActionResult<{ id: string }>) => void = () => {};
    mocks.createPrinciple.mockReturnValue(
      new Promise<ActionResult<{ id: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    renderCreate();

    type("Título", "Uno");
    create();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Crear principio" })).toBeDisabled(),
    );
    create();
    expect(mocks.createPrinciple).toHaveBeenCalledTimes(1);

    finish(ok({ id: NEW_ID }));
    await screen.findByText("Principio creado.");
  });

  it("si no se puede guardar, lo dice y no vacía el formulario", async () => {
    mocks.createPrinciple.mockResolvedValue(fail("SAVE_FAILED"));
    renderCreate();

    type("Título", "Uno");
    create();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.getByLabelText("Título")).toHaveValue("Uno");
  });

  it("si la acción lanza, tampoco se queda sin avisar", async () => {
    mocks.createPrinciple.mockRejectedValue(new Error("fetch failed"));
    renderCreate();

    type("Título", "Uno");
    create();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
  });
});
