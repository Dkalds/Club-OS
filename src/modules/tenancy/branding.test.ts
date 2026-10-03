import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  brandingToCssVars,
  parseTerminology,
  PLATFORM_BRAND_COLORS,
  sanitizeBrandColors,
} from "./branding";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const CLUB_COLORS = {
  accent: "#5aa9e6",
  accentPressed: "#4a90c8",
  onAccent: "#0a0a0b",
  accentSoft: "#14283a",
};

const PLATFORM_VARS = {
  "--brand-accent": "#f2eee6",
  "--brand-accent-pressed": "#d9d4ca",
  "--brand-on-accent": "#0a0a0b",
  "--brand-accent-soft": "#26262a",
};

describe("brandingToCssVars", () => {
  it("usa los colores válidos del club", () => {
    expect(brandingToCssVars(CLUB_COLORS)).toEqual({
      "--brand-accent": "#5aa9e6",
      "--brand-accent-pressed": "#4a90c8",
      "--brand-on-accent": "#0a0a0b",
      "--brand-accent-soft": "#14283a",
    });
  });

  it("rechaza un color malformado", () => {
    // Review Focus 5: nada que no sea #rrggbb llega al atributo `style`.
    const vars = brandingToCssVars({ ...CLUB_COLORS, accent: "red;background:url(x)" });

    expect(vars["--brand-accent"]).toBe("#f2eee6");
    // Solo cae el color malo; los otros tres siguen siendo los del club.
    expect(vars["--brand-accent-pressed"]).toBe("#4a90c8");
    expect(vars["--brand-on-accent"]).toBe("#0a0a0b");
    expect(vars["--brand-accent-soft"]).toBe("#14283a");
  });

  it("sin marca usa los colores de plataforma", () => {
    expect(brandingToCssVars(null)).toEqual(PLATFORM_VARS);
    expect(brandingToCssVars({})).toEqual(PLATFORM_VARS);
  });

  it("acepta hex en mayúsculas", () => {
    expect(brandingToCssVars({ ...CLUB_COLORS, accent: "#5AA9E6" })["--brand-accent"]).toBe(
      "#5aa9e6",
    );
  });

  it.each([
    ["sin almohadilla", "5aa9e6"],
    ["hex corto", "#5ae"],
    ["hex con alfa", "#5aa9e6ff"],
    ["siete dígitos", "#5aa9e60"],
    ["letras fuera de a-f", "#5aa9eg"],
    ["nombre de color", "red"],
    ["función de color", "rgb(90, 169, 230)"],
    ["variable CSS", "var(--danger)"],
    ["otra declaración detrás", "#5aa9e6;background:url(x)"],
    ["cierre de bloque", "#5aa9e6}body{display:none"],
    ["espacio delante", " #5aa9e6"],
    ["espacio detrás", "#5aa9e6 "],
    ["salto de línea detrás", "#5aa9e6\n"],
    ["salto de línea delante", "\n#5aa9e6"],
    ["segunda línea válida", "red\n#5aa9e6"],
    ["cadena vacía", ""],
  ])("un color que no es #rrggbb cae al de plataforma: %s", (_case, value) => {
    expect(brandingToCssVars({ ...CLUB_COLORS, accent: value })["--brand-accent"]).toBe("#f2eee6");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["número", 0x5aa9e6],
    ["objeto", { toString: () => "#5aa9e6" }],
    ["lista", ["#5aa9e6"]],
  ])("un valor que no es texto cae al de plataforma: %s", (_case, value) => {
    const colors = { ...CLUB_COLORS, accent: value } as unknown as Partial<typeof CLUB_COLORS>;

    expect(brandingToCssVars(colors)["--brand-accent"]).toBe("#f2eee6");
  });

  it("cada clave cae por separado a su propio color de plataforma", () => {
    expect(
      brandingToCssVars({
        accent: "x",
        accentPressed: "x",
        onAccent: "x",
        accentSoft: "x",
      }),
    ).toEqual(PLATFORM_VARS);
  });

  it("solo devuelve las cuatro variables de marca", () => {
    const colors = { ...CLUB_COLORS, background: "url(x)" } as Partial<typeof CLUB_COLORS>;

    expect(Object.keys(brandingToCssVars(colors)).sort()).toEqual(Object.keys(PLATFORM_VARS).sort());
  });
});

describe("sanitizeBrandColors", () => {
  it("devuelve los cuatro colores, cada uno válido o el de plataforma", () => {
    expect(sanitizeBrandColors({ accent: "#5AA9E6", accentPressed: "javascript:alert(1)" })).toEqual({
      accent: "#5aa9e6",
      accentPressed: PLATFORM_BRAND_COLORS.accentPressed,
      onAccent: PLATFORM_BRAND_COLORS.onAccent,
      accentSoft: PLATFORM_BRAND_COLORS.accentSoft,
    });
  });

  it("sin colores devuelve una copia de los de plataforma", () => {
    const colors = sanitizeBrandColors(null);

    expect(colors).toEqual(PLATFORM_BRAND_COLORS);
    expect(colors).not.toBe(PLATFORM_BRAND_COLORS);
  });
});

describe("PLATFORM_BRAND_COLORS", () => {
  it("son los de la marca de plataforma", () => {
    expect(PLATFORM_BRAND_COLORS).toEqual({
      accent: "#f2eee6",
      accentPressed: "#d9d4ca",
      onAccent: "#0a0a0b",
      accentSoft: "#26262a",
    });
  });

  it("coinciden con src/ui/brand-defaults.css", () => {
    // Las dos fuentes no pueden separarse: fuera de un club manda el CSS; dentro, cuando un
    // color del club no vale, manda esta constante. Tienen que pintar lo mismo.
    const css = readFileSync(path.resolve(import.meta.dirname, "../../ui/brand-defaults.css"), "utf8");
    const declared = Object.fromEntries(
      [...css.matchAll(/(--brand-[a-z-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
        name,
        value.trim(),
      ]),
    );

    expect(declared).toEqual(brandingToCssVars(PLATFORM_BRAND_COLORS));
    expect(declared).toEqual(brandingToCssVars(null));
  });

  it("no se pueden modificar", () => {
    expect(Object.isFrozen(PLATFORM_BRAND_COLORS)).toBe(true);
  });
});

describe("parseTerminology", () => {
  it("lee los dos términos que la app conoce", () => {
    expect(parseTerminology({ way: "Nuestro estilo", standards: "Normas del club" })).toEqual({
      way: "Nuestro estilo",
      standards: "Normas del club",
    });
  });

  it("recorta espacios y junta los repetidos", () => {
    expect(parseTerminology({ way: "  Nuestro \n  estilo  " })).toEqual({ way: "Nuestro estilo" });
  });

  it("ignora las claves que no conoce", () => {
    expect(parseTerminology({ way: "Nuestro estilo", drills: "Tareas", home: "Portada" })).toEqual({
      way: "Nuestro estilo",
    });
  });

  it.each([
    ["número", 7],
    ["booleano", true],
    ["null", null],
    ["objeto", { es: "Nuestro estilo" }],
    ["lista", ["Nuestro estilo"]],
    ["cadena vacía", ""],
    ["solo espacios", "   "],
    ["texto demasiado largo", "a".repeat(41)],
  ])("ignora un término que no es un texto corto: %s", (_case, value) => {
    expect(parseTerminology({ way: value, standards: "Normas" })).toEqual({ standards: "Normas" });
  });

  it("acepta un término justo en el límite de longitud", () => {
    const term = "a".repeat(40);

    expect(parseTerminology({ way: term })).toEqual({ way: term });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["texto", "The Way"],
    ["número", 3],
    ["lista", [{ way: "Nuestro estilo" }]],
  ])("sin un objeto devuelve la terminología vacía: %s", (_case, value) => {
    expect(parseTerminology(value)).toEqual({});
  });

  it("no lee términos heredados del prototipo", () => {
    const inherited = Object.create({ way: "Heredado" }) as Record<string, unknown>;

    expect(parseTerminology(inherited)).toEqual({});
  });
});
