import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionHeader } from "./section-header";

describe("SectionHeader", () => {
  it("el título es un <h2>", () => {
    render(<SectionHeader title="Esta semana" />);

    expect(screen.getByRole("heading", { level: 2, name: "Esta semana" })).toBeInTheDocument();
  });

  it("con acción pinta un enlace a su destino", () => {
    render(
      <SectionHeader title="Esta semana" action={{ label: "Calendario", href: "/c/club-a/games" }} />,
    );

    expect(screen.getByRole("link", { name: "Calendario" })).toHaveAttribute(
      "href",
      "/c/club-a/games",
    );
  });

  it("el enlace de acción ocupa al menos el área táctil mínima", () => {
    render(<SectionHeader title="Esta semana" action={{ label: "Calendario", href: "/x" }} />);

    expect(screen.getByRole("link", { name: "Calendario" })).toHaveClass("min-h-(--target-min)");
  });

  it("sin acción no pinta ningún enlace", () => {
    render(<SectionHeader title="Coaching points" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
