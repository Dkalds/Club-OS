import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Board } from "@/modules/board/types";
import type { DrillSummary } from "@/modules/drills/types";
import { DrillCard } from "./drill-card";
import { clientBoundary } from "./test-support";

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

/** Una pizarra válida y pequeña: el 1 pasa al 2 y corta. */
const BOARD: Board = {
  version: 1,
  court: "half",
  tokens: [
    { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
    { id: "a2", kind: "attacker", label: "2", at: { x: 20, y: 60 } },
    { id: "ball", kind: "ball", at: { x: 53, y: 80 } },
  ],
  steps: [
    {
      note: "El 1 pasa al 2 y corta",
      moves: [
        { token: "ball", kind: "pass", to: { x: 23, y: 60 } },
        { token: "a1", kind: "cut", to: { x: 50, y: 30 } },
      ],
    },
  ],
};

/** La miniatura de una pizarra, como la marca `BoardThumb`. */
const THUMB = "[data-board-thumb]";

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
    expect(links[0].querySelector("svg")).not.toBeNull();
    expect(links[0]).toHaveTextContent("Rebote + outlet");
  });

  it("la miniatura es decorativa: no añade «Pista sin diagrama» al nombre del enlace", () => {
    render(<DrillCard drill={drill()} href={HREF} />);

    // Las listas no cargan diagramas: el hueco de la miniatura no dice nada del ejercicio
    // (que puede tenerlo) y no debe anunciarse en cada fila.
    const link = screen.getByRole("link");
    expect(within(link).queryByRole("img")).not.toBeInTheDocument();
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("link", { name: /Pista sin diagrama/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Rebote \+ outlet/ })).toBe(link);
  });

  describe("la miniatura", () => {
    it("con pizarra pinta su miniatura en vez de la pista vacía", () => {
      render(<DrillCard drill={drill({ board: BOARD })} href={HREF} />);

      const link = screen.getByRole("link");
      const drawings = link.querySelectorAll("svg");
      // Un solo dibujo en la fila, y es la miniatura de la pizarra: la pista vacía no sale además.
      expect(drawings).toHaveLength(1);
      expect(drawings[0]).toBe(link.querySelector(THUMB));
      expect(drawings[0]).not.toBeNull();
    });

    it("sin pizarra sigue la pista vacía, decorativa, y no hay miniatura de pizarra", () => {
      const { container } = render(<DrillCard drill={drill()} href={HREF} />);

      const link = screen.getByRole("link");
      expect(container.querySelector(THUMB)).toBeNull();
      expect(link.querySelectorAll("svg")).toHaveLength(1);
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });

    it("una foto fija (sin pasos) y una pista completa también tienen miniatura", () => {
      const { unmount } = render(<DrillCard drill={drill({ board: { ...BOARD, steps: [] } })} href={HREF} />);
      expect(screen.getByRole("link").querySelectorAll(THUMB)).toHaveLength(1);
      unmount();

      render(<DrillCard drill={drill({ board: { ...BOARD, court: "full" } })} href={HREF} />);
      expect(screen.getByRole("link").querySelectorAll(THUMB)).toHaveLength(1);
    });

    it("la de la pizarra también es decorativa: no añade nada al nombre del enlace", () => {
      render(<DrillCard drill={drill({ board: BOARD })} href={HREF} />);

      // El título ya dice qué ejercicio es, y las notas de los pasos no se leen en cada fila.
      const link = screen.getByRole("link");
      expect(within(link).queryByRole("img")).not.toBeInTheDocument();
      expect(link.querySelector(THUMB)).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByRole("link", { name: /^Rebote \+ outlet/ })).toBe(link);
      expect(screen.queryByRole("link", { name: /Pizarra/ })).not.toBeInTheDocument();
      expect(link).not.toHaveTextContent("El 1 pasa al 2 y corta");
    });

    it("va dentro del enlace, delante del título, y no trae controles: la fila sigue siendo un único enlace", () => {
      render(<DrillCard drill={drill({ board: BOARD })} href={HREF} />);

      const link = screen.getByRole("link");
      const thumb = link.querySelector(THUMB) as Element;
      expect(link.firstElementChild).toBe(thumb);
      expect(thumb.compareDocumentPosition(screen.getByText("Rebote + outlet"))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      // Reproducir, pausar y los pasos son de la ficha: un botón dentro de un `<a>` no es HTML válido.
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getAllByRole("link")).toHaveLength(1);
    });

    it("con pizarra el resto de la fila no cambia: título, metadatos, objetivo y «Borrador»", () => {
      render(<DrillCard drill={drill({ board: BOARD, status: "draft" })} href={HREF} />);

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", HREF);
      expect(link.textContent).toBe("Rebote + outletU12+ · 6–12 jug. · 10–15 minReboteBorrador");
    });
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

// Sin `"use client"` en ningún módulo de la fila: `DrillCard` es un componente de servidor y se
// repite una vez por ejercicio. Si importa (aunque sea de pasada) un módulo de cliente, cada
// fila se serializa y se hidrata, y el módulo arrastra a la página todo lo suyo (la hoja
// inferior, Radix...). El recorrido de importaciones es el de `test-support.ts`.
describe("DrillCard · grafo de importaciones", () => {
  const { graph, client } = clientBoundary("ui/drill-card.tsx");

  it("recorre de verdad sus dependencias", () => {
    expect(graph).toEqual(
      expect.arrayContaining(["ui/drill-card.tsx", "ui/court-thumb.tsx", "ui/filter-tag.tsx"]),
    );
  });

  it("no contiene ningún módulo de cliente", () => {
    expect(client).toEqual([]);
  });

  it("la miniatura de la pizarra entra por `./board-thumb` y su dibujo, no por `./board`, que es de cliente", () => {
    expect(graph).toEqual(expect.arrayContaining(["ui/board-thumb.tsx", "ui/board-drawing.tsx"]));
    // `./board` lleva los controles y los temporizadores (`"use client"`): cada fila se hidrataría.
    expect(graph).not.toContain("ui/board.tsx");
  });
});
