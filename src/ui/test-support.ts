// Lo que comparten los tests de `src/ui` que vigilan que un componente de servidor no arrastre
// ningún módulo de cliente (`DrillCard`, `PrincipleCard`). Solo lo importan tests.
//
// Un componente de servidor que importa (aunque sea de pasada) un módulo con `"use client"`
// lo serializa y lo hidrata en cada uso, y le suma a la página todo lo que ese módulo trae (la
// hoja inferior, Radix...). El test recorre las importaciones relativas y con `@/`.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

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
