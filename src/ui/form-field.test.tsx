import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FormAlert, SelectField, TextAreaField, TextField } from "./form-field";

describe("TextField", () => {
  it("la etiqueta está enlazada al campo", () => {
    render(<TextField label="Título" name="title" value="" onChange={() => {}} maxLength={80} />);

    const input = screen.getByLabelText("Título");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("name", "title");
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("maxlength", "80");
  });

  it("enseña su valor y avisa con el texto nuevo, no con el evento", () => {
    const onChange = vi.fn();
    render(<TextField label="Título" name="title" value="Uno" onChange={onChange} maxLength={80} />);

    const input = screen.getByLabelText("Título");
    expect(input).toHaveValue("Uno");

    fireEvent.change(input, { target: { value: "Dos" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("Dos");
  });

  it("sin error no se marca como inválido ni apunta a ningún mensaje", () => {
    render(<TextField label="Título" name="title" value="" onChange={() => {}} maxLength={80} />);

    const input = screen.getByLabelText("Título");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("con error: aria-invalid y aria-describedby apuntan al mensaje, que lleva icono", () => {
    render(
      <TextField
        label="Título"
        name="title"
        value=""
        onChange={() => {}}
        maxLength={80}
        error="Escribe un título."
      />,
    );

    const input = screen.getByLabelText("Título");
    expect(input).toHaveAttribute("aria-invalid", "true");

    const message = screen.getByText("Escribe un título.");
    expect(input).toHaveAttribute("aria-describedby", message.id);
    expect(message.id).not.toBe("");
    expect(screen.getByRole("alert")).toBe(message);
    expect(message).toHaveClass("text-danger");
    // El color no basta: un icono lo acompaña (decorativo).
    expect(message.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("dos campos con el mismo nombre no comparten identificadores", () => {
    render(
      <>
        <TextField label="Uno" name="a" value="" onChange={() => {}} maxLength={10} error="Mal." />
        <TextField label="Dos" name="a" value="" onChange={() => {}} maxLength={10} error="Mal." />
      </>,
    );

    const [one, two] = [screen.getByLabelText("Uno"), screen.getByLabelText("Dos")];
    expect(one.id).not.toBe(two.id);
    expect(one.getAttribute("aria-describedby")).not.toBe(two.getAttribute("aria-describedby"));
  });

  it("de tipo número abre el teclado numérico", () => {
    render(
      <TextField label="Número" name="number" type="number" value="3" onChange={() => {}} maxLength={2} />,
    );

    const input = screen.getByLabelText("Número");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("inputmode", "numeric");
  });

  it("es un control del sistema: surface-2, borde line-strong, radius-md y al menos target-min", () => {
    render(<TextField label="Título" name="title" value="" onChange={() => {}} maxLength={80} />);

    expect(screen.getByLabelText("Título")).toHaveClass(
      "bg-surface-2",
      "border-line-strong",
      "rounded-md",
      "h-(--target-min)",
    );
  });
});

describe("TextAreaField", () => {
  it("la etiqueta está enlazada al área de texto, con las filas que se pidan", () => {
    render(
      <TextAreaField
        label="Resumen"
        name="summary"
        value=""
        onChange={() => {}}
        maxLength={200}
        rows={5}
      />,
    );

    const textarea = screen.getByLabelText("Resumen");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveAttribute("name", "summary");
    expect(textarea).toHaveAttribute("maxlength", "200");
    expect(textarea).toHaveAttribute("rows", "5");
  });

  it("avisa con el texto nuevo", () => {
    const onChange = vi.fn();
    render(
      <TextAreaField label="Resumen" name="summary" value="a" onChange={onChange} maxLength={200} />,
    );

    fireEvent.change(screen.getByLabelText("Resumen"), { target: { value: "ab" } });

    expect(onChange).toHaveBeenCalledWith("ab");
  });

  it("con error: aria-invalid y aria-describedby apuntan al mensaje", () => {
    render(
      <TextAreaField
        label="Resumen"
        name="summary"
        value=""
        onChange={() => {}}
        maxLength={200}
        error="Máximo 200 caracteres."
      />,
    );

    const textarea = screen.getByLabelText("Resumen");
    const message = screen.getByText("Máximo 200 caracteres.");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveAttribute("aria-describedby", message.id);
  });

  it("es un control del sistema: surface-2, borde line-strong, radius-md y al menos target-min", () => {
    render(
      <TextAreaField label="Resumen" name="summary" value="" onChange={() => {}} maxLength={200} />,
    );

    expect(screen.getByLabelText("Resumen")).toHaveClass(
      "bg-surface-2",
      "border-line-strong",
      "rounded-md",
      "min-h-(--target-min)",
    );
  });
});

describe("SelectField", () => {
  const OPTIONS = [
    { value: "text", label: "Texto" },
    { value: "values", label: "Valores" },
  ];

  it("la etiqueta está enlazada al selector, con una opción por valor", () => {
    render(<SelectField label="Tipo" name="kind" value="values" options={OPTIONS} onChange={() => {}} />);

    const select = screen.getByLabelText("Tipo");
    expect(select.tagName).toBe("SELECT");
    expect(select).toHaveAttribute("name", "kind");
    expect(select).toHaveValue("values");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Texto",
      "Valores",
    ]);
  });

  it("avisa con el valor elegido", () => {
    const onChange = vi.fn();
    render(<SelectField label="Tipo" name="kind" value="text" options={OPTIONS} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "values" } });

    expect(onChange).toHaveBeenCalledWith("values");
  });

  it("con error: aria-invalid y aria-describedby apuntan al mensaje", () => {
    render(
      <SelectField
        label="Tipo"
        name="kind"
        value="text"
        options={OPTIONS}
        onChange={() => {}}
        error="Elige un tipo."
      />,
    );

    const select = screen.getByLabelText("Tipo");
    const message = screen.getByText("Elige un tipo.");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAttribute("aria-describedby", message.id);
  });

  it("es un control del sistema: surface-2, borde line-strong, radius-md y al menos target-min", () => {
    render(<SelectField label="Tipo" name="kind" value="text" options={OPTIONS} onChange={() => {}} />);

    expect(screen.getByLabelText("Tipo")).toHaveClass(
      "bg-surface-2",
      "border-line-strong",
      "rounded-md",
      "h-(--target-min)",
    );
  });
});

describe("FormAlert", () => {
  it("dice el mensaje como alerta, con icono, y se lleva el foco para que se vea", () => {
    render(<FormAlert message="No se pudo guardar. Inténtalo de nuevo." />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo guardar. Inténtalo de nuevo.");
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(alert).toHaveFocus();
  });

  it("lleva dentro su salida, si la tiene", () => {
    render(
      <FormAlert message="Alguien ha cambiado esto.">
        <button type="button">Recargar</button>
      </FormAlert>,
    );

    expect(within(screen.getByRole("alert")).getByRole("button", { name: "Recargar" })).toBeInTheDocument();
  });

  it("cada vez que se vuelve a montar, vuelve a llevarse el foco", () => {
    const { rerender } = render(<FormAlert key="1" message="Primer fallo." />);
    (document.activeElement as HTMLElement).blur();
    expect(screen.getByRole("alert")).not.toHaveFocus();

    rerender(<FormAlert key="2" message="Segundo fallo." />);

    expect(screen.getByRole("alert")).toHaveFocus();
  });
});
