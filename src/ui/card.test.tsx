import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";

describe("Card", () => {
  it("pinta sus hijos", () => {
    render(
      <Card>
        <p>Contenido</p>
      </Card>,
    );

    expect(screen.getByText("Contenido")).toBeInTheDocument();
  });

  it("por defecto es surface-1 con padding de card", () => {
    const { container } = render(<Card>Contenido</Card>);

    expect(container.firstElementChild).toHaveClass("bg-surface-1", "rounded-lg", "p-(--space-4)");
  });

  it("spotlight usa el fondo y el texto de la card destacada", () => {
    const { container } = render(<Card variant="spotlight">Contenido</Card>);

    expect(container.firstElementChild).toHaveClass("bg-spotlight", "text-on-spotlight", "rounded-xl");
    expect(container.firstElementChild).not.toHaveClass("bg-surface-1");
  });

  it("flush no lleva padding", () => {
    const { container } = render(<Card variant="flush">Contenido</Card>);

    expect(container.firstElementChild).not.toHaveClass("p-(--space-4)");
    expect(container.firstElementChild).toHaveClass("overflow-hidden");
  });

  it("añade la clase que se le pase sin perder las suyas", () => {
    const { container } = render(<Card className="items-center">Contenido</Card>);

    expect(container.firstElementChild).toHaveClass("items-center", "bg-surface-1");
  });
});
