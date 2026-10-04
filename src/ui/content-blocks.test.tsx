import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DrillSummary } from "@/modules/drills/types";
import type { ClubValue, GamePrinciple, Standard } from "@/modules/methodology/types";
import { PrincipleCard } from "./principle-card";
import { StandardBlock } from "./standard-block";
import { clientBoundary } from "./test-support";
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

  it("al saltar a su ancla, la cabecera fija no lo tapa", () => {
    const { container } = render(<StandardBlock standard={STANDARD} />);

    // `anchor-below-header` (globals.css) le deja `header-height` + área segura + `space-4`.
    expect(container.querySelector("article")).toHaveClass("anchor-below-header");
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

  it("al saltar a su ancla, la cabecera fija no lo tapa", () => {
    const { container } = render(<PrincipleCard principle={PRINCIPLE} />);

    expect(container.querySelector("article")).toHaveClass("anchor-below-header");
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

function drill(n: number, title: string): DrillSummary {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    title,
    status: "published",
    createdBy: null,
    minAge: 12,
    maxAge: null,
    minPlayers: 6,
    maxPlayers: 12,
    minMinutes: 10,
    maxMinutes: 15,
    focus: [{ slug: "tiro", name: "Tiro" }],
  };
}

const LIBRARY = "/c/club-a/drills?principle=ataque";

function related(drills: DrillSummary[]) {
  return { drills, href: LIBRARY };
}

/** Los enlaces de ficha (las filas de ejercicio), sin el de «Ver todos». */
function rows() {
  return screen.queryAllByRole("link").filter((link) => link.getAttribute("href") !== LIBRARY);
}

describe("PrincipleCard · ejercicios relacionados", () => {
  const DRILLS = [drill(1, "Primer ejercicio"), drill(2, "Segundo ejercicio"), drill(3, "Tercer ejercicio")];

  it("sin `related` queda como siempre: ni encabezado, ni filas, ni enlaces, ni aviso", () => {
    const { container } = render(<PrincipleCard principle={PRINCIPLE} />);

    expect(screen.queryByText("Ejercicios relacionados")).not.toBeInTheDocument();
    expect(screen.queryByText("Aún no hay ejercicios con este principio.")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.querySelectorAll("h3")).toHaveLength(0);
    // Sigue siendo lo que era: el título, el resumen y los seis puntos.
    expect(screen.getByRole("heading", { level: 2, name: "Ataque" })).toBeInTheDocument();
    expect(container.querySelectorAll("li")).toHaveLength(6);
  });

  it("con ejercicios, el encabezado es un <h3> bajo el título (<h2>) y tras los puntos", () => {
    render(<PrincipleCard principle={PRINCIPLE} related={related(DRILLS)} />);

    const title = screen.getByRole("heading", { level: 2, name: "Ataque" });
    const heading = screen.getByRole("heading", { level: 3, name: "Ejercicios relacionados" });
    expect(Boolean(title.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(
      Boolean(screen.getByText("Punto seis").compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it("el encabezado va en la misma tarjeta, con el id y el ancla de siempre", () => {
    const { container } = render(<PrincipleCard principle={PRINCIPLE} related={related(DRILLS)} />);

    const article = container.querySelector("article");
    expect(article).toHaveAttribute("id", "principle-ataque");
    expect(article).toHaveClass("anchor-below-header");
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(article).toContainElement(screen.getByRole("heading", { level: 3 }));
  });

  it("una fila por ejercicio, con su título y sus metadatos, enlazada a su ficha", () => {
    render(<PrincipleCard principle={PRINCIPLE} related={related(DRILLS)} />);

    expect(rows().map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Primer ejercicioU12+ · 6–12 jug. · 10–15 minTiro", "/c/club-a/drills/00000000-0000-4000-8000-000000000001"],
      ["Segundo ejercicioU12+ · 6–12 jug. · 10–15 minTiro", "/c/club-a/drills/00000000-0000-4000-8000-000000000002"],
      ["Tercer ejercicioU12+ · 6–12 jug. · 10–15 minTiro", "/c/club-a/drills/00000000-0000-4000-8000-000000000003"],
    ]);
  });

  it("«Ver todos en la biblioteca» lleva al href dado, tras las filas", () => {
    render(<PrincipleCard principle={PRINCIPLE} related={related(DRILLS)} />);

    const all = screen.getByRole("link", { name: "Ver todos en la biblioteca" });
    expect(all).toHaveAttribute("href", LIBRARY);
    expect(Boolean(rows()[2].compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it("como mucho tres filas, las tres primeras, aunque lleguen más", () => {
    const five = [...DRILLS, drill(4, "Cuarto ejercicio"), drill(5, "Quinto ejercicio")];

    render(<PrincipleCard principle={PRINCIPLE} related={related(five)} />);

    expect(rows().map((link) => link.textContent?.replace(/U12.*$/, ""))).toEqual([
      "Primer ejercicio",
      "Segundo ejercicio",
      "Tercer ejercicio",
    ]);
    expect(screen.queryByText("Cuarto ejercicio")).not.toBeInTheDocument();
  });

  it("con uno solo, una fila y el enlace a la biblioteca", () => {
    render(<PrincipleCard principle={PRINCIPLE} related={related([DRILLS[0]])} />);

    expect(rows()).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Ver todos en la biblioteca" })).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay ejercicios con este principio.")).not.toBeInTheDocument();
  });

  it("la ruta de las fichas es la de la biblioteca, sin su consulta", () => {
    render(
      <PrincipleCard
        principle={PRINCIPLE}
        related={{ drills: [DRILLS[0]], href: "/c/otro-club/drills?principle=ataque&age=12" }}
      />,
    );

    expect(rows()[0]).toHaveAttribute("href", "/c/otro-club/drills/00000000-0000-4000-8000-000000000001");
  });

  it("sin ejercicios mantiene el encabezado, lo dice y no enlaza a una lista vacía", () => {
    const { container } = render(<PrincipleCard principle={PRINCIPLE} related={related([])} />);

    expect(screen.getByRole("heading", { level: 3, name: "Ejercicios relacionados" })).toBeInTheDocument();
    expect(screen.getByText("Aún no hay ejercicios con este principio.")).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("el aviso de que no hay ejercicios no deja elementos vacíos", () => {
    const { container } = render(
      <PrincipleCard principle={{ ...PRINCIPLE, summary: null, points: [] }} related={related([])} />,
    );

    expectNoEmptyElements(container);
  });

  it("la lista sale a los bordes de la tarjeta: las filas no suman su relleno al de la tarjeta", () => {
    render(<PrincipleCard principle={PRINCIPLE} related={related(DRILLS)} />);

    // Las filas son hijos directos de la lista, que tapa el relleno de la tarjeta (`space-4`)
    // con un margen negativo igual: el texto de la fila queda alineado con el del principio
    // y los separadores llegan de borde a borde.
    const list = rows()[0].parentElement?.parentElement as HTMLElement;
    expect(list).toHaveClass("-mx-(--space-4)", "border-y", "border-line");
    expect(list.children).toHaveLength(3);
    expect(rows().every((link) => link.parentElement?.parentElement === list)).toBe(true);
  });

  it("el enlace a la biblioteca mide el área táctil mínima", () => {
    render(<PrincipleCard principle={PRINCIPLE} related={related(DRILLS)} />);

    expect(screen.getByRole("link", { name: "Ver todos en la biblioteca" })).toHaveClass("min-h-(--target-min)");
  });
});

// `PrincipleCard` es un componente de servidor y se repite una vez por principio: al sumarle
// `DrillCard` no puede arrastrar ningún módulo de cliente (la hoja inferior, Radix...).
describe("PrincipleCard · grafo de importaciones", () => {
  const { graph, client } = clientBoundary("ui/principle-card.tsx");

  it("recorre de verdad sus dependencias", () => {
    expect(graph).toEqual(
      expect.arrayContaining(["ui/principle-card.tsx", "ui/drill-card.tsx", "ui/cta-button.tsx", "ui/card.tsx"]),
    );
  });

  it("no contiene ningún módulo de cliente", () => {
    expect(client).toEqual([]);
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
