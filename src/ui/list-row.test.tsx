import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";
import { DateChip, ListRow } from "./list-row";

/** Las filas siempre van como hijas directas de una card `flush` que es una lista. */
function renderRows(rows: ReactNode) {
  return render(
    <Card variant="flush" as="ul">
      {rows}
    </Card>,
  );
}

describe("ListRow", () => {
  it("es un elemento de lista con un único enlace dentro", () => {
    renderRows(<ListRow href="/c/club-a/train" lead={<span>01</span>} title="Entrenamiento" />);

    const item = screen.getByRole("listitem");
    expect(within(item).getByRole("link", { name: /Entrenamiento/ })).toBeInTheDocument();
    // Una sola fila, y es la card la que es la lista.
    expect(screen.getByRole("list")).toContainElement(item);
    expect(within(item).getAllByRole("link")).toHaveLength(1);
  });

  it("el separador es el borde del elemento de lista, salvo en la primera fila", () => {
    renderRows(
      <>
        <ListRow href="/a" lead={<span>01</span>} title="Uno" />
        <ListRow href="/b" lead={<span>02</span>} title="Dos" />
      </>,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toHaveClass("border-t", "border-line", "first:border-t-0");
    }
    // El enlace no repite el borde: sería un separador doble.
    for (const link of screen.getAllByRole("link")) {
      expect(link).not.toHaveClass("border-t");
    }
  });

  it("es un único enlace al href dado, con todo el contenido dentro", () => {
    renderRows(
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
    renderRows(<ListRow href="/x" lead={<span>01</span>} title="Nuestra cultura" />);

    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("01Nuestra cultura");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("el título y el subtítulo largos se truncan en vez de desbordar la fila", () => {
    renderRows(
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
    renderRows(<ListRow href="/x" lead={<span>01</span>} title="Fila" />);

    // `min-h-14` son 56 px (design/components/ListRow).
    expect(screen.getByRole("link")).toHaveClass("min-h-14");
  });

  it("pulsada, lo que va en ink-3 pasa a ink-2: ink-3 no va sobre surface-3", () => {
    renderRows(
      <ListRow
        href="/x"
        lead={<DateChip dow="Mar" day="6" />}
        title="Entrenamiento"
        subtitle="Sesión de la tarde"
        trail="18:00"
      />,
    );

    const link = screen.getByRole("link");
    // El fondo de pulsado es `surface-3` (design/README.md, Color) y la fila es el grupo
    // que avisa a su contenido.
    expect(link).toHaveClass("group", "active:bg-surface-3");

    // Todo lo que la fila pinta en `ink-3`: el día de la semana, el subtítulo y el trail
    // (con su chevron, que hereda el color).
    const muted = Array.from(link.querySelectorAll(".text-ink-3"));
    expect(muted.map((element) => element.textContent)).toEqual([
      "Mar",
      "Sesión de la tarde",
      "18:00",
    ]);
    for (const element of muted) {
      expect(element).toHaveClass("group-active:text-ink-2");
    }
  });

  it("conserva el anillo de foco, por dentro de la card", () => {
    renderRows(<ListRow href="/x" lead={<span>01</span>} title="Fila" />);

    expect(screen.getByRole("link")).toHaveClass(
      "focus-visible:outline-2",
      "focus-visible:-outline-offset-2",
      "focus-visible:outline-focus-ring",
    );
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
