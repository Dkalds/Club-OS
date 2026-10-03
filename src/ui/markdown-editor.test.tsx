import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "./markdown-editor";

const MAX = 20000;

/** El editor es controlado: este envoltorio hace de formulario que guarda el texto. */
function Harness({
  initial = "",
  error,
  onChange,
}: {
  initial?: string;
  error?: string;
  onChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <MarkdownEditor
      label="Contenido"
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      maxLength={MAX}
      error={error}
    />
  );
}

describe("MarkdownEditor", () => {
  it("la etiqueta está enlazada al área de texto", () => {
    render(<Harness initial="Hola" />);

    const textarea = screen.getByLabelText("Contenido");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveValue("Hola");
  });

  it("al escribir avisa con el texto nuevo", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Contenido"), { target: { value: "Nuevo" } });

    expect(onChange).toHaveBeenCalledWith("Nuevo");
    expect(screen.getByLabelText("Contenido")).toHaveValue("Nuevo");
  });

  it("empieza en «Escribir»: dos pestañas, una seleccionada", () => {
    render(<Harness initial="Hola" />);

    const write = screen.getByRole("tab", { name: "Escribir" });
    const preview = screen.getByRole("tab", { name: "Vista previa" });
    expect(write).toHaveAttribute("aria-selected", "true");
    expect(preview).toHaveAttribute("aria-selected", "false");
    expect(screen.getByLabelText("Contenido")).toBeVisible();
  });

  it("«Vista previa» pinta el Markdown y deja el área de texto montada, oculta y con su valor", () => {
    render(<Harness initial="**hola**" />);

    fireEvent.click(screen.getByRole("tab", { name: "Vista previa" }));

    const strong = screen.getByText("hola");
    expect(strong.tagName).toBe("STRONG");
    const panel = screen.getByRole("tabpanel", { name: "Vista previa" });
    expect(panel).toContainElement(strong);

    // El texto sigue ahí: al volver a «Escribir» no se pierde nada ni se pierde el foco del formulario.
    const textarea = screen.getByLabelText("Contenido");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue("**hola**");
    expect(textarea).not.toBeVisible();

    expect(screen.getByRole("tab", { name: "Vista previa" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Escribir" })).toHaveAttribute("aria-selected", "false");
  });

  it("al volver a «Escribir» enseña el texto otra vez y quita la vista previa", () => {
    render(<Harness initial="**hola**" />);

    fireEvent.click(screen.getByRole("tab", { name: "Vista previa" }));
    fireEvent.click(screen.getByRole("tab", { name: "Escribir" }));

    expect(screen.getByLabelText("Contenido")).toBeVisible();
    expect(screen.queryByText("hola", { selector: "strong" })).not.toBeInTheDocument();
  });

  it("la vista previa respeta la lista blanca: un script no se pinta", () => {
    const { container } = render(<Harness initial={"Texto\n\n<script>window.x = 1</script>"} />);

    fireEvent.click(screen.getByRole("tab", { name: "Vista previa" }));

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("Texto")).toBeInTheDocument();
  });

  it("sin texto, la vista previa lo dice en vez de quedarse en blanco", () => {
    render(<Harness initial="  " />);

    fireEvent.click(screen.getByRole("tab", { name: "Vista previa" }));

    expect(screen.getByText("Aún no hay nada que mostrar.")).toBeInTheDocument();
  });

  it("el contador dice cuántos caracteres lleva", () => {
    render(<Harness initial="**hola**" />);

    expect(screen.getByText("8 / 20.000")).toBeInTheDocument();
    expect(screen.queryByText("Demasiado largo")).not.toBeInTheDocument();
  });

  it("el contador se actualiza al escribir y agrupa los miles", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Contenido"), { target: { value: "a".repeat(12345) } });

    expect(screen.getByText("12.345 / 20.000")).toBeInTheDocument();
  });

  it("el límite exacto todavía cabe", () => {
    render(<Harness initial={"a".repeat(MAX)} />);

    expect(screen.getByText("20.000 / 20.000")).toBeInTheDocument();
    expect(screen.queryByText("Demasiado largo")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Contenido")).not.toHaveAttribute("aria-invalid");
  });

  it("con 20001 caracteres dice «Demasiado largo», en danger y con icono, y no corta el texto", () => {
    render(<Harness initial={"a".repeat(MAX + 1)} />);

    const warning = screen.getByText("Demasiado largo");
    expect(warning).toHaveClass("text-danger");
    expect(warning.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("20.001 / 20.000")).toBeInTheDocument();

    // El área de texto no limita lo que se escribe o se pega: quien se pasa lo ve y lo recorta.
    const textarea = screen.getByLabelText("Contenido");
    expect(textarea).not.toHaveAttribute("maxlength");
    expect(textarea).toHaveValue("a".repeat(MAX + 1));
    expect(textarea).toHaveAttribute("aria-invalid", "true");
  });

  it("la ayuda explica qué Markdown se puede usar y describe el campo", () => {
    render(<Harness />);

    const help = screen.getByText(
      "Puedes usar **negrita**, *cursiva*, listas, ### subtítulos, > citas y enlaces.",
    );
    const describedBy = screen.getByLabelText("Contenido").getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(" ")).toContain(help.id);
  });

  it("con error: aria-invalid y aria-describedby apuntan también al mensaje", () => {
    render(<Harness error="El texto es demasiado largo." />);

    const textarea = screen.getByLabelText("Contenido");
    const message = screen.getByText("El texto es demasiado largo.");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect((textarea.getAttribute("aria-describedby") ?? "").split(" ")).toContain(message.id);
    expect(message).toHaveClass("text-danger");
  });

  it("cada pestaña gobierna su panel y las dos miden target-min", () => {
    render(<Harness initial="Hola" />);

    for (const name of ["Escribir", "Vista previa"]) {
      const tab = screen.getByRole("tab", { name });
      expect(tab).toHaveClass("min-h-(--target-min)");
      expect(tab.getAttribute("aria-controls")).toBeTruthy();
      expect(document.getElementById(tab.getAttribute("aria-controls") ?? "")).toHaveAttribute(
        "role",
        "tabpanel",
      );
    }

    const tablist = screen.getByRole("tablist");
    expect(within(tablist).getAllByRole("tab")).toHaveLength(2);
  });

  it("las pestañas son botones que no envían el formulario que las contiene", () => {
    render(
      <form>
        <Harness initial="Hola" />
      </form>,
    );

    expect(screen.getByRole("tab", { name: "Vista previa" })).toHaveAttribute("type", "button");
  });
});
