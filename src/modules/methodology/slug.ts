/** El largo máximo que admite el CHECK de `way_sections.slug` y `game_principles.slug`. */
const MAX_SLUG_LENGTH = 60;

/** Dirección que la página de los Standards se reserva dentro de The Way (`/way/standards`). */
const RESERVED_SLUG = "standards";

function trimDashes(text: string): string {
  return text.replace(/^-+|-+$/g, "");
}

/**
 * El slug de un título: minúsculas, sin acentos, y todo lo que no sea una letra o un número
 * se vuelve un guion (uno solo por racha, nunca en los extremos). Como mucho 60 caracteres,
 * sin un guion colgando tras el corte. Puede quedar vacío si el título no tiene letras ni
 * números.
 */
export function slugify(text: string): string {
  const dashed = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-");

  return trimDashes(trimDashes(dashed).slice(0, MAX_SLUG_LENGTH));
}

/**
 * Un slug que no choca con los `taken` del club ni con el reservado `standards`: si el
 * primero está ocupado, prueba `-2`, `-3`… hasta dar con uno libre. Una base vacía (un
 * título sin letras) parte de `fallback`. El sufijo nunca saca el slug de los 60
 * caracteres: recorta la base lo justo.
 */
export function uniqueSlug(base: string, taken: string[], fallback: string): string {
  const root = base === "" ? fallback : base;
  const used = new Set(taken);
  used.add(RESERVED_SLUG);

  if (!used.has(root)) return root;

  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${trimDashes(root.slice(0, MAX_SLUG_LENGTH - suffix.length))}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
