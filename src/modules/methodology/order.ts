/**
 * Una copia de `items` con el elemento de `index` una posición más arriba o más abajo.
 * En los extremos, o con un índice que no existe, no hay movimiento. No muta la entrada.
 */
export function moveAt<T>(items: T[], index: number, direction: "up" | "down"): T[] {
  const moved = [...items];
  const target = direction === "up" ? index - 1 : index + 1;

  if (!Number.isInteger(index) || index < 0 || index >= items.length) return moved;
  if (target < 0 || target >= items.length) return moved;

  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}

/** Lo mismo que `moveAt`, para una lista de ids. Un id que no está no cambia nada. */
export function moveId(ids: string[], id: string, direction: "up" | "down"): string[] {
  return moveAt(ids, ids.indexOf(id), direction);
}
