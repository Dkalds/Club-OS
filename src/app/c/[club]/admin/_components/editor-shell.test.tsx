import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { EditorForm, focusField, ItemCard, NewItemCard, useConfirmation } from "./editor-shell";

// Lo común a los tres editores de Gestión. Cada editor prueba además lo suyo: aquí, solo lo que
// el armazón promete a los tres.

function form(props: Partial<Parameters<typeof EditorForm>[0]> = {}) {
  return (
    <EditorForm
      mode="edit"
      headingId="heading"
      submitLabel="Guardar"
      failure={null}
      confirmation={null}
      pending={false}
      onSubmit={() => {}}
      {...props}
    >
      <input aria-label="Uno" />
      <input aria-label="Dos" />
    </EditorForm>
  );
}

describe("EditorForm", () => {
  it("envía el formulario sin recargar la página y sin validar en el navegador", () => {
    const onSubmit = vi.fn();
    render(form({ onSubmit }));

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveAttribute("type", "submit");
    const element = button.closest("form")!;
    expect(element).toHaveAttribute("novalidate");

    const notPrevented = fireEvent.submit(element);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    // `preventDefault`: el navegador no navega.
    expect(notPrevented).toBe(false);
  });

  it("editar: «Guardar» es secondary y la card lo describe con su encabezado", () => {
    render(form({ mode: "edit", headingId: "heading" }));

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).not.toHaveClass("bg-brand-accent");
    expect(button).toHaveAttribute("aria-describedby", "heading");
    // Un formulario por card no es un punto de referencia: solo el alta lleva nombre.
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  it("alta: el botón es el primary y el formulario se llama como su encabezado", () => {
    render(
      <>
        <h2 id="heading">Nuevo elemento</h2>
        {form({ mode: "create", submitLabel: "Crear elemento" })}
      </>,
    );

    const button = screen.getByRole("button", { name: "Crear elemento" });
    expect(button).toHaveClass("bg-brand-accent", "text-brand-on-accent");
    expect(button).not.toHaveAttribute("aria-describedby");
    expect(screen.getByRole("form", { name: "Nuevo elemento" })).toBeInTheDocument();
  });

  it("mientras espera, el botón no se puede usar", () => {
    render(form({ pending: true }));

    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("un fallo se enseña arriba con el copy del contrato y recibe el foco", () => {
    render(form({ failure: { error: "SAVE_FAILED", fieldErrors: {} } }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).toHaveFocus();
  });

  it("sin fallo no hay aviso", () => {
    render(form());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Un lector de pantalla solo anuncia el texto que cambia dentro de una región `status` que ya
  // estaba en el árbol de accesibilidad: la región existe vacía, y es la misma al confirmar.
  it("la región de estado está siempre, vacía hasta que hay confirmación, y es la misma", () => {
    const { rerender } = render(form());

    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    expect(region.className).not.toMatch(/hidden|sr-only/);

    rerender(form({ confirmation: "Cambios guardados." }));

    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Cambios guardados.");
    const message = screen.getByText("Cambios guardados.");
    expect(message).toHaveClass("text-success");
    expect(message.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    rerender(form({ confirmation: null }));
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toBeEmptyDOMElement();
  });
});

describe("useConfirmation", () => {
  it("empieza sin mensaje y guarda el que se confirma", () => {
    const { result } = renderHook(() => useConfirmation());
    expect(result.current.message).toBeNull();

    act(() => result.current.confirm("Valor creado."));

    expect(result.current.message).toBe("Valor creado.");
  });

  it("tocar un campo, o limpiar, deja sin efecto la confirmación anterior", () => {
    const { result } = renderHook(() => useConfirmation());
    const setValue = vi.fn();
    act(() => result.current.confirm("Cambios guardados."));

    act(() => result.current.touch(setValue)("nuevo"));

    expect(setValue).toHaveBeenCalledWith("nuevo");
    expect(result.current.message).toBeNull();

    act(() => result.current.confirm("Cambios guardados."));
    act(() => result.current.clear());
    expect(result.current.message).toBeNull();
  });
});

describe("focusField", () => {
  it("lleva el foco al campo con ese nombre, sea del tipo que sea", () => {
    render(
      <form data-testid="form">
        <input name="uno" aria-label="Uno" />
        <textarea name="dos" aria-label="Dos" />
        <select name="tres" aria-label="Tres" />
      </form>,
    );
    const element = screen.getByTestId("form") as HTMLFormElement;

    focusField(element, "dos");
    expect(screen.getByLabelText("Dos")).toHaveFocus();

    focusField(element, "tres");
    expect(screen.getByLabelText("Tres")).toHaveFocus();
  });

  it("sin formulario, o con un nombre que no existe, no hace nada", () => {
    render(
      <form data-testid="form">
        <input name="uno" aria-label="Uno" />
      </form>,
    );

    expect(() => focusField(null, "uno")).not.toThrow();
    expect(() => focusField(screen.getByTestId("form") as HTMLFormElement, "otro")).not.toThrow();
    expect(screen.getByLabelText("Uno")).not.toHaveFocus();
  });
});

describe("ItemCard", () => {
  it("encabezado con el nombre, el estado, el contenido y los controles debajo", () => {
    render(
      <ItemCard
        headingId="heading"
        title="Un elemento"
        status="draft"
        controls={<button>Controles</button>}
        lead={<span>07</span>}
      >
        <p>Su formulario</p>
      </ItemCard>,
    );

    const heading = screen.getByRole("heading", { level: 2, name: "Un elemento" });
    expect(heading).toHaveAttribute("id", "heading");
    expect(heading).toHaveClass("wrap-break-word");
    expect(screen.getByText("07")).toBeInTheDocument();
    expect(screen.getByText("Borrador")).toBeInTheDocument();
    expect(screen.getByText("Su formulario")).toBeInTheDocument();
    const controls = screen.getByRole("button", { name: "Controles" });
    const body = screen.getByText("Su formulario");
    expect(body.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("publicado lo dice con su palabra", () => {
    render(
      <ItemCard headingId="h" title="Otro" status="published" controls={null}>
        <p>Formulario</p>
      </ItemCard>,
    );

    expect(screen.getByText("Publicado")).toBeInTheDocument();
  });
});

describe("NewItemCard", () => {
  it("lleva el encabezado que nombra su formulario", () => {
    render(
      <NewItemCard headingId="heading" title="Nuevo elemento">
        <p>Su formulario</p>
      </NewItemCard>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Nuevo elemento" })).toHaveAttribute(
      "id",
      "heading",
    );
    expect(screen.getByText("Su formulario")).toBeInTheDocument();
    // El alta no tiene estado ni controles.
    expect(screen.queryByText("Borrador")).not.toBeInTheDocument();
  });
});
