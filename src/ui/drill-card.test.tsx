import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DrillSummary } from "@/modules/drills/types";
import { DrillCard } from "./drill-card";

// Datos ficticios y neutros: los tests de `src/` no pueden nombrar a ningún club.
function drill(overrides: Partial<DrillSummary> = {}): DrillSummary {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Rebote + outlet",
    status: "published",
    createdBy: null,
    minAge: 12,
    maxAge: null,
    minPlayers: 6,
    maxPlayers: 12,
    minMinutes: 10,
    maxMinutes: 15,
    focus: [
      { slug: "rebote", name: "Rebote" },
      { slug: "transicion", name: "Transición" },
    ],
    ...overrides,
  };
}

const HREF = "/c/club-a/train/library/11111111-1111-4111-8111-111111111111";

describe("DrillCard", () => {
  it("muestra el título, los metadatos y el primer objetivo", () => {
    render(<DrillCard drill={drill()} href={HREF} />);

    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("Rebote + outlet");
    expect(link).toHaveTextContent("U12+ · 6–12 jug. · 10–15 min");
    expect(link).toHaveTextContent("Rebote");
  });

  it("la fila entera es un único enlace al href dado", () => {
    render(<DrillCard drill={drill()} href={HREF} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", HREF);
    // La miniatura, el título, los metadatos y la etiqueta van dentro del enlace.
    expect(within(links[0]).getByRole("img", { name: "Pista sin diagrama" })).toBeInTheDocument();
    expect(links[0]).toHaveTextContent("Rebote + outlet");
  });

  it("solo enseña la etiqueta del primer objetivo", () => {
    render(<DrillCard drill={drill()} href={HREF} />);

    expect(screen.getByText("Rebote")).toBeInTheDocument();
    expect(screen.queryByText("Transición")).not.toBeInTheDocument();
  });

  it("sin objetivos no pinta etiqueta", () => {
    render(<DrillCard drill={drill({ focus: [] })} href={HREF} />);

    expect(screen.getByRole("link").textContent).toBe(
      "Rebote + outletU12+ · 6–12 jug. · 10–15 min",
    );
  });

  it("un ejercicio publicado no lleva la etiqueta de borrador", () => {
    render(<DrillCard drill={drill({ status: "published" })} href={HREF} />);

    expect(screen.queryByText("Borrador")).not.toBeInTheDocument();
  });

  it("un borrador lo dice con la etiqueta «Borrador»", () => {
    render(<DrillCard drill={drill({ status: "draft" })} href={HREF} />);

    expect(within(screen.getByRole("link")).getByText("Borrador")).toBeInTheDocument();
    // El objetivo sigue ahí.
    expect(screen.getByText("Rebote")).toBeInTheDocument();
  });

  it("un borrador sin objetivos solo lleva «Borrador»", () => {
    render(<DrillCard drill={drill({ status: "draft", focus: [] })} href={HREF} />);

    expect(screen.getByText("Borrador")).toBeInTheDocument();
  });

  it("pinta la acción a la derecha, fuera del enlace", () => {
    render(
      <DrillCard
        drill={drill()}
        href={HREF}
        action={<button type="button">Añadir</button>}
      />,
    );

    const action = screen.getByRole("button", { name: "Añadir" });
    const link = screen.getByRole("link");
    // Un elemento interactivo dentro de un `<a>` no es HTML válido.
    expect(link).not.toContainElement(action);
    expect(link.querySelector("button")).toBeNull();
    // Y van en la misma fila, el enlace primero.
    expect(link.parentElement).toContainElement(action);
    expect(link.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sin acción solo hay el enlace", () => {
    render(<DrillCard drill={drill()} href={HREF} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("el título largo se recorta a dos líneas en vez de desbordar la fila", () => {
    render(
      <DrillCard
        drill={drill({ title: "Un ejercicio con un nombre larguísimo que no cabe en el ancho de la fila" })}
        href={HREF}
      />,
    );

    expect(screen.getByText(/Un ejercicio con un nombre larguísimo/)).toHaveClass("line-clamp-2");
    // Sin esto el texto no puede encoger dentro de la fila flex.
    expect(screen.getByText(/Un ejercicio con un nombre larguísimo/).parentElement).toHaveClass(
      "min-w-0",
    );
  });

  it("el título va en la fuente de títulos y en mayúsculas", () => {
    render(<DrillCard drill={drill()} href={HREF} />);

    expect(screen.getByText("Rebote + outlet")).toHaveClass("font-display", "uppercase");
  });

  it("pulsada, la fila pasa a surface-3 y lo que va en ink-3 sube a ink-2", () => {
    render(<DrillCard drill={drill()} href={HREF} />);

    const link = screen.getByRole("link");
    expect(link).toHaveClass("group", "active:bg-surface-3");
    expect(screen.getByText("U12+ · 6–12 jug. · 10–15 min")).toHaveClass(
      "text-ink-3",
      "group-active:text-ink-2",
    );
  });

  it("conserva el anillo de foco por dentro de la card", () => {
    render(<DrillCard drill={drill()} href={HREF} />);

    expect(screen.getByRole("link")).toHaveClass(
      "focus-visible:outline-2",
      "focus-visible:-outline-offset-2",
      "focus-visible:outline-focus-ring",
    );
  });

  it("los separadores son el borde superior, salvo en la primera fila", () => {
    const { container } = render(<DrillCard drill={drill()} href={HREF} />);

    expect(container.firstElementChild).toHaveClass("border-t", "border-line", "first:border-t-0");
  });
});
