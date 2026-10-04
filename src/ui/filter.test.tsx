import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Filter, FilterSheetChip, FilterTag } from "./filter";
import { FilterTag as DirectFilterTag } from "./filter-tag";

// Opciones ficticias: en producción salen de la taxonomía del club, nunca del código.
const FOCUS = [
  { value: "transicion", label: "Transición" },
  { value: "defensa", label: "Defensa" },
  { value: "rebote", label: "Rebote" },
  { value: "tiro", label: "Tiro" },
];
const AGES = [
  { value: "10", label: "U10" },
  { value: "12", label: "U12" },
  { value: "14", label: "U14" },
];

// Ningún test de este archivo puede dejar avisos de React ni de Radix en la salida.
let consoleErrors: ReturnType<typeof vi.spyOn>;
let consoleWarnings: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(consoleWarnings).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

function chipNames(group: HTMLElement) {
  return within(group)
    .getAllByRole("button")
    .map((button) => button.textContent);
}

describe("Filter", () => {
  it("es un grupo con el nombre del filtro y «Todos» primero, luego las opciones en orden", () => {
    render(<Filter label="Objetivo" options={FOCUS} value={null} onChange={() => {}} />);

    const group = screen.getByRole("group", { name: "Objetivo" });
    expect(chipNames(group)).toEqual(["Todos", "Transición", "Defensa", "Rebote", "Tiro"]);
  });

  it("sin valor marca «Todos» como pulsado y ninguna otra opción", () => {
    render(<Filter label="Objetivo" options={FOCUS} value={null} onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");
    for (const name of ["Transición", "Defensa", "Rebote", "Tiro"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("con valor marca solo esa opción", () => {
    render(<Filter label="Objetivo" options={FOCUS} value="rebote" onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Rebote" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Tiro" })).toHaveAttribute("aria-pressed", "false");
  });

  it("pulsar una opción llama a onChange con su valor", () => {
    const onChange = vi.fn();
    render(<Filter label="Objetivo" options={FOCUS} value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Rebote" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("rebote");
  });

  it("pulsar «Todos» llama a onChange con null", () => {
    const onChange = vi.fn();
    render(<Filter label="Objetivo" options={FOCUS} value="rebote" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Todos" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("las opciones son las que da quien lo monta", () => {
    render(
      <Filter
        label="Objetivo"
        options={[{ value: "pase", label: "Pase" }]}
        value={null}
        onChange={() => {}}
      />,
    );

    expect(chipNames(screen.getByRole("group", { name: "Objetivo" }))).toEqual(["Todos", "Pase"]);
  });

  it("los botones son botones normales, no envían formularios", () => {
    render(<Filter label="Objetivo" options={FOCUS} value={null} onChange={() => {}} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("type", "button");
    }
  });

  it("el chip mide 36 px y su área táctil, 44 px", () => {
    render(<Filter label="Objetivo" options={FOCUS} value={null} onChange={() => {}} />);

    const button = screen.getByRole("button", { name: "Rebote" });
    // El botón es el área táctil (`target-min`); la píldora de dentro es lo que se ve (36 px).
    expect(button).toHaveClass("min-h-(--target-min)");
    const pill = button.firstElementChild;
    expect(pill).toHaveClass("h-9", "rounded-pill");
  });

  it("el chip activo se pinta con brand-accent-soft, borde y texto brand-accent", () => {
    render(<Filter label="Objetivo" options={FOCUS} value={null} onChange={() => {}} />);

    // El estado sale de `aria-pressed` del botón, que es el grupo de la píldora.
    const button = screen.getByRole("button", { name: "Todos" });
    expect(button).toHaveClass("group");
    expect(button.firstElementChild).toHaveClass(
      "group-aria-pressed:bg-brand-accent-soft",
      "group-aria-pressed:border-brand-accent",
      "group-aria-pressed:text-brand-accent",
    );
  });

  it("desplaza en horizontal sin barra y no rompe en una segunda fila", () => {
    render(<Filter label="Objetivo" options={FOCUS} value={null} onChange={() => {}} />);

    expect(screen.getByRole("group", { name: "Objetivo" })).toHaveClass(
      "flex",
      "overflow-x-auto",
      "[scrollbar-width:none]",
    );
    expect(screen.getByRole("button", { name: "Todos" })).toHaveClass("shrink-0");
  });

  it("conserva el anillo de foco, por dentro de la píldora", () => {
    render(<Filter label="Objetivo" options={FOCUS} value={null} onChange={() => {}} />);

    // La fila recorta lo que sobresale: el anillo va por dentro.
    const button = screen.getByRole("button", { name: "Todos" });
    expect(button.firstElementChild).toHaveClass(
      "group-focus-visible:outline-2",
      "group-focus-visible:-outline-offset-2",
      "group-focus-visible:outline-focus-ring",
    );
  });
});

describe("FilterSheetChip", () => {
  function renderChip(value: string | null = null, onChange = vi.fn()) {
    render(
      <FilterSheetChip
        label="Edad"
        title="Edad mínima"
        options={AGES}
        value={value}
        onChange={onChange}
      />,
    );

    return onChange;
  }

  it("sin valor muestra su etiqueta, sin pulsar", () => {
    renderChip(null);

    const chip = screen.getByRole("button", { name: "Edad" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("con valor muestra la opción elegida, pulsado", () => {
    renderChip("12");

    const chip = screen.getByRole("button", { name: "U12" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Edad" })).not.toBeInTheDocument();
  });

  it("con un valor que ya no está entre las opciones sigue marcado como activo", () => {
    renderChip("99");

    // Se filtra por algo que la taxonomía ya no ofrece: el chip no puede fingir que no hay filtro.
    const chip = screen.getByRole("button", { name: "Edad" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("lleva una flecha decorativa y avisa de que abre un diálogo", () => {
    renderChip(null);

    const chip = screen.getByRole("button", { name: "Edad" });
    expect(chip).toHaveAttribute("aria-haspopup", "dialog");
    expect(chip.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("el área táctil es de 44 px y la píldora de 36", () => {
    renderChip(null);

    const chip = screen.getByRole("button", { name: "Edad" });
    expect(chip).toHaveClass("min-h-(--target-min)");
    expect(chip.firstElementChild).toHaveClass("h-9", "rounded-pill");
  });

  it("está cerrada hasta que se pulsa el chip", () => {
    renderChip(null);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al pulsarlo abre una hoja con su título, «Cualquiera» y las opciones", () => {
    renderChip(null);

    fireEvent.click(screen.getByRole("button", { name: "Edad" }));

    const sheet = screen.getByRole("dialog", { name: "Edad mínima" });
    expect(within(sheet).getByRole("heading", { name: "Edad mínima" })).toBeInTheDocument();
    expect(
      within(sheet)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Cerrar", "Cualquiera", "U10", "U12", "U14"]);
  });

  it("en la hoja marca «Cualquiera» si no hay valor", () => {
    renderChip(null);
    fireEvent.click(screen.getByRole("button", { name: "Edad" }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("button", { name: "Cualquiera" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(sheet).getByRole("button", { name: "U12" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("en la hoja marca la opción elegida", () => {
    renderChip("12");
    fireEvent.click(screen.getByRole("button", { name: "U12" }));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("button", { name: "U12" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(sheet).getByRole("button", { name: "Cualquiera" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("elegir una opción llama a onChange con su valor y cierra la hoja", () => {
    const onChange = renderChip(null);
    fireEvent.click(screen.getByRole("button", { name: "Edad" }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "U12" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("12");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("«Cualquiera» llama a onChange con null y cierra la hoja", () => {
    const onChange = renderChip("12");
    fireEvent.click(screen.getByRole("button", { name: "U12" }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cualquiera" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cerrar sin elegir no cambia el filtro", () => {
    const onChange = renderChip("12");
    fireEvent.click(screen.getByRole("button", { name: "U12" }));

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Escape cierra la hoja sin cambiar el filtro", () => {
    const onChange = renderChip(null);
    fireEvent.click(screen.getByRole("button", { name: "Edad" }));

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al cerrar devuelve el foco al chip", async () => {
    renderChip(null);
    const chip = screen.getByRole("button", { name: "Edad" });
    act(() => chip.focus());
    fireEvent.click(chip);

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "U10" }));

    // Radix devuelve el foco en el siguiente turno.
    await waitFor(() => expect(screen.getByRole("button", { name: "Edad" })).toHaveFocus());
  });

  it("las opciones de la hoja miden como mínimo 44 px de alto", () => {
    renderChip(null);
    fireEvent.click(screen.getByRole("button", { name: "Edad" }));

    for (const name of ["Cualquiera", "U10", "U12", "U14"]) {
      expect(within(screen.getByRole("dialog")).getByRole("button", { name })).toHaveClass(
        "min-h-(--target-min)",
      );
    }
  });
});

describe("FilterTag", () => {
  it("es el mismo componente que sale de filter-tag, que no es de cliente", () => {
    // `DrillCard` (de servidor) importa `./filter-tag`; quien quiera todo el filtro, `./filter`.
    expect(FilterTag).toBe(DirectFilterTag);
  });

  it("es una etiqueta con el texto dado, no interactiva", () => {
    render(<FilterTag>Rebote</FilterTag>);

    const tag = screen.getByText("Rebote");
    expect(tag.tagName.toLowerCase()).toBe("span");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("mide 24 px como mínimo y usa radius-xs", () => {
    render(<FilterTag>Rebote</FilterTag>);

    expect(screen.getByText("Rebote")).toHaveClass("min-h-6", "rounded-xs", "bg-surface-2");
  });
});
