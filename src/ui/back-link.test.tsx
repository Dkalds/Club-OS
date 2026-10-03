import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BackLink } from "./back-link";

describe("BackLink", () => {
  it("es un enlace con la etiqueta como nombre y el destino dado", () => {
    render(<BackLink href="/c/club-a/way" label="El camino" />);

    expect(screen.getByRole("link", { name: "El camino" })).toHaveAttribute("href", "/c/club-a/way");
  });

  it("el chevron es decorativo: no se suma al nombre del enlace", () => {
    const { container } = render(<BackLink href="/c/club-a/way" label="El camino" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link")).toHaveTextContent(/^El camino$/);
  });

  it("mide al menos el área táctil mínima", () => {
    render(<BackLink href="/c/club-a/way" label="El camino" />);

    expect(screen.getByRole("link")).toHaveClass("min-h-(--target-min)");
  });
});
