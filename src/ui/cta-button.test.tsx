import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CTAButton } from "./cta-button";

describe("CTAButton", () => {
  it("con href renderiza un enlace <a> a ese destino", () => {
    render(
      <CTAButton variant="primary" href="/c/club-a/train">
        Abrir
      </CTAButton>,
    );

    const link = screen.getByRole("link", { name: "Abrir" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/c/club-a/train");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it('sin href renderiza un <button type="button">', () => {
    render(<CTAButton variant="primary">Guardar</CTAButton>);

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  it("respeta el type que se le pase", () => {
    render(
      <CTAButton variant="primary" type="submit">
        Enviar
      </CTAButton>,
    );

    expect(screen.getByRole("button", { name: "Enviar" })).toHaveAttribute("type", "submit");
  });

  it("primary lleva el acento del club como fondo", () => {
    render(<CTAButton variant="primary">Guardar</CTAButton>);

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("bg-brand-accent", "text-brand-on-accent");
  });

  it("on-spotlight usa el relleno oscuro con texto en acento, no el acento de fondo", () => {
    render(<CTAButton variant="on-spotlight">Abrir</CTAButton>);

    const button = screen.getByRole("button", { name: "Abrir" });
    expect(button).toHaveClass("bg-on-spotlight", "text-brand-accent");
    expect(button).not.toHaveClass("bg-brand-accent");
  });

  it("secondary lleva borde line-strong y ghost solo texto en acento", () => {
    render(
      <>
        <CTAButton variant="secondary">Duplicar</CTAButton>
        <CTAButton variant="ghost">Ver todo</CTAButton>
      </>,
    );

    expect(screen.getByRole("button", { name: "Duplicar" })).toHaveClass("border-line-strong");
    const ghost = screen.getByRole("button", { name: "Ver todo" });
    expect(ghost).toHaveClass("bg-transparent", "text-brand-accent");
    expect(ghost).not.toHaveClass("bg-brand-accent");
  });

  it("danger lleva borde y texto danger sobre fondo transparente, y se tinta al pulsar", () => {
    render(<CTAButton variant="danger">Quitar</CTAButton>);

    const button = screen.getByRole("button", { name: "Quitar" });
    expect(button).toHaveClass("border-danger", "text-danger", "bg-transparent");
    expect(button).toHaveClass("not-disabled:active:bg-danger-soft");
    // Ni el acento del club ni el relleno: lo destructivo no se pinta con la marca.
    expect(button).not.toHaveClass("bg-brand-accent", "text-brand-accent", "border-line-strong");
  });

  it("danger y secondary comparten padding: son botones hermanos en una misma fila", () => {
    render(
      <>
        <CTAButton variant="danger">Quitar</CTAButton>
        <CTAButton variant="secondary">Duplicar</CTAButton>
      </>,
    );

    expect(screen.getByRole("button", { name: "Quitar" })).toHaveClass("px-(--space-5)");
    expect(screen.getByRole("button", { name: "Duplicar" })).toHaveClass("px-(--space-5)");
  });

  it("mide como mínimo el área táctil; `live` llega a la del modo en directo", () => {
    render(
      <>
        <CTAButton variant="primary">Normal</CTAButton>
        <CTAButton variant="primary" size="live">
          En directo
        </CTAButton>
      </>,
    );

    expect(screen.getByRole("button", { name: "Normal" })).toHaveClass("min-h-(--target-min)");
    expect(screen.getByRole("button", { name: "En directo" })).toHaveClass("min-h-(--target-live)");
  });

  it("`block` ocupa todo el ancho", () => {
    render(
      <>
        <CTAButton variant="primary" block>
          Ancho
        </CTAButton>
        <CTAButton variant="primary">Justo</CTAButton>
      </>,
    );

    expect(screen.getByRole("button", { name: "Ancho" })).toHaveClass("w-full");
    expect(screen.getByRole("button", { name: "Justo" })).not.toHaveClass("w-full");
  });

  it("pinta el icono antes de la etiqueta", () => {
    render(
      <CTAButton variant="primary" icon={<svg data-testid="icon" aria-hidden="true" />}>
        Nueva sesión
      </CTAButton>,
    );

    const button = screen.getByRole("button", { name: "Nueva sesión" });
    expect(button.firstElementChild).toBe(screen.getByTestId("icon"));
    expect(button).toHaveTextContent("Nueva sesión");
  });

  it("un botón deshabilitado no responde y lo dice con la propiedad nativa", () => {
    const onClick = vi.fn();
    render(
      <CTAButton variant="primary" disabled onClick={onClick}>
        Guardar
      </CTAButton>,
    );

    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("llama a onClick al pulsar", () => {
    const onClick = vi.fn();
    render(
      <CTAButton variant="secondary" onClick={onClick}>
        Cancelar
      </CTAButton>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("un enlace también ocupa al menos el área táctil mínima", () => {
    render(
      <CTAButton variant="on-spotlight" href="/c/club-a">
        Abrir
      </CTAButton>,
    );

    expect(screen.getByRole("link", { name: "Abrir" })).toHaveClass("min-h-(--target-min)");
  });
});
