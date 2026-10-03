/** Nombres que cada club da a las secciones de la plataforma. */
export type Terminology = { way?: string; standards?: string };

export type BrandColors = {
  accent: string;
  accentPressed: string;
  onAccent: string;
  accentSoft: string;
};

export type Branding = {
  displayName: string;
  wordmarkSub: string | null;
  shortName: string;
  wayName: string;
  tagline: string | null;
  colors: BrandColors;
  terminology: Terminology;
};

/**
 * Marca de plataforma: la que se ve fuera de un club y la que sustituye a cualquier color
 * de club que no sea válido. Son los mismos cuatro valores de `src/ui/brand-defaults.css`
 * (un test lee ese CSS y los compara).
 */
export const PLATFORM_BRAND_COLORS: BrandColors = Object.freeze({
  accent: "#f2eee6",
  accentPressed: "#d9d4ca",
  onAccent: "#0a0a0b",
  accentSoft: "#26262a",
});

type BrandCssVar =
  | "--brand-accent"
  | "--brand-accent-pressed"
  | "--brand-on-accent"
  | "--brand-accent-soft";

const CSS_VAR_BY_COLOR = {
  accent: "--brand-accent",
  accentPressed: "--brand-accent-pressed",
  onAccent: "--brand-on-accent",
  accentSoft: "--brand-accent-soft",
} as const satisfies Record<keyof BrandColors, BrandCssVar>;

const COLOR_KEYS = Object.keys(CSS_VAR_BY_COLOR) as Array<keyof BrandColors>;

/** `#rrggbb` y nada más: la cadena entera, sin espacios ni saltos de línea. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Los cuatro colores de marca, cada uno validado por separado.
 *
 * Es un control de seguridad: estos valores acaban en un atributo `style`. Solo pasa un
 * `#rrggbb`; cualquier otra cosa (`red;background:url(x)`, un `var()`, algo que no sea
 * texto) se sustituye por el color de plataforma de esa clave. La base de datos tiene el
 * mismo control en un CHECK; este no depende de él.
 */
export function sanitizeBrandColors(colors: Partial<BrandColors> | null | undefined): BrandColors {
  const safe = { ...PLATFORM_BRAND_COLORS };
  if (typeof colors !== "object" || colors === null) return safe;

  for (const key of COLOR_KEYS) {
    const value: unknown = colors[key];
    if (typeof value === "string" && HEX_COLOR.test(value)) safe[key] = value.toLowerCase();
  }
  return safe;
}

/**
 * Las variables CSS de marca para el `style` del layout de un club. Sin marca, o con un
 * color que no es válido, salen las de plataforma.
 */
export function brandingToCssVars(colors: Partial<BrandColors> | null): Record<BrandCssVar, string> {
  const safe = sanitizeBrandColors(colors);

  return {
    "--brand-accent": safe.accent,
    "--brand-accent-pressed": safe.accentPressed,
    "--brand-on-accent": safe.onAccent,
    "--brand-accent-soft": safe.accentSoft,
  };
}

/** Un término cabe en una pestaña o en un título corto; más largo no es un término. */
const MAX_TERM_LENGTH = 40;
const TERM_KEYS = ["way", "standards"] as const satisfies ReadonlyArray<keyof Terminology>;

/**
 * Lee `organization_branding.terminology`, un `jsonb` sin forma garantizada.
 *
 * Solo salen las claves que la app conoce y solo si son un texto corto; lo demás se
 * ignora y la interfaz usa su etiqueta por defecto.
 */
export function parseTerminology(value: unknown): Terminology {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

  const terminology: Terminology = {};
  for (const key of TERM_KEYS) {
    if (!Object.hasOwn(value, key)) continue;
    const raw: unknown = (value as Record<string, unknown>)[key];
    if (typeof raw !== "string") continue;
    const term = raw.replace(/\s+/g, " ").trim();
    if (term.length > 0 && term.length <= MAX_TERM_LENGTH) terminology[key] = term;
  }
  return terminology;
}
