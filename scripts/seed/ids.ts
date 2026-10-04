import { v5 as uuidv5 } from "uuid";

// Namespace fijo del proyecto para los ids del seed. No lo cambies: cada id ya sembrado
// (en local o en un entorno de demo) se calcula a partir de él, y cambiarlo haría que un
// nuevo `pnpm seed` duplicara todas las filas en vez de actualizarlas.
export const SEED_NAMESPACE = "b6f0c1a4-6d2e-4f3b-9a51-2c8e7d4a1f30";

/** Id determinista (uuid v5) de una fila del seed: mismo club y misma clave, mismo id. */
export function seedId(orgSlug: string, key: string): string {
  return uuidv5(`${orgSlug}:${key}`, SEED_NAMESPACE);
}

/**
 * Clave legible de un texto: minúsculas, sin tildes y con `-` entre palabras
 * («Bloqueo de rebote» → `bloqueo-de-rebote`). Con ella se nombran las filas del seed cuyo
 * id sale del título (secciones, principios, ejercicios) y los slugs de las que lo tienen.
 *
 * No es una copia: es la misma función con la que la app calcula el slug de una sección o de
 * un principio, así que los del seed son los que Gestión habría generado para ese título, con
 * su tope de 60 caracteres. El seed entero la toma de aquí.
 */
export { slugify } from "@/modules/methodology/slug";
