import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { WaySection } from "@/modules/methodology/types";

const mocks = vi.hoisted(() => ({ updateWaySection: vi.fn(), reload: vi.fn() }));

vi.mock("@/modules/methodology/actions", () => ({ updateWaySection: mocks.updateWaySection }));

import { SectionEditor } from "./section-editor";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ID = "00000000-0000-4000-8000-000000000001";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos. */
const LOADED = "2026-10-03T10:00:00.123456+00:00";
const FIRST_SAVE = "2026-10-03T10:05:00.654321+00:00";
const SECOND_SAVE = "2026-10-03T10:06:00.000001+00:00";

function section(overrides: Partial<WaySection> = {}): WaySection {
  return {
    id: ID,
    number: 3,
    slug: "una-seccion",
    title: "Una sección",
    summary: "Su resumen.",
    bodyMd: "Su texto.",
    contentKind: "text",
    status: "published",
    updatedAt: LOADED,
    ...overrides,
  };
}

function renderEditor(overrides: Partial<WaySection> = {}) {
  return render(<SectionEditor clubSlug="club-a" section={section(overrides)} />);
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
const body = () => screen.getByLabelText("Contenido");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.updateWaySection.mockResolvedValue(ok({ updatedAt: FIRST_SAVE }));
  // `location.reload` no se puede sustituir en jsdom: se cambia todo `location`.
  vi.stubGlobal("location", { reload: mocks.reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SectionEditor", () => {
  it("empieza con lo que tiene guardada la sección", () => {
    renderEditor();

    expect(screen.getByLabelText("Título")).toHaveValue("Una sección");
    expect(screen.getByLabelText("Título")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Resumen")).toHaveValue("Su resumen.");
    expect(screen.getByLabelText("Resumen")).toHaveAttribute("maxlength", "200");
    expect(screen.getByLabelText("Tipo")).toHaveValue("text");
    expect(body()).toHaveValue("Su texto.");
    expect(screen.getByText("9 / 20.000")).toBeInTheDocument();
  });

  it("una sección sin resumen empieza con el campo vacío", () => {
    renderEditor({ summary: null });

    expect(screen.getByLabelText("Resumen")).toHaveValue("");
  });

  it("ofrece «Guardar cambios» como primary y «Volver» a la lista como secondary", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Guardar cambios" })).toHaveClass("bg-brand-accent");
    const back = screen.getByRole("link", { name: "Volver" });
    expect(back).toHaveAttribute("href", "/c/club-a/admin/way");
    expect(back).toHaveClass("border-line-strong");
  });

  it("guarda lo escrito con el updatedAt con que se abrió, tal cual, como expectedUpdatedAt", async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Nuevo título" } });
    fireEvent.change(screen.getByLabelText("Resumen"), { target: { value: "Nuevo resumen." } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "values" } });
    fireEvent.change(body(), { target: { value: "Nuevo texto." } });
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updateWaySection).toHaveBeenCalledTimes(1);
    expect(mocks.updateWaySection).toHaveBeenCalledWith("club-a", {
      id: ID,
      expectedUpdatedAt: LOADED,
      title: "Nuevo título",
      summary: "Nuevo resumen.",
      contentKind: "values",
      bodyMd: "Nuevo texto.",
    });
  });

  it("dos guardados seguidos funcionan: el segundo manda el updatedAt que devolvió el primero", async () => {
    mocks.updateWaySection
      .mockResolvedValueOnce(ok({ updatedAt: FIRST_SAVE }))
      .mockResolvedValueOnce(ok({ updatedAt: SECOND_SAVE }));
    renderEditor();

    fireEvent.change(body(), { target: { value: "Primer texto." } });
    save();
    await screen.findByText("Cambios guardados.");

    fireEvent.change(body(), { target: { value: "Segundo texto." } });
    // Al tocar el texto, el aviso del guardado anterior ya no es verdad: se quita.
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    save();
    await screen.findByText("Cambios guardados.");

    expect(mocks.updateWaySection).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.updateWaySection.mock.calls.map(([, input]) => input);
    expect(first.expectedUpdatedAt).toBe(LOADED);
    // La cadena exacta, con sus microsegundos: nunca pasa por `Date`.
    expect(second.expectedUpdatedAt).toBe(FIRST_SAVE);
    expect(second.bodyMd).toBe("Segundo texto.");

    // Y un tercero seguiría la cadena.
    fireEvent.change(body(), { target: { value: "Tercer texto." } });
    save();
    await waitFor(() => expect(mocks.updateWaySection).toHaveBeenCalledTimes(3));
    expect(mocks.updateWaySection.mock.calls[2][1].expectedUpdatedAt).toBe(SECOND_SAVE);
  });

  it("guardar sin tocar nada otra vez también avisa", async () => {
    renderEditor();

    save();
    await screen.findByText("Cambios guardados.");
    save();

    // El aviso se quita al empezar y vuelve al terminar.
    await waitFor(() => expect(mocks.updateWaySection).toHaveBeenCalledTimes(2));
    await screen.findByText("Cambios guardados.");
  });

  it("mientras guarda, el botón espera y no se lanza un segundo guardado", async () => {
    let finish: (result: ActionResult<{ updatedAt: string }>) => void = () => {};
    mocks.updateWaySection.mockReturnValue(
      new Promise<ActionResult<{ updatedAt: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    renderEditor();

    save();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled());
    save();
    expect(mocks.updateWaySection).toHaveBeenCalledTimes(1);

    finish(ok({ updatedAt: FIRST_SAVE }));
    await screen.findByText("Cambios guardados.");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("el aviso de guardado es un estado, con icono, y no hay ninguno antes de guardar", async () => {
    renderEditor();
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();

    save();

    const saved = await screen.findByText("Cambios guardados.");
    expect(saved).toHaveClass("text-success");
    expect(saved.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(saved.closest('[role="status"]')).not.toBeNull();
  });

  it("copia obsoleta: dice el copy del contrato, ofrece «Recargar» y no pisa lo escrito", async () => {
    mocks.updateWaySection.mockResolvedValue(fail("STALE_COPY"));
    renderEditor();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Versión B" } });
    save();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Alguien ha cambiado esto mientras editabas. Recarga para ver la última versión.",
    );
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    // Lo que escribió sigue en el formulario: recargar es decisión suya.
    expect(screen.getByLabelText("Título")).toHaveValue("Versión B");

    const reload = screen.getByRole("button", { name: "Recargar" });
    expect(reload).toHaveClass("border-line-strong");
    expect(mocks.reload).not.toHaveBeenCalled();
    fireEvent.click(reload);
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("tras una copia obsoleta, el mismo updatedAt viejo sigue siendo el que se manda", async () => {
    mocks.updateWaySection.mockResolvedValue(fail("STALE_COPY"));
    renderEditor();

    save();
    await screen.findByRole("alert");
    save();

    await waitFor(() => expect(mocks.updateWaySection).toHaveBeenCalledTimes(2));
    expect(mocks.updateWaySection.mock.calls[1][1].expectedUpdatedAt).toBe(LOADED);
  });

  it("sin copia obsoleta no hay «Recargar»", async () => {
    mocks.updateWaySection.mockResolvedValue(fail("SAVE_FAILED"));
    renderEditor();

    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.queryByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
  });

  it("si la acción lanza, dice que no se pudo guardar y no pierde lo escrito", async () => {
    mocks.updateWaySection.mockRejectedValue(new Error("fetch failed"));
    renderEditor();

    fireEvent.change(body(), { target: { value: "Texto largo que no se puede perder." } });
    save();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(body()).toHaveValue("Texto largo que no se puede perder.");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("entrada inválida: el aviso general arriba y cada error bajo su campo", async () => {
    mocks.updateWaySection.mockResolvedValue(
      fail("INVALID", {
        title: "Escribe un título.",
        summary: "Máximo 200 caracteres.",
        bodyMd: "El texto es demasiado largo (máximo 20.000 caracteres).",
      }),
    );
    renderEditor();

    save();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message] of [
      ["Título", "Escribe un título."],
      ["Resumen", "Máximo 200 caracteres."],
      ["Contenido", "El texto es demasiado largo (máximo 20.000 caracteres)."],
    ]) {
      const field = screen.getByLabelText(label);
      const text = screen.getByText(message);
      expect(field, label).toHaveAttribute("aria-invalid", "true");
      expect((field.getAttribute("aria-describedby") ?? "").split(" "), label).toContain(text.id);
    }
    expect(screen.getByLabelText("Tipo")).not.toHaveAttribute("aria-invalid");
  });

  it("un error de campo se quita al guardar de nuevo", async () => {
    mocks.updateWaySection.mockResolvedValueOnce(fail("INVALID", { title: "Escribe un título." }));
    renderEditor();

    save();
    await screen.findByText("Escribe un título.");
    save();

    await screen.findByText("Cambios guardados.");
    expect(screen.queryByText("Escribe un título.")).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_ERROR_COPY.INVALID)).not.toBeInTheDocument();
  });

  it("el aviso de error recibe el foco para que se vea y se lea aunque el botón quede lejos", async () => {
    mocks.updateWaySection.mockResolvedValue(fail("SAVE_FAILED"));
    renderEditor();

    save();

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("una sección de texto no avisa de ninguna lista", () => {
    renderEditor({ contentKind: "text" });

    expect(screen.queryByText(/muestra los/)).not.toBeInTheDocument();
    expect(screen.queryByText("El texto de aquí aparece antes, como introducción.")).not.toBeInTheDocument();
  });

  it.each([
    ["values", "Esta sección muestra los valores publicados.", "Ir a los valores", "values"],
    ["principles", "Esta sección muestra los principios publicados.", "Ir a los principios", "principles"],
    ["standards", "Esta sección muestra los Standards publicados.", "Ir a los Standards", "standards"],
  ] as const)(
    "una sección de %s avisa de lo que muestra, que su texto es la introducción, y enlaza a su página",
    (contentKind, notice, linkName, path) => {
      renderEditor({ contentKind });

      expect(screen.getByText(notice)).toBeInTheDocument();
      expect(screen.getByText("El texto de aquí aparece antes, como introducción.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: linkName })).toHaveAttribute(
        "href",
        `/c/club-a/admin/${path}`,
      );
    },
  );

  it("el aviso sigue al tipo elegido en el formulario, antes de guardar", () => {
    renderEditor({ contentKind: "text" });

    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "standards" } });
    expect(screen.getByText("Esta sección muestra los Standards publicados.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "text" } });
    expect(screen.queryByText(/muestra los/)).not.toBeInTheDocument();
  });

  it("la vista previa del contenido enseña el texto que hay escrito, sin guardar", () => {
    renderEditor({ bodyMd: "Algo **importante**." });

    fireEvent.click(screen.getByRole("tab", { name: "Vista previa" }));

    expect(screen.getByText("importante").tagName).toBe("STRONG");
  });
});
