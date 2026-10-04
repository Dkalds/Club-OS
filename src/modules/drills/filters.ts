import type { DrillFilters } from "./types";

// Los valores que ofrecen los chips de la barra de filtros. Todos caen dentro de lo que
// `parseDrillFilters` admite, así que ninguno genera una URL que se descarte. Van tipados
// como `readonly number[]` (no como tupla de literales) para poder comparar con el filtro
// activo, que es un `number` cualquiera.
export const AGE_OPTIONS: readonly number[] = [8, 10, 12, 14, 16, 18];
export const PLAYER_OPTIONS: readonly number[] = [4, 6, 8, 10, 12, 14, 16];
export const MINUTE_OPTIONS: readonly number[] = [5, 10, 15, 20, 30];

/** Los filtros en el orden fijo en que se escriben en la URL: dos enlaces iguales son idénticos. */
const FILTER_KEYS = [
  "q",
  "focus",
  "principle",
  "age",
  "players",
  "minutes",
] as const satisfies ReadonlyArray<keyof DrillFilters>;

/** Los límites que la base de datos impone a cada rango (ver `drills`). */
const AGE_RANGE = { min: 8, max: 18 } as const;
const PLAYERS_RANGE = { min: 1, max: 40 } as const;
const MINUTES_RANGE = { min: 1, max: 120 } as const;

/**
 * Lo más largo que se busca (en caracteres). Más allá no es una búsqueda, es una pared de
 * texto. Es el corte de `parseDrillFilters`; el campo de búsqueda de la pantalla lo recibe
 * como `maxLength`, para que lo que se teclea nunca pase de lo que la URL conserva.
 */
export const MAX_QUERY_LENGTH = 80;

/** Un slug: minúsculas y dígitos separados por guiones sueltos («transicion-defensiva»). */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Un entero decimal sin signo, sin espacios, sin decimales ni exponente. */
const PLAIN_INTEGER_RE = /^\d+$/;

type SearchParams = Record<string, string | string[] | undefined>;

/** Next entrega un `string[]` cuando el parámetro se repite: vale el primero. */
function firstValue(params: SearchParams, key: string): string | undefined {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

/** Los caracteres de control (`\p{Cc}`): de NUL a US, DEL y la zona C1. */
const CONTROL_CHARS_RE = /\p{Cc}/gu;

/**
 * La búsqueda de texto: sin caracteres de control, recortada, ausente si queda vacía y
 * limitada a `MAX_QUERY_LENGTH` (80) caracteres. Cada carácter de control se lee como un
 * espacio: `?q=%00` llega como un NUL, que una columna `text` de Postgres no puede guardar, y
 * la búsqueda fallaría con un error de la base de datos en vez de no encontrar nada. El corte
 * cuenta caracteres, no unidades UTF-16: partir un emoji por la mitad dejaría un sustituto
 * suelto con el que `encodeURIComponent` lanza una excepción.
 */
function parseQuery(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;

  const text = Array.from(raw.replace(CONTROL_CHARS_RE, " ").trim())
    .slice(0, MAX_QUERY_LENGTH)
    .join("")
    .trim();

  return text === "" ? undefined : text;
}

function parseSlug(raw: string | undefined): string | undefined {
  return raw !== undefined && SLUG_RE.test(raw) ? raw : undefined;
}

/**
 * Un entero decimal dentro de su rango. Solo se aceptan dígitos: «12» sí; «12.5», «1e1»,
 * « 12», «+12» o «１２» no. Los ceros a la izquierda se toleran («012» es 12). Una cifra
 * desmesurada da `Infinity` y cae fuera del rango.
 */
function parseInteger(raw: string | undefined, range: { min: number; max: number }): number | undefined {
  if (raw === undefined || !PLAIN_INTEGER_RE.test(raw)) return undefined;

  const value = Number(raw);

  return value >= range.min && value <= range.max ? value : undefined;
}

/**
 * Los filtros de la biblioteca a partir de la query de la URL (los `searchParams` de Next,
 * ya resueltos).
 *
 * Esto corre en cada carga de la página con lo que cada usuario haya escrito en la barra de
 * direcciones, así que nunca lanza: lo que no vale se ignora en silencio. El resultado solo
 * tiene las claves que valen, ninguna con `undefined`.
 */
export function parseDrillFilters(searchParams: SearchParams): DrillFilters {
  const q = parseQuery(firstValue(searchParams, "q"));
  const focus = parseSlug(firstValue(searchParams, "focus"));
  const principle = parseSlug(firstValue(searchParams, "principle"));
  const age = parseInteger(firstValue(searchParams, "age"), AGE_RANGE);
  const players = parseInteger(firstValue(searchParams, "players"), PLAYERS_RANGE);
  const minutes = parseInteger(firstValue(searchParams, "minutes"), MINUTES_RANGE);

  // Se añade solo lo que vale: una clave con `undefined` no es lo mismo que no tenerla para
  // quien recorra el objeto (`Object.keys`, `filterHref`, la página).
  const filters: DrillFilters = {};
  if (q !== undefined) filters.q = q;
  if (focus !== undefined) filters.focus = focus;
  if (principle !== undefined) filters.principle = principle;
  if (age !== undefined) filters.age = age;
  if (players !== undefined) filters.players = players;
  if (minutes !== undefined) filters.minutes = minutes;

  return filters;
}

/** Un valor cuenta como puesto si no es `undefined` ni una cadena vacía o en blanco. */
function isSet(value: string | number | undefined): value is string | number {
  return value !== undefined && String(value).trim() !== "";
}

/**
 * La URL de la biblioteca con un cambio de filtros: el `patch` pisa a los `current`, y un
 * valor `undefined` (o vacío) en el `patch` quita ese filtro. Los filtros salen siempre en
 * el mismo orden (`q, focus, principle, age, players, minutes`), con los valores codificados,
 * y sin filtros queda la ruta a secas, sin «?».
 *
 * `pathname` es la ruta sin query. Un `q` con espacios interiores, «&» o tildes sobrevive al
 * viaje de ida y vuelta por `parseDrillFilters`, salvo los espacios de los lados: el lector los
 * recorta (`q: "rebote "` vuelve como `"rebote"`), y corta lo que pase de `MAX_QUERY_LENGTH`.
 */
export function filterHref(
  pathname: string,
  current: DrillFilters,
  patch: Partial<Record<keyof DrillFilters, string | number | undefined>>,
): string {
  const merged: Partial<Record<keyof DrillFilters, string | number | undefined>> = { ...current, ...patch };
  const query = new URLSearchParams();

  for (const key of FILTER_KEYS) {
    const value = merged[key];
    if (isSet(value)) query.append(key, String(value));
  }

  const search = query.toString();

  return search === "" ? pathname : `${pathname}?${search}`;
}

/** Si hay algún filtro puesto, para enseñar «Quitar filtros» y distinguir «sin resultados» de «sin ejercicios». */
export function hasActiveFilters(f: DrillFilters): boolean {
  return FILTER_KEYS.some((key) => isSet(f[key]));
}
