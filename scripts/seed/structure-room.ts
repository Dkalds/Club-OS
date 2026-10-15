// Lo que un club del seed puede tener en su estructura además del seed, o distinto de él: desde
// la pieza 5, su dirección crea y cambia temporadas, categorías, equipos y plantillas en Gestión.
// `pnpm seed` devuelve a las filas del seed sus valores, y varios de ellos son únicos: el nombre
// de una temporada o de una categoría en su club, el de un equipo en su temporada, un dorsal en
// su equipo. Si otra fila ya tiene ese valor, el upsert fallaría.
//
// Aquí se decide, sin tocar la base de datos, qué filas hay que apartar antes de sembrar.
// `run.ts` las escribe y después siembra. No se borra nada: una fila creada a mano que choca
// conserva todo salvo el nombre, que gana una marca, o el dorsal, que se queda vacío.

/** El tope de un nombre: el `check` de las tablas. */
const NAME_MAX = 60;

/** Un nombre como lo comparan los índices únicos: sin espacios alrededor ni mayúsculas. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

export type NamedRow = {
  id: string;
  name: string;
  /** Dentro de qué son únicos los nombres: el club o, en un equipo, el club y la temporada. */
  scope: string;
};

/**
 * Las filas que hay que renombrar para que las del seed recuperen su nombre: las que hoy llevan
 * el nombre que va a tener OTRA fila del seed en su mismo ámbito. Puede ser una creada a mano o
 * una del seed a la que se le cambió el nombre (esa lo recupera al sembrar).
 *
 * El nombre nuevo lleva el principio del id, que no se repite, y cabe en el tope.
 */
export function renamesFor(
  existing: readonly NamedRow[],
  seed: readonly NamedRow[],
): Array<{ id: string; name: string }> {
  const owner = new Map<string, string>();
  for (const row of seed) owner.set(`${row.scope}|${nameKey(row.name)}`, row.id);

  const renames: Array<{ id: string; name: string }> = [];
  for (const row of existing) {
    const target = owner.get(`${row.scope}|${nameKey(row.name)}`);
    if (target === undefined || target === row.id) continue;

    const mark = ` (${row.id.slice(0, 8)})`;
    renames.push({ id: row.id, name: `${row.name.trim().slice(0, NAME_MAX - mark.length)}${mark}` });
  }
  return renames;
}

export type SeatRow = { team_id: string; person_id: string; jersey_number?: number | null };

/**
 * Los sitios de una plantilla que tienen que soltar su dorsal para que los del seed recuperen
 * el suyo: los que hoy llevan el dorsal que va a llevar OTRA persona del seed en ese equipo.
 */
export function jerseysToFree(
  existing: readonly SeatRow[],
  seed: readonly SeatRow[],
): Array<{ team_id: string; person_id: string }> {
  const owner = new Map<string, string>();
  for (const seat of seed) {
    if (seat.jersey_number === null || seat.jersey_number === undefined) continue;
    owner.set(`${seat.team_id}|${seat.jersey_number}`, seat.person_id);
  }

  return existing
    .filter((seat) => {
      if (seat.jersey_number === null || seat.jersey_number === undefined) return false;
      const target = owner.get(`${seat.team_id}|${seat.jersey_number}`);
      return target !== undefined && target !== seat.person_id;
    })
    .map(({ team_id, person_id }) => ({ team_id, person_id }));
}
