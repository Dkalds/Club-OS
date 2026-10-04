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
//
// Es estricto a propósito: este archivo es el origen de todos los tokens, y un fallo suyo
// no rompe nada a la vista, solo pinta mal en silencio. Una familia que falta, un token sin
// valor, un nombre repetido o un alias a un token que no existe lanzan un error que dice
// dónde está el problema, en vez de emitir `--x: undefined` o un `var()` sin definir.

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
// Cualquier cosa entre llaves es un alias, también un `{Ink}` mal escrito: así no se cuela
// como un valor literal y falla como alias desconocido.
const ALIAS = /^\{([^{}]*)\}$/;

function resolveColor(token: ColorToken, themeId: string, known: ReadonlySet<string>): string {
  const raw = typeof token.value === "string" ? token.value : token.value[themeId];
  if (raw === undefined) {
    throw new Error(`El token «${token.name}» no tiene valor para el tema «${themeId}»`);
  }
  const alias = ALIAS.exec(raw);
  if (!alias) return raw;
  // Los `brand-*` no se emiten, pero existen: los define el club y un alias a ellos vale.
  if (!known.has(alias[1])) {
    throw new Error(`El token «${token.name}» apunta a «${raw}», que no existe`);
  }
  return `var(--${alias[1]})`;
}

type Loose = Record<string, unknown>;

function isRecord(value: unknown): value is Loose {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function problem(message: string): never {
  throw new Error(`tokens.json: ${message}`);
}

// Una familia que falta, o que no es una lista, se nombra por su ruta (`spacing.tokens`).
function listAt(parent: unknown, key: string, path: string): unknown[] {
  const value = isRecord(parent) ? parent[key] : undefined;
  if (!Array.isArray(value)) problem(`falta «${path}» o no es una lista`);
  return value;
}

// Un elemento con `name` y los campos obligatorios `required`. `seen` guarda los nombres ya
// vistos de su familia: repetirlos haría que el segundo pise al primero sin avisar.
function checkNamed(
  item: unknown,
  at: string,
  family: string,
  required: string[],
  seen: Set<string>,
): void {
  if (!isRecord(item)) problem(`${at} no es un objeto`);
  const { name } = item;
  if (typeof name !== "string" || name === "") problem(`${at} no tiene name`);
  for (const key of required) {
    const field = item[key];
    if (field === undefined || field === null || field === "") {
      problem(`${at} («${name}») no tiene ${key}`);
    }
  }
  if (seen.has(name)) problem(`${family}: el nombre «${name}» está repetido`);
  seen.add(name);
}

/**
 * Comprueba que lo leído de design/tokens.json tiene la forma de `DesignTokens` y lo devuelve
 * tipado. Lanza un `Error` que nombra la ruta del problema: `spacing.tokens[2] no tiene name`.
 *
 * Mira lo que `tokensToCss` da por hecho (las familias, `name` y `value` de cada token, que
 * los estilos de texto tengan medidas) y que ningún nombre se repita dentro de su familia. Lo
 * demás (`usage`, `sample`, las fuentes) no se emite y no se comprueba.
 */
export function validateTokens(input: unknown): DesignTokens {
  if (!isRecord(input)) problem("no es un objeto");

  const themes = listAt(input.color, "themes", "color.themes");
  if (themes.length === 0) problem("«color.themes» está vacío: hace falta al menos un tema");
  themes.forEach((theme, index) => {
    if (!isRecord(theme) || typeof theme.id !== "string" || theme.id === "") {
      problem(`color.themes[${index}] no tiene id`);
    }
  });

  const colors = new Set<string>();
  listAt(input.color, "tokens", "color.tokens").forEach((token, index) =>
    checkNamed(token, `color.tokens[${index}]`, "color.tokens", ["value"], colors),
  );

  // Los nombres de estilo son únicos entre todos los grupos: cada uno es un `--text-<nombre>`.
  const styles = new Set<string>();
  listAt(input.type, "groups", "type.groups").forEach((group, groupIndex) => {
    const path = `type.groups[${groupIndex}].styles`;
    listAt(group, "styles", path).forEach((style, index) =>
      checkNamed(
        style,
        `${path}[${index}]`,
        "type.groups",
        ["fontSize", "lineHeight", "fontWeight"],
        styles,
      ),
    );
  });

  for (const family of ["spacing", "radius", "size", "shadow"] as const) {
    const names = new Set<string>();
    const path = `${family}.tokens`;
    listAt(input[family], "tokens", path).forEach((token, index) =>
      checkNamed(token, `${path}[${index}]`, path, ["value"], names),
    );
  }

  return input as DesignTokens;
}

export function tokensToCss(tokens: DesignTokens): string {
  const [firstTheme] = tokens.color.themes;
  if (!firstTheme) throw new Error("tokens.json no define ningún tema de color");

  const colorNames = new Set(tokens.color.tokens.map((token) => token.name));

  const rootLines: string[] = [];
  for (const token of tokens.color.tokens) {
    // Los colores de marca los pone cada club (organization_branding).
    if (token.name.startsWith("brand-")) continue;
    rootLines.push(`--${token.name}: ${resolveColor(token, firstTheme.id, colorNames)};`);
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
  const tokens = validateTokens(
    JSON.parse(readFileSync(path.join(root, "design/tokens.json"), "utf8")),
  );
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
