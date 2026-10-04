// Lo que comparten los tests de componentes. Solo lo importan tests. Hay dos cosas:
//
// - `clientBoundary`: vigila que un componente de servidor no arrastre ningún módulo de cliente
//   (`DrillCard`, `PrincipleCard`). Un componente de servidor que importa (aunque sea de pasada)
//   un módulo con `"use client"` lo serializa y lo hidrata en cada uso, y le suma a la página
//   todo lo que ese módulo trae (la hoja inferior, Radix...). El test recorre las importaciones
//   relativas y con `@/`.
// - `installChipRowLayout`: un diseño falso para jsdom, que no calcula posiciones ni anchos, con
//   el que se prueba lo que una fila de chips hace con su desplazamiento.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";

/** La carpeta `src/`. */
export const SRC = path.resolve(import.meta.dirname, "..");

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

/** Los módulos del proyecto que `entry` importa, directa o indirectamente, y él mismo. */
export function importGraph(entry: string): string[] {
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

/** Si el módulo empieza con la directiva `"use client"`. */
export function isClientModule(file: string): boolean {
  return USE_CLIENT.test(readFileSync(file, "utf8"));
}

/**
 * Los módulos de `src/` que importa `entry` (ruta relativa a `src/`, con `/`), él incluido, y
 * cuáles de ellos son de cliente.
 */
export function clientBoundary(entry: string): { graph: string[]; client: string[] } {
  const graph = importGraph(path.join(SRC, entry)).map((file) =>
    path.relative(SRC, file).replaceAll("\\", "/"),
  );

  return { graph, client: graph.filter((file) => isClientModule(path.join(SRC, file))) };
}

// ── Una fila de chips con diseño ─────────────────────────────────────────────────────────
//
// jsdom no calcula posiciones ni anchos (todo mide 0), así que lo que una fila de chips hace con
// su desplazamiento no se puede ver sin darle un diseño falso. Este es el más simple: cada fila
// (`role="group"`) mide `rowWidth`, cada botón de dentro mide `chipWidth` y van uno detrás de
// otro desde la izquierda, desplazados lo que la fila lleve scrolleado. Vive aquí y no en cada
// test porque lo usan el de `filter` y el de la barra de filtros.

type Layout = { rowWidth: number; chipWidth: number };

export type ChipRowLayout = {
  /** Cada llamada a `scrollTo` de una fila (`mock.contexts` dice cuál). */
  scrollTo: ReturnType<typeof vi.fn>;
  /** Lo que lleva desplazada una fila ahora mismo. */
  scrollLeftOf: (row: Element) => number;
  /** Mueve la fila como lo haría quien la arrastra con el dedo (sin llamar a `scrollTo`). */
  dragRow: (row: Element, left: number) => void;
  /** Deja jsdom como estaba. */
  restore: () => void;
};

type Patched = "clientWidth" | "scrollLeft" | "scrollTo";

export function installChipRowLayout({ rowWidth, chipWidth }: Layout): ChipRowLayout {
  const scrolled = new WeakMap<Element, number>();
  const isRow = (element: Element) => element.getAttribute("role") === "group";
  const scrollLeftOf = (row: Element) => scrolled.get(row) ?? 0;

  const scrollTo = vi.fn(function scrollToStub(this: HTMLElement, options?: ScrollToOptions) {
    scrolled.set(this, options?.left ?? 0);
  });

  const rect = (left: number, width: number): DOMRect => ({
    x: left,
    y: 0,
    left,
    top: 0,
    width,
    height: 36,
    right: left + width,
    bottom: 36,
    toJSON: () => ({}),
  });

  const measure = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (isRow(this)) return rect(0, rowWidth);

    const row = this.parentElement;
    if (!row || !isRow(row) || this.tagName !== "BUTTON") return rect(0, 0);

    const chips = Array.from(row.children).filter((child) => child.tagName === "BUTTON");
    return rect(chips.indexOf(this) * chipWidth - scrollLeftOf(row), chipWidth);
  });

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return isRow(this) ? rowWidth : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
    configurable: true,
    get(this: HTMLElement) {
      return scrollLeftOf(this);
    },
    set(this: HTMLElement, left: number) {
      scrolled.set(this, left);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    writable: true,
    value: scrollTo,
  });

  return {
    scrollTo,
    scrollLeftOf,
    dragRow: (row, left) => scrolled.set(row, left),
    restore: () => {
      measure.mockRestore();
      for (const name of ["clientWidth", "scrollLeft", "scrollTo"] satisfies Patched[]) {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
      }
    },
  };
}
