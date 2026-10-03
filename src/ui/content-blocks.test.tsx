import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ClubValue, GamePrinciple, Standard } from "@/modules/methodology/types";
import { PrincipleCard } from "./principle-card";
import { StandardBlock } from "./standard-block";
import { ValueBlock } from "./value-block";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

const STANDARD: Standard = {
  id: "standard-1",
  number: 3,
  title: "Título del Standard",
  description: "Descripción del Standard.",
};

const PRINCIPLE: GamePrinciple = {
  id: "principle-1",
  slug: "ataque",
  title: "Ataque",
  summary: "Resumen del principio.",
  status: "published",
  points: ["uno", "dos", "tres", "cuatro", "cinco", "seis"].map((text) => ({
    id: `point-${text}`,
    text: `Punto ${text}`,
  })),
};

const VALUE: ClubValue = {
  id: "value-1",
  code: "CÓDIGO",
  title: "Título del valor",
  description: "Descripción del valor.",
  status: "published",
};

/** Ningún elemento que se pinte puede quedar sin texto: sería un hueco con margen. */
function expectNoEmptyElements(container: HTMLElement) {
  for (const element of Array.from(container.querySelectorAll("*"))) {
    expect(element.textContent?.trim()).not.toBe("");
  }
}

describe("StandardBlock", () => {
  it("es un artículo con el id de su número con dos cifras", () => {
    const { container } = render(<StandardBlock standard={STANDARD} />);

    const article = container.querySelector("article");
    expect(article).toHaveAttribute("id", "standard-03");
  });

  it("un número de dos cifras se queda como está", () => {
    const { container } = render(<StandardBlock standard={{ ...STANDARD, number: 12 }} />);

    expect(container.querySelector("article")).toHaveAttribute("id", "standard-12");
  });

  it("pinta el número, el kicker, el título y la descripción", () => {
    render(<StandardBlock standard={STANDARD} />);

    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Título del Standard" })).toBeInTheDocument();
    expect(screen.getByText("Descripción del Standard.")).toBeInTheDocument();
  });

  it("el número va en el acento del club y la descripción como en la vista previa", () => {
    render(<StandardBlock standard={STANDARD} />);

    expect(screen.getByText("03")).toHaveClass("text-brand-accent", "font-display");
    expect(screen.getByText("Descripción del Standard.")).toHaveClass("text-body-s", "text-ink-3");
  });

  it("no deja elementos vacíos", () => {
    const { container } = render(<StandardBlock standard={STANDARD} />);

    expectNoEmptyElements(container);
  });
});

describe("PrincipleCard", () => {
  it("es un artículo con el id de su slug", () => {
    const { container } = render(<PrincipleCard principle={PRINCIPLE} />);

    expect(container.querySelector("article")).toHaveAttribute("id", "principle-ataque");
  });

  it("pinta el título y el resumen", () => {
    render(<PrincipleCard principle={PRINCIPLE} />);

    expect(screen.getByRole("heading", { name: "Ataque" })).toBeInTheDocument();
    expect(screen.getByText("Resumen del principio.")).toHaveClass("text-body-l", "text-ink-2");
  });

  it("pinta cada punto en una lista", () => {
    const { container } = render(<PrincipleCard principle={PRINCIPLE} />);

    expect(container.querySelectorAll("ul")).toHaveLength(1);
    expect(container.querySelectorAll("ul > li")).toHaveLength(6);
    expect(container.querySelectorAll("li")).toHaveLength(6);
    expect(screen.getByText("Punto uno")).toBeInTheDocument();
    expect(screen.getByText("Punto seis")).toBeInTheDocument();
    expect(container.querySelector("ul")).toHaveClass("text-body-l", "text-ink-2");
  });

  it("sin puntos no pinta la lista", () => {
    const { container } = render(<PrincipleCard principle={{ ...PRINCIPLE, points: [] }} />);

    expect(container.querySelector("ul")).toBeNull();
    expect(container.querySelector("li")).toBeNull();
  });

  it("sin resumen no pinta el párrafo", () => {
    const { container } = render(
      <PrincipleCard principle={{ ...PRINCIPLE, summary: null, points: [] }} />,
    );

    expect(container.querySelector("p")).toBeNull();
    expectNoEmptyElements(container);
  });

  it("solo con título no deja elementos vacíos", () => {
    const { container } = render(
      <PrincipleCard principle={{ ...PRINCIPLE, summary: null, points: [] }} />,
    );

    expect(screen.getByRole("heading", { name: "Ataque" })).toBeInTheDocument();
    expectNoEmptyElements(container);
  });
});

describe("ValueBlock", () => {
  it("pinta el código en display-m, el título y la descripción", () => {
    render(<ValueBlock value={VALUE} />);

    expect(screen.getByRole("heading", { name: "CÓDIGO" })).toHaveClass(
      "font-display",
      "text-display-m",
    );
    expect(screen.getByText("Título del valor")).toBeInTheDocument();
    expect(screen.getByText("Descripción del valor.")).toHaveClass("text-body-l", "text-ink-2");
  });

  it("sin título no deja ningún elemento vacío", () => {
    const { container } = render(<ValueBlock value={{ ...VALUE, title: null }} />);

    expect(screen.queryByText("Título del valor")).toBeNull();
    expect(container).toHaveTextContent("CÓDIGO");
    expect(container).toHaveTextContent("Descripción del valor.");
    expectNoEmptyElements(container);
  });

  it("con el título en blanco tampoco pinta nada", () => {
    const { container } = render(<ValueBlock value={{ ...VALUE, title: "" }} />);

    expect(container.querySelectorAll("p")).toHaveLength(1);
    expectNoEmptyElements(container);
  });
});
