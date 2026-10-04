// Lo que un club del seed tiene además del seed: secciones y Standards creados a mano en
// Gestión. `pnpm seed` no los borra (en un entorno de demo son contenido de verdad), pero
// tampoco puede dejarlos donde están: devuelve su número a las filas del seed, y el número es
// único por club. Aquí se decide, sin tocar la base de datos, a dónde va cada fila creada a
// mano. `run.ts` las escribe en la misma sentencia que las del seed.

import type { Tables } from "@/lib/database.types";

type SectionRow = Tables<"way_sections">;
type StandardRow = Tables<"standards">;

/** El mayor número de una sección o de un Standard: el CHECK de las dos tablas. */
const MAX_NUMBER = 99;

/** Cuántas filas del seed tiene cada club. */
function countByClub(seed: { organization_id: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of seed) counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
  return counts;
}

/**
 * Las secciones creadas a mano, con su sitio nuevo: detrás de las del seed de su club y en el
 * orden en que llegan, que es el que tenían en la lista. El número de una sección es su
 * posición, así que `number` y `sort` van a la par, como al reordenar en Gestión.
 */
export function restackSections(
  seed: { organization_id: string }[],
  strays: SectionRow[],
): SectionRow[] {
  const last = countByClub(seed);
  const placed = strays.map((stray) => {
    const position = (last.get(stray.organization_id) ?? 0) + 1;
    last.set(stray.organization_id, position);
    return { ...stray, number: position, sort: position };
  });

  for (const [organizationId, total] of last) {
    if (total > MAX_NUMBER) {
      throw new Error(
        `Seed: el club ${organizationId} tendría ${total} secciones y el máximo es ${MAX_NUMBER}.`,
      );
    }
  }
  return placed;
}

/** Un Standard creado a mano al que el seed le quita el número. */
export type MovedStandard = { organization_id: string; title: string; from: number; to: number };

/**
 * Los Standards creados a mano que tienen que cambiar de número porque el suyo es de un
 * Standard del seed, ya con el nuevo: el primero libre de su club, que no es ni del seed, ni
 * de otro Standard creado a mano, ni uno recién dado. El número lo elige dirección: el que no
 * choca se queda como está y no sale en `rows`. `moved` es el aviso para quien siembra.
 */
export function renumberStandards(
  seed: { organization_id: string; number: number }[],
  strays: StandardRow[],
): { rows: StandardRow[]; moved: MovedStandard[] } {
  const numbersOf = (rows: { organization_id: string; number: number }[]) => {
    const byClub = new Map<string, Set<number>>();
    for (const row of rows) {
      const numbers = byClub.get(row.organization_id) ?? new Set<number>();
      byClub.set(row.organization_id, numbers.add(row.number));
    }
    return byClub;
  };
  const seedNumbers = numbersOf(seed);
  // Los números que no se pueden dar: los del seed y los de todo lo creado a mano.
  const taken = numbersOf([...seed, ...strays]);

  const rows: StandardRow[] = [];
  const moved: MovedStandard[] = [];
  for (const stray of strays) {
    if (!seedNumbers.get(stray.organization_id)?.has(stray.number)) continue;

    const used = taken.get(stray.organization_id) ?? new Set<number>();
    let free = 1;
    while (used.has(free)) free += 1;
    if (free > MAX_NUMBER) {
      throw new Error(
        `Seed: el club ${stray.organization_id} no tiene ningún número de Standard libre para «${stray.title}».`,
      );
    }
    used.add(free);

    rows.push({ ...stray, number: free });
    moved.push({ organization_id: stray.organization_id, title: stray.title, from: stray.number, to: free });
  }
  return { rows, moved };
}
