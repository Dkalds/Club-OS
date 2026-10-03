import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DateChip, ListRow } from "./list-row";

describe("ListRow", () => {
  it("es un único enlace al href dado, con todo el contenido dentro", () => {
    render(
      <ListRow
        href="/c/club-a/train"
        lead={<DateChip dow="Mar" day="6" />}
        title="Entrenamiento"
        subtitle="Transición + rebote"
        trail="18:00"
      />,
    );

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/c/club-a/train");
    for (const text of ["Mar", "6", "Entrenamiento", "Transición + rebote", "18:00"]) {
      expect(links[0]).toHaveTextContent(text);
    }
  });

  it("sin subtítulo ni trail solo pinta el título y el chevron", () => {
    render(<ListRow href="/x" lead={<span>01</span>} title="Nuestra cultura" />);

    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("01Nuestra cultura");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("el título y el subtítulo largos se truncan en vez de desbordar la fila", () => {
    render(
      <ListRow
        href="/x"
        lead={<span>01</span>}
        title="Un título larguísimo que no cabe en una pantalla de 375 píxeles de ancho"
        subtitle="Un subtítulo igual de largo que tampoco cabe en la misma fila de la lista"
      />,
    );

    expect(screen.getByText(/Un título larguísimo/)).toHaveClass("truncate");
    expect(screen.getByText(/Un subtítulo igual/)).toHaveClass("truncate");
  });

  it("toda la fila es el área táctil, de al menos 44 px", () => {
    render(<ListRow href="/x" lead={<span>01</span>} title="Fila" />);

    // `min-h-14` son 56 px (design/components/ListRow).
    expect(screen.getByRole("link")).toHaveClass("min-h-14");
  });
});

describe("DateChip", () => {
  it("muestra el día de la semana sobre el número del día", () => {
    const { container } = render(<DateChip dow="Jue" day="8" />);

    expect(container).toHaveTextContent("Jue8");
    expect(screen.getByText("Jue")).toBeInTheDocument();
    expect(screen.getByText("8")).toHaveClass("tabular-nums");
  });
});
