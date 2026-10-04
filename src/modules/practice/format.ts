import { formatStandardNumber } from "@/modules/methodology/format";
import type { PracticeStatus } from "./types";

/** Entre campos de los metadatos: espacio, U+00B7, espacio (el mismo que el resto de la app). */
const FIELD_SEPARATOR = " · ";

/** La duración como se lee en listas y fichas: «75 min». */
export function minutesLabel(n: number): string {
  return `${n} min`;
}

/** La duración de un ítem en el constructor, donde cada fila va justa de ancho: «15'». */
export function builderMinutes(n: number): string {
  return `${n}'`;
}

/** Cuántos ejercicios tiene una sesión; sin ninguno lo dice en vez de pintar «0 ejercicios». */
export function itemsLabel(count: number): string {
  if (count === 0) return "Sin ejercicios todavía";
  if (count === 1) return "1 ejercicio";
  return `${count} ejercicios`;
}

/** «75 min · 5 ejercicios · Pabellón 2»; sin lugar (o en blanco), sin el último campo. */
export function practiceMeta({
  totalMinutes,
  itemCount,
  location,
}: {
  totalMinutes: number;
  itemCount: number;
  location: string | null;
}): string {
  const fields = [minutesLabel(totalMinutes), itemsLabel(itemCount)];
  const place = location?.trim();
  if (place) fields.push(place);
  return fields.join(FIELD_SEPARATOR);
}

/**
 * El número de un ítem como se pinta, «01»: el mismo formato que los Standards, y se cuenta
 * desde 1 aunque el índice empiece en 0.
 */
export function itemNumber(index: number): string {
  return formatStandardNumber(index + 1);
}

/** La etiqueta de un estado que no es lo normal; un entrenamiento programado no lleva ninguna. */
export function statusLabel(status: PracticeStatus): string | null {
  if (status === "done") return "Hecho";
  if (status === "cancelled") return "Cancelada";
  return null;
}
