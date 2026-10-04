import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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
// inferior, Radix...). Se recorren sus importaciones relativas y con `@/`.
const SRC = path.resolve(import.meta.dirname, "..");

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (!base) return null; // un paquete (react, next/link...): no es código del proyecto

  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function importGraph(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, spec] of source.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)) {
      const resolved = resolveImport(file, spec);
      if (resolved) pending.push(resolved);
    }
  }

  return [...seen];
}

// La directiva es lo primero del archivo, tras algún comentario como mucho.
const USE_CLIENT = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

describe("DrillCard · grafo de importaciones", () => {
  const graph = importGraph(path.join(SRC, "ui", "drill-card.tsx")).map((file) =>
    path.relative(SRC, file).replaceAll("\\", "/"),
  );

  it("recorre de verdad sus dependencias", () => {
    expect(graph).toEqual(
      expect.arrayContaining(["ui/drill-card.tsx", "ui/court-thumb.tsx", "ui/filter-tag.tsx"]),
    );
  });

  it("no contiene ningún módulo de cliente", () => {
    const client = graph.filter((file) =>
      USE_CLIENT.test(readFileSync(path.join(SRC, file), "utf8")),
    );

    expect(client).toEqual([]);
  });
});
