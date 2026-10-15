import { MAX_MINUTES, MIN_MINUTES, MINUTES_STEP } from "./limits";
import type { PhaseBlock } from "./types";

/**
 * Las fases que el constructor propone, en el orden de una sesión. La fase de un ítem es
 * texto libre, así que el tipo es `string` y no una unión de estas ocho.
 */
export const DEFAULT_PHASES: readonly string[] = [
  "Activación",
  "Técnica",
  "Táctica",
  "Rebote",
  "Transición",
  "Defensa",
  "Competición",
  "Vuelta a la calma",
];

/** Los minutos de la sesión: la suma de los de sus ítems. Sin ítems, 0. */
export function totalMinutes(items: Array<{ minutes: number }>): number {
  return items.reduce((sum, item) => sum + item.minutes, 0);
}

/**
 * Lo que dura una sesión, para decirlo en texto («75 min»): lo que suman sus ítems y, si aún no
 * tiene ninguno, su franja (de `startsAt` a `endsAt`, en minutos enteros). Una sesión recién
 * creada dura lo que se programó, no 0 min. Los instantes son ISO con zona, y nunca sale un
 * negativo.
 */
export function sessionMinutes(
  items: Array<{ minutes: number }>,
  startsAt: string,
  endsAt: string,
): number {
  if (items.length > 0) return totalMinutes(items);

  return Math.max(0, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000));
}

/**
 * Si lo montado encaja con la franja de la sesión: «Te sobran 10 min» si dura menos, «Te pasas
 * 10 min» si dura más, y `null` si coincide o aún no hay nada montado. Solo avisa: la sesión se
 * puede guardar igual.
 */
export function fitNotice(total: number, slotMinutes: number): string | null {
  if (total <= 0 || total === slotMinutes) return null;

  const gap = Math.abs(slotMinutes - total);
  if (total > slotMinutes) return `Te pasas ${gap} min`;
  return gap === 1 ? "Te sobra 1 min" : `Te sobran ${gap} min`;
}

/**
 * Una copia de `items` con el elemento de `from` llevado a la posición `to`; los demás se
 * corren para hacerle sitio. Con índices iguales o que no existen no hay movimiento. No muta
 * la entrada.
 */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const moved = [...items];
  const valid = (index: number) => Number.isInteger(index) && index >= 0 && index < items.length;

  if (!valid(from) || !valid(to) || from === to) return moved;

  const [item] = moved.splice(from, 1);
  moved.splice(to, 0, item);
  return moved;
}

/**
 * Una copia de `items` con los minutos del ítem de `index` cambiados cinco arriba o abajo.
 *
 * El paso se alinea a múltiplos de 5: de 12, subir da 15 y bajar da 10, no 17 ni 7. Así un
 * valor escrito a mano vuelve a la rejilla con el primer toque. Siempre dentro de 1 a 120
 * (los `check` de la base). Con un `index` que no existe no cambia nada. No muta la entrada.
 */
export function changeMinutes<T extends { minutes: number }>(
  items: T[],
  index: number,
  delta: 5 | -5,
): T[] {
  const changed = [...items];
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return changed;

  const { minutes } = items[index];
  const next =
    delta > 0
      ? Math.min(MAX_MINUTES, Math.floor(minutes / MINUTES_STEP) * MINUTES_STEP + MINUTES_STEP)
      : Math.max(MIN_MINUTES, Math.ceil(minutes / MINUTES_STEP) * MINUTES_STEP - MINUTES_STEP);

  changed[index] = { ...items[index], minutes: next };
  return changed;
}

/**
 * Los ítems en bloques de fase consecutiva, para pintar un encabezado por bloque. Una misma
 * fase separada por otra abre un bloque nuevo (no se reordena para agrupar), y los ítems sin
 * fase (`null`) seguidos forman un bloque sin encabezado. `startIndex` es la posición del
 * primer ítem del bloque en la lista completa: numeración y movimientos siguen siendo globales.
 */
export function phaseBlocks<T extends { phase: string | null; minutes: number }>(
  items: T[],
): PhaseBlock<T>[] {
  const blocks: PhaseBlock<T>[] = [];

  items.forEach((item, index) => {
    const last = blocks.at(-1);

    if (last && last.phase === item.phase) {
      last.items.push(item);
      last.minutes += item.minutes;
    } else {
      blocks.push({ phase: item.phase, startIndex: index, items: [item], minutes: item.minutes });
    }
  });

  return blocks;
}
