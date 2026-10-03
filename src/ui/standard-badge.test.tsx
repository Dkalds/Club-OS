import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StandardBadge } from "./standard-badge";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

describe("StandardBadge", () => {
  it("con href es un único enlace con el número y el título", () => {
    render(
      <StandardBadge
        number={3}
        title="Título del Standard"
        href="/c/club-a/way/standards#standard-03"
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/c/club-a/way/standards#standard-03");
    expect(link).toHaveTextContent("03");
    expect(link).toHaveTextContent("Título del Standard");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("sin href no hay enlace y se ve igual el número y el título", () => {
    const { container } = render(<StandardBadge number={3} title="Título del Standard" />);

    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent("03");
    expect(container).toHaveTextContent("Título del Standard");
  });

  it("pinta el número con dos cifras", () => {
    render(<StandardBadge number={12} title="Otro" />);

    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("lleva el fondo suave del acento del club, con o sin enlace", () => {
    const sinEnlace = render(<StandardBadge number={3} title="Standard" />);
    expect(sinEnlace.container.firstElementChild).toHaveClass("bg-brand-accent-soft");
    sinEnlace.unmount();

    const conEnlace = render(<StandardBadge number={3} title="Standard" href="/x" />);
    expect(conEnlace.container.firstElementChild).toHaveClass("bg-brand-accent-soft");
  });

  it("el número va en el acento del club", () => {
    render(<StandardBadge number={3} title="Standard" />);

    expect(screen.getByText("03")).toHaveClass("text-brand-accent");
  });

  it("sin enlace mide space-8 de alto", () => {
    const { container } = render(<StandardBadge number={3} title="Standard" />);

    expect(container.firstElementChild).toHaveClass("h-(--space-8)");
  });

  it("con enlace, el área táctil es de al menos 44 px", () => {
    render(<StandardBadge number={3} title="Standard" href="/x" />);

    expect(screen.getByRole("link")).toHaveClass("min-h-(--target-min)");
  });

  it("un título largo se trunca en vez de desbordar el chip", () => {
    render(
      <StandardBadge number={3} title="Un título larguísimo que no cabe en una pantalla de 375 px" />,
    );

    expect(screen.getByText(/Un título larguísimo/)).toHaveClass("truncate");
  });
});
