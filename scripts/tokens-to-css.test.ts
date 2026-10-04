import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { type DesignTokens, tokensToCss, validateTokens } from "./tokens-to-css";

const root = path.resolve(import.meta.dirname, "..");
const tokens = JSON.parse(
  readFileSync(path.join(root, "design/tokens.json"), "utf8"),
) as DesignTokens;
const css = tokensToCss(tokens);

/** El primer tema del tokens.json real: su id es la clave de los valores por tema. */
const THEME = tokens.color.themes[0].id;

/** El tokens.json real con otros colores. */
function withColors(colors: DesignTokens["color"]["tokens"]): DesignTokens {
  return { ...tokens, color: { ...tokens.color, tokens: colors } };
}

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

  it("falla con un alias a un token que no existe, en vez de emitir un var() roto", () => {
    const broken = withColors([{ name: "a", value: "{nope}" }]);

    expect(() => tokensToCss(broken)).toThrow("El token «a» apunta a «{nope}», que no existe");
  });

  it("falla también con un alias desconocido dentro del valor de un tema", () => {
    const broken = withColors([{ name: "a", value: { [THEME]: "{nope}" } }]);

    expect(() => tokensToCss(broken)).toThrow("El token «a» apunta a «{nope}», que no existe");
  });

  it("acepta un alias a un token de marca: lo define el club en ejecución", () => {
    const aliased = withColors([
      { name: "brand-accent", value: { [THEME]: "#123456" } },
      { name: "focus", value: "{brand-accent}" },
    ]);

    expect(tokensToCss(aliased)).toContain("--focus: var(--brand-accent);");
  });
});

describe("validateTokens", () => {
  /** El tokens.json real con una de sus familias cambiada: lo que `main` le da a `validateTokens`. */
  function withFamily(name: keyof DesignTokens, value: unknown): unknown {
    return { ...tokens, [name]: value };
  }

  /** El tokens.json real con la posición `index` de una familia de tokens sustituida. */
  function withToken(
    family: "spacing" | "radius" | "size" | "shadow",
    index: number,
    token: unknown,
  ): unknown {
    const replaced = tokens[family].tokens.map((existing, at) => (at === index ? token : existing));
    return withFamily(family, { tokens: replaced });
  }

  it("el tokens.json real valida y se devuelve tal cual", () => {
    expect(validateTokens(tokens)).toEqual(tokens);
  });

  it("falla si lo leído no es un objeto", () => {
    expect(() => validateTokens(null)).toThrow("tokens.json");
    expect(() => validateTokens("tokens")).toThrow("tokens.json");
  });

  it.each([
    ["color.themes", () => withFamily("color", { ...tokens.color, themes: [] })],
    ["color.tokens", () => withFamily("color", { themes: tokens.color.themes })],
    ["type.groups", () => withFamily("type", { ...tokens.type, groups: undefined })],
    ["spacing.tokens", () => withFamily("spacing", {})],
    ["radius.tokens", () => withFamily("radius", undefined)],
    ["size.tokens", () => withFamily("size", { tokens: "44px" })],
    ["shadow.tokens", () => withFamily("shadow", { tokens: null })],
  ])("falla nombrando %s si esa familia falta o no es una lista", (family, input) => {
    expect(() => validateTokens(input())).toThrow(family);
  });

  it("falla si un token no tiene name, y dice cuál es por su posición", () => {
    const input = withToken("spacing", 2, { value: "4px" });

    expect(() => validateTokens(input)).toThrow("spacing.tokens[2]");
  });

  it("falla si un token no tiene value, y lo nombra", () => {
    const input = withToken("radius", 1, { name: "radius-nuevo" });

    expect(() => validateTokens(input)).toThrow("radius.tokens[1] («radius-nuevo»)");
  });

  it("falla si un nombre se repite en su familia, y lo nombra", () => {
    const repeated = tokens.size.tokens[0];
    const input = withFamily("size", { tokens: [...tokens.size.tokens, repeated] });

    expect(() => validateTokens(input)).toThrow(`size.tokens`);
    expect(() => validateTokens(input)).toThrow(`«${repeated.name}»`);
  });

  it("deja repetir un nombre en familias distintas", () => {
    const input = withFamily("shadow", {
      tokens: [...tokens.shadow.tokens, { name: tokens.size.tokens[0].name, value: "none" }],
    });

    expect(() => validateTokens(input)).not.toThrow();
  });

  it("falla si un estilo tipográfico no tiene tamaño, y dice cuál es", () => {
    const [group, ...others] = tokens.type.groups;
    const [style, ...styles] = group.styles;
    const input = withFamily("type", {
      ...tokens.type,
      groups: [{ ...group, styles: [{ ...style, fontSize: undefined }, ...styles] }, ...others],
    });

    expect(() => validateTokens(input)).toThrow(`type.groups[0].styles[0] («${style.name}»)`);
  });

  it("falla si un estilo tipográfico repite el nombre de otro, aunque sea de otro grupo", () => {
    const [first, second, ...others] = tokens.type.groups;
    const repeated = first.styles[0];
    const input = withFamily("type", {
      ...tokens.type,
      groups: [first, { ...second, styles: [...second.styles, repeated] }, ...others],
    });

    expect(() => validateTokens(input)).toThrow(`«${repeated.name}»`);
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
