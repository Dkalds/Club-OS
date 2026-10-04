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
    render(<TextField label="Número" name="number" type="number" value="3" onChange={() => {}} />);

    const input = screen.getByLabelText("Número");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("inputmode", "numeric");
  });

  it("de tipo número no pide longitud máxima, que no haría nada, y no la pone si no se da", () => {
    render(<TextField label="Número" name="number" type="number" value="3" onChange={() => {}} />);

    expect(screen.getByLabelText("Número")).not.toHaveAttribute("maxlength");
  });

  it("de tipo número, el mínimo y el máximo son opcionales y van al campo", () => {
    const { unmount } = render(
      <TextField label="Número" name="number" type="number" value="3" onChange={() => {}} />,
    );
    expect(screen.getByLabelText("Número")).not.toHaveAttribute("min");
    expect(screen.getByLabelText("Número")).not.toHaveAttribute("max");
    unmount();

    render(
      <TextField label="Número" name="number" type="number" value="3" onChange={() => {}} min={1} max={99} />,
    );
    expect(screen.getByLabelText("Número")).toHaveAttribute("min", "1");
    expect(screen.getByLabelText("Número")).toHaveAttribute("max", "99");
  });

  it("de tipo texto lleva su longitud máxima y ningún mínimo ni máximo", () => {
    render(<TextField label="Título" name="title" value="" onChange={() => {}} maxLength={80} />);

    const input = screen.getByLabelText("Título");
    expect(input).toHaveAttribute("maxlength", "80");
    expect(input).not.toHaveAttribute("min");
    expect(input).not.toHaveAttribute("max");
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
  describe("con una pista", () => {
    it("la pista se enseña bajo el campo y lo describe", () => {
      render(
        <TextField label="Material" name="equipment" value="" onChange={() => {}} maxLength={50} hint="Separa con comas." />,
      );

      const input = screen.getByLabelText("Material");
      expect(screen.getByText("Separa con comas.")).toBeInTheDocument();
      expect(input).toHaveAccessibleDescription("Separa con comas.");
    });

    it("con error, el campo se describe con la pista y con el error, y el error sigue siendo la alerta", () => {
      render(
        <TextField
          label="Material"
          name="equipment"
          value=""
          onChange={() => {}}
          maxLength={50}
          hint="Separa con comas."
          error="Demasiado material."
        />,
      );

      const input = screen.getByLabelText("Material");
      expect(input).toHaveAccessibleDescription("Separa con comas. Demasiado material.");
      expect(screen.getByRole("alert")).toHaveTextContent("Demasiado material.");
      expect(screen.getByRole("alert")).not.toHaveTextContent("Separa con comas.");
    });

    it("sin pista no cambia nada: ningún aria-describedby", () => {
      render(<TextField label="Material" name="equipment" value="" onChange={() => {}} maxLength={50} />);

      expect(screen.getByLabelText("Material")).not.toHaveAttribute("aria-describedby");
    });
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

  it("la pista se enseña bajo el área y la describe, junto con el error si lo hay", () => {
    const { rerender } = render(
      <TextAreaField
        label="Organización"
        name="setupMd"
        value=""
        onChange={() => {}}
        maxLength={5000}
        hint="Admite negritas, cursivas y listas."
      />,
    );
    const textarea = screen.getByLabelText("Organización");
    expect(screen.getByText("Admite negritas, cursivas y listas.")).toBeInTheDocument();
    expect(textarea).toHaveAccessibleDescription("Admite negritas, cursivas y listas.");

    rerender(
      <TextAreaField
        label="Organización"
        name="setupMd"
        value=""
        onChange={() => {}}
        maxLength={5000}
        hint="Admite negritas, cursivas y listas."
        error="Demasiado largo."
      />,
    );
    expect(textarea).toHaveAccessibleDescription("Admite negritas, cursivas y listas. Demasiado largo.");
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

  it("sin `focus` no se lleva el foco: lo lleva a otra parte quien la monta", () => {
    const { rerender } = render(<input aria-label="Un campo" />);
    screen.getByLabelText("Un campo").focus();

    rerender(
      <>
        <input aria-label="Un campo" />
        <FormAlert message="Revisa los campos marcados." focus={false} />
      </>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Revisa los campos marcados.");
    expect(screen.getByRole("alert")).not.toHaveFocus();
    expect(screen.getByLabelText("Un campo")).toHaveFocus();
  });
});
