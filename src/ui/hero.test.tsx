import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hero } from "./hero";

describe("Hero", () => {
  it("el título es el <h1> de la página", () => {
    render(<Hero kicker="Equipo A · Temporada 2026/27" title="Buenos días, Ana." />);

    expect(screen.getByRole("heading", { level: 1, name: "Buenos días, Ana." })).toBeInTheDocument();
  });

  it("muestra el kicker cuando lo hay", () => {
    render(<Hero kicker="Equipo A · Temporada 2026/27" title="Buenos días, Ana." />);

    expect(screen.getByText("Equipo A · Temporada 2026/27")).toBeInTheDocument();
  });

  it("sin kicker no pinta nada en su lugar", () => {
    const { container } = render(<Hero kicker={null} title="Buenos días, Ana." />);

    expect(container.querySelector("p")).toBeNull();
    expect(container).toHaveTextContent(/^Buenos días, Ana\.$/);
  });

  it("no mete fotografías: solo las líneas de pista, decorativas", () => {
    const { container } = render(<Hero kicker={null} title="Buenos días, Ana." />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
