import { DEFAULT_PHASES } from "@/modules/practice/items";
import type { PracticeItemDraft, SavedPracticeItem } from "@/modules/practice/types";

// La lista del constructor como dato: sus filas, cómo se comparan, qué se envía de ellas y cómo
// se reparten los errores de un guardado. Sin React: lo que pinta está en `practice-builder.tsx`.

/**
 * Una fila del constructor: el ítem y la clave con la que React y dnd-kit la siguen mientras se
 * mueve. La clave es el `id` del ítem o, en uno nuevo, una local; nunca se envía.
 */
export type Row = PracticeItemDraft & { key: string };

/** Los errores de una fila: el mensaje de cada campo (`title`, `minutes`, `phase`, `notes`…). */
export type RowErrors = Record<string, string>;

const NO_PHASE = { value: "", label: "Sin fase" };

export function toRow(item: SavedPracticeItem): Row {
  return { ...item, key: item.id };
}

/**
 * La fila como la recibe la acción: sin la clave, y sin `id` si aún no lo tiene.
 *
 * Conocido y aceptado: un ítem nuevo no recibe su `id` hasta que la página se recarga (la
 * acción devuelve solo la copia nueva, no los ítems). Guardar dos veces en la misma visita lo
 * envía otra vez sin `id`, y la base de datos lo vuelve a crear: mismo contenido, otro id.
 */
export function toItem(row: Row): PracticeItemDraft {
  const item = {
    drillId: row.drillId,
    title: row.title,
    phase: row.phase,
    minutes: row.minutes,
    notes: row.notes,
  };
  return row.id === undefined ? item : { id: row.id, ...item };
}

/** Si dos listas son la misma: las mismas filas, en el mismo orden y con lo mismo escrito. */
export function sameRows(a: Row[], b: Row[]): boolean {
  return (
    a.length === b.length &&
    a.every((row, index) => {
      const other = b[index];
      return (
        row.key === other.key &&
        row.title === other.title &&
        row.phase === other.phase &&
        row.minutes === other.minutes &&
        row.notes === other.notes
      );
    })
  );
}

/**
 * Pone a cada fila de `rows` el id que el servidor asignó, por posición: `rows[i].id = itemIds[i]`.
 * Si las longitudes no coinciden (no puede ocurrir; indica un bug en el servidor o en la acción),
 * devuelve `rows` sin modificar y registra el error para que no pase en silencio.
 */
export function withSavedIds(rows: Row[], itemIds: string[] | undefined): Row[] {
  if (!itemIds || rows.length !== itemIds.length) return rows;
  return rows.map((row, i) => ({ ...row, id: itemIds[i] }));
}

/**
 * Los errores de campo de un guardado (`items.1.title`), repartidos por fila: de la más alta de
 * la lista a la más baja. `keys` son las claves de las filas en el orden en que se enviaron: el
 * número del error es la posición de entonces, y la fila ha podido moverse después.
 */
export function errorsByRow(fieldErrors: Record<string, string>, keys: string[]): Map<string, RowErrors> {
  const found: Array<{ index: number; field: string; message: string }> = [];
  for (const [path, message] of Object.entries(fieldErrors)) {
    const match = /^items\.(\d+)\.(\w+)$/.exec(path);
    if (match) found.push({ index: Number(match[1]), field: match[2], message });
  }

  const byRow = new Map<string, RowErrors>();
  for (const { index, field, message } of found.sort((a, b) => a.index - b.index)) {
    const key = keys[index];
    if (key !== undefined) byRow.set(key, { ...byRow.get(key), [field]: message });
  }
  return byRow;
}

/**
 * Las fases que ofrece el selector de una fila: «Sin fase», las de una sesión y, detrás, las
 * que ya tenga algún ítem y no estén entre ellas (la fase es texto libre en la base de datos).
 * `rows` son las filas de ahora y las guardadas: una fase propia que se acaba de cambiar por
 * otra sigue en la lista, para poder volver a ella.
 */
export function phaseOptions(rows: Row[]): Array<{ value: string; label: string }> {
  const own = rows.map((row) => row.phase).filter((phase): phase is string => phase !== null);
  const phases = new Set([...DEFAULT_PHASES, ...own]);
  return [NO_PHASE, ...[...phases].map((phase) => ({ value: phase, label: phase }))];
}
