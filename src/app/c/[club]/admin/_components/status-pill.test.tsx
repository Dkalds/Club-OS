import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusPill } from "./status-pill";

describe("StatusPill", () => {
  it("publicado: la palabra, en success, con icono", () => {
    render(<StatusPill status="published" />);

    const pill = screen.getByText("Publicado");
    expect(pill).toHaveClass("text-success");
    expect(pill.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("Borrador")).not.toBeInTheDocument();
  });

  it("borrador: la palabra, en ink-3, con icono", () => {
    render(<StatusPill status="draft" />);

    const pill = screen.getByText("Borrador");
    expect(pill).toHaveClass("text-ink-3");
    expect(pill.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByText("Publicado")).not.toBeInTheDocument();
  });

  it("no depende del color: cada estado se distingue por su texto", () => {
    const { container, rerender } = render(<StatusPill status="published" />);
    const published = container.textContent;

    rerender(<StatusPill status="draft" />);

    expect(container.textContent).not.toBe(published);
  });
});
