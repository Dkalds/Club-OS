// Herramientas de marca para `/admin/club` (contrato, Fase 7): validar el acento que elige
// dirección y derivar los otros tres colores de marca a partir de él (design/README.md: «Al
// configurar un club, valida su acento: brand-accent con al menos 4.5:1 sobre bg, surface-1 y
// surface-2, y brand-on-accent con al menos 4.5:1 sobre brand-accent»).

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Los tres fondos de plataforma contra los que tiene que leerse el acento (design/tokens.json),
// del más oscuro al más claro: el que manda es el más claro, `surface-2`.
const PLATFORM_BACKGROUNDS = ["#0a0a0b", "#141416", "#1c1c1f"] as const;

// Los dos candidatos a `brand-on-accent`: el texto de plataforma (`ink`) y el fondo de
// plataforma (`bg`), los mismos dos que ya usa `PLATFORM_BRAND_COLORS`.
const ON_ACCENT_CANDIDATES = ["#f2eee6", "#0a0a0b"] as const;

const MIN_CONTRAST = 4.5;

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const byte = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** Luminancia relativa (WCAG 2.x). */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** El contraste WCAG entre dos colores, de 1 (igual) a 21 (negro sobre blanco). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;

  return { h, s, l };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function withLightness(hex: string, l: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb({ ...hsl, l: Math.min(1, Math.max(0, l)) }));
}

/** El contraste más bajo del acento contra los tres fondos de plataforma: el que manda. */
function minBackgroundContrast(hex: string): number {
  return Math.min(...PLATFORM_BACKGROUNDS.map((bg) => contrastRatio(hex, bg)));
}

/** El mejor de los dos candidatos a `brand-on-accent`, y su contraste contra el acento. */
function bestOnAccent(hex: string): { color: string; contrast: number } {
  const [a, b] = ON_ACCENT_CANDIDATES.map((candidate) => ({
    color: candidate,
    contrast: contrastRatio(hex, candidate),
  }));
  return a!.contrast >= b!.contrast ? a! : b!;
}

export type AccentValidation =
  | { ok: true }
  | { ok: false; reason: "FORMAT" }
  | { ok: false; reason: "CONTRAST"; suggested: string };

/**
 * Valida un acento propuesto por dirección (design/README.md). Uno que no es `#rrggbb` es
 * `FORMAT`; uno que no llega a 4.5:1 contra los tres fondos de plataforma, o cuyo mejor
 * `brand-on-accent` no llega a 4.5:1 contra él, es `CONTRAST` con el tono más cercano (misma
 * tonalidad, solo más claro) que sí cumple las dos cosas.
 */
export function validateAccent(hex: string): AccentValidation {
  if (!HEX_COLOR.test(hex)) return { ok: false, reason: "FORMAT" };

  const normalized = hex.toLowerCase();
  if (minBackgroundContrast(normalized) >= MIN_CONTRAST && bestOnAccent(normalized).contrast >= MIN_CONTRAST) {
    return { ok: true };
  }

  // Los fondos de plataforma son oscuros: el tono que le falta a un acento que no contrasta
  // lo suficiente es claridad, nunca oscuridad, así que basta subirla paso a paso.
  const hsl = rgbToHsl(hexToRgb(normalized));
  for (let l = hsl.l; l <= 1; l += 0.02) {
    const candidate = withLightness(normalized, l);
    if (minBackgroundContrast(candidate) >= MIN_CONTRAST && bestOnAccent(candidate).contrast >= MIN_CONTRAST) {
      return { ok: false, reason: "CONTRAST", suggested: candidate };
    }
  }
  // Un acento casi blanco de por sí no vale: su `brand-on-accent` nunca llegaría a 4.5:1.
  return { ok: false, reason: "CONTRAST", suggested: "#f2eee6" };
}

export type BrandColors = {
  accent: string;
  accentPressed: string;
  onAccent: string;
  accentSoft: string;
};

/**
 * Los otros tres colores de marca a partir de un acento ya válido (`validateAccent`): oscurecido
 * para el estado pulsado, el texto o fondo de plataforma que mejor contrasta, y una base muy
 * oscura y casi sin saturación (como `surface-2`, pero con un matiz del acento) para fondos
 * suaves.
 */
export function deriveBrandColors(accent: string): BrandColors {
  const normalized = accent.toLowerCase();
  const hsl = rgbToHsl(hexToRgb(normalized));

  return {
    accent: normalized,
    accentPressed: withLightness(normalized, Math.max(0, hsl.l - 0.12)),
    onAccent: bestOnAccent(normalized).color,
    accentSoft: rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s * 0.2, l: 0.16 })),
  };
}
