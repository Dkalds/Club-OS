// Genera src/ui/tokens.css a partir de design/tokens.json.
//   pnpm tokens
//
// Dos bloques:
//  - `:root`: familias sin equivalente en Tailwind (colores, espaciado, tamaños).
//  - `@theme static`: familias cuyo nombre ya es un espacio de nombres de Tailwind
//    v4 (`--radius-*`, `--shadow-*`, `--text-*`). Declararlas ahí crea la variable
//    y su utilidad (`rounded-lg`, `shadow-sheet`, `text-body`) a la vez, sin
//    alias que se referencien a sí mismos. `static` fuerza que Tailwind emita
//    todas las variables a `:root` aunque ninguna clase las use.
//
// Lo que NO se emite: `usage`, nombres de tema y los `brand-*`. Los pone el club
// en tiempo de ejecución (ver src/ui/brand-defaults.css).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Token = { name: string; value: string; usage?: string };

type ColorToken = {
  name: string;
  // Cadena (`#0a0a0b`, `{ink}` = alias) o un valor por tema (`brand-*`).
  value: string | Record<string, string>;
  usage?: string;
};

type TypeStyle = {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  letterSpacing?: string;
  sample?: string;
  usage?: string;
};

export type DesignTokens = {
  name: string;
  version: number;
  color: {
    themes: { id: string; name: string }[];
    tokens: ColorToken[];
  };
  type: {
    fonts: unknown[];
    families: Record<string, string>;
    groups: { name: string; family: string; styles: TypeStyle[] }[];
  };
  spacing: { tokens: Token[] };
  radius: { tokens: Token[] };
  size: { tokens: Token[] };
  shadow: { tokens: Token[] };
};

const HEADER = "/* Generado desde design/tokens.json; no editar */";
const ALIAS = /^\{([a-z0-9-]+)\}$/;

function resolveColor(token: ColorToken, themeId: string): string {
  const raw = typeof token.value === "string" ? token.value : token.value[themeId];
  if (raw === undefined) {
    throw new Error(`El token «${token.name}» no tiene valor para el tema «${themeId}»`);
  }
  const alias = ALIAS.exec(raw);
  return alias ? `var(--${alias[1]})` : raw;
}

export function tokensToCss(tokens: DesignTokens): string {
  const [firstTheme] = tokens.color.themes;
  if (!firstTheme) throw new Error("tokens.json no define ningún tema de color");

  const rootLines: string[] = [];
  for (const token of tokens.color.tokens) {
    // Los colores de marca los pone cada club (organization_branding).
    if (token.name.startsWith("brand-")) continue;
    rootLines.push(`--${token.name}: ${resolveColor(token, firstTheme.id)};`);
  }
  for (const token of tokens.spacing.tokens) rootLines.push(`--${token.name}: ${token.value};`);
  for (const token of tokens.size.tokens) rootLines.push(`--${token.name}: ${token.value};`);

  // `--x-*: initial` vacía el espacio de nombres de Tailwind: solo existen
  // utilidades de tokens (no hay `rounded-2xl`, `shadow-md` ni `text-sm`).
  const themeLines: string[] = ["--radius-*: initial;"];
  for (const token of tokens.radius.tokens) themeLines.push(`--${token.name}: ${token.value};`);

  themeLines.push("--shadow-*: initial;");
  for (const token of tokens.shadow.tokens) themeLines.push(`--${token.name}: ${token.value};`);

  themeLines.push("--text-*: initial;");
  for (const group of tokens.type.groups) {
    for (const style of group.styles) {
      themeLines.push(`--text-${style.name}: ${style.fontSize};`);
      themeLines.push(`--text-${style.name}--line-height: ${style.lineHeight};`);
      themeLines.push(`--text-${style.name}--font-weight: ${style.fontWeight};`);
      if (style.letterSpacing) {
        themeLines.push(`--text-${style.name}--letter-spacing: ${style.letterSpacing};`);
      }
    }
  }

  const indent = (lines: string[]) => lines.map((line) => `  ${line}`);
  return [
    HEADER,
    ":root {",
    ...indent(rootLines),
    "}",
    "",
    "@theme static {",
    ...indent(themeLines),
    "}",
    "",
  ].join("\n");
}

function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const tokens = JSON.parse(
    readFileSync(path.join(root, "design/tokens.json"), "utf8"),
  ) as DesignTokens;
  const target = path.join(root, "src/ui/tokens.css");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, tokensToCss(tokens));
  console.log(`tokens: ${path.relative(root, target)} generado`);
}

// Solo como CLI (`pnpm tokens`); importado desde un test no escribe nada.
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
) {
  main();
}
