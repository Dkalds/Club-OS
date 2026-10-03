import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type DesignTokens, tokensToCss } from "./tokens-to-css";

const root = path.resolve(import.meta.dirname, "..");
const tokens = JSON.parse(
  readFileSync(path.join(root, "design/tokens.json"), "utf8"),
) as DesignTokens;
const css = tokensToCss(tokens);

describe("tokensToCss", () => {
  it("emite los colores del primer tema en :root", () => {
    expect(css).toContain(":root {");
    expect(css).toContain("--bg: #0a0a0b;");
    expect(css).toContain("--ink: #f2eee6;");
  });

  it("resuelve alias como var()", () => {
    expect(css).toContain("--focus-ring: var(--ink);");
  });

  it("emite espaciado, radios, tamaños y sombra", () => {
    expect(css).toContain("--space-4: 16px;");
    expect(css).toContain("--radius-lg: 16px;");
    expect(css).toContain("--target-min: 44px;");
    expect(css).toContain("--shadow-sheet: 0 -8px 24px rgba(0,0,0,0.5);");
  });

  it("no emite tokens brand-*", () => {
    expect(css).not.toContain("--brand-");
  });

  it("emite los estilos tipográficos con tamaño, interlínea, peso y tracking", () => {
    expect(css).toContain("--text-display-xl: 44px;");
    expect(css).toContain("--text-display-xl--line-height: 44px;");
    expect(css).toContain("--text-display-xl--font-weight: 700;");
    expect(css).toContain("--text-title--letter-spacing: 0.04em;");
    expect(css).toContain("--text-body-strong--font-weight: 600;");
    // Sin letterSpacing en el JSON, no se emite la propiedad.
    expect(css).not.toContain("--text-body--letter-spacing");
  });

  it("empieza con la cabecera de archivo generado", () => {
    expect(css.startsWith("/* Generado desde design/tokens.json; no editar")).toBe(true);
  });

  it("no emite nada de un club (usage, nombres de tema, colores de marca)", () => {
    expect(css).not.toMatch(/arc(a|á|Á)ngel/i);
    expect(css).not.toContain("c9a45c");
    expect(css).not.toContain("Plataforma.");
  });
});

describe("globals.css", () => {
  const globals = readFileSync(path.join(root, "src/app/globals.css"), "utf8");

  it("mapea a Tailwind todos los colores de tokens.json (marca incluida)", () => {
    for (const { name } of tokens.color.tokens) {
      expect(globals, `falta --color-${name}`).toContain(
        `--color-${name}: var(--${name});`,
      );
    }
  });

  it("deja la marca como variable en tiempo de ejecución (nada de hex en el tema)", () => {
    expect(globals).not.toMatch(/--color-[a-z0-9-]+:\s*#/);
  });

  it("copia los fallbacks de las familias tipográficas de tokens.json", () => {
    for (const stack of Object.values(tokens.type.families)) {
      const fallbacks = stack.split(",").slice(1).join(",").trim();
      expect(globals).toContain(fallbacks);
    }
  });
});
