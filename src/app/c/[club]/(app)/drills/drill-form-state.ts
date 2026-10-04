import type { DrillInput } from "@/modules/drills/schema";
import type { DrillDetail } from "@/modules/drills/types";

// El estado del formulario de un ejercicio y su paso a `DrillInput`, la entrada de las acciones
// `createDrill` y `updateDrill`. Son funciones puras, sin React: aquí viven las reglas de la
// ida y la vuelta (qué se conserva, qué se limpia, qué se deja al servidor), con su propio test.

/** Un coaching point en pantalla. `key` es de esta pantalla y no cambia mientras se edita. */
export type PointRow = { key: string; text: string; isKey: boolean };

/** Una variante en pantalla. `key`, como la de `PointRow`. */
export type VariantRow = { key: string; title: string; description: string };

/**
 * Lo que el formulario guarda de un ejercicio mientras se escribe. Los números son TEXTO: quien
 * los teclea puede dejar la caja vacía, y un `number` no puede decir «vacía» sin ser un 0 que
 * nadie escribió. Se convierten al enviar (`toDrillInput`).
 *
 * `maxAge` a `""` es «Sin máximo». `focusAreaIds`, `principleIds` y `standardIds` son los ids de
 * TODOS los vínculos del ejercicio, se vean o no como chip (ver `toggleId`).
 */
export type DrillFormState = {
  title: string;
  summary: string;
  objective: string;
  setupMd: string;
  minPlayers: string;
  maxPlayers: string;
  minMinutes: string;
  maxMinutes: string;
  minAge: string;
  maxAge: string;
  equipment: string;
  videoUrl: string;
  diagramMediaId: string | null;
  coachingPoints: PointRow[];
  variants: VariantRow[];
  focusAreaIds: string[];
  principleIds: string[];
  standardIds: string[];
};

/** Las edades que ofrecen los selectores: de U8 a U18, una a una (la base de datos admite de 8 a 18). */
export const AGE_CHOICES: readonly number[] = Array.from({ length: 11 }, (_, index) => 8 + index);

/**
 * Las claves de error de `drillInputSchema` que tienen un campo en el formulario donde
 * señalarse. Las demás (`drillId`, `expectedUpdatedAt`, `diagramMediaId`) no las puede provocar
 * quien rellena el formulario: si llegan, el aviso general es lo único que hay que enseñar.
 */
const FIELD_KEYS: ReadonlySet<string> = new Set([
  "title",
  "summary",
  "objective",
  "setupMd",
  "minPlayers",
  "maxPlayers",
  "minMinutes",
  "maxMinutes",
  "minAge",
  "maxAge",
  "equipment",
  "videoUrl",
  "coachingPoints",
  "variants",
  "focusAreaIds",
  "principleIds",
  "standardIds",
]);

/** ¿Algún error de campo de una respuesta `INVALID` tiene dónde señalarse en el formulario? */
export function hasFieldError(fieldErrors: Record<string, string>): boolean {
  return Object.keys(fieldErrors).some((key) => FIELD_KEYS.has(key));
}

/**
 * Añade `id` a la lista si no está y lo quita si está, sin tocar los demás. Es lo que hace un
 * chip, y por eso un id que está vinculado pero no tiene chip (un principio o un Standard que la
 * dirección ha pasado a borrador) sobrevive a cualquier cambio: guardar no lo desvincula.
 */
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((current) => current !== id) : [...ids, id];
}

/** ¿Tienen las dos listas los mismos ids, marcados en el orden que sea? Un chip es un conjunto. */
function sameIds(a: string[], b: string[]): boolean {
  return a.every((id) => b.includes(id)) && b.every((id) => a.includes(id));
}

/** ¿Tienen los mismos coaching points, en el mismo orden? Sin la `key`, que es de esta pantalla. */
function samePoints(a: PointRow[], b: PointRow[]): boolean {
  return a.length === b.length && a.every((row, i) => row.text === b[i].text && row.isKey === b[i].isKey);
}

/** ¿Tienen las mismas variantes, en el mismo orden? Sin la `key`, como los coaching points. */
function sameVariants(a: VariantRow[], b: VariantRow[]): boolean {
  return a.length === b.length && a.every((row, i) => row.title === b[i].title && row.description === b[i].description);
}

/**
 * ¿Difiere lo que hay en pantalla de la copia contra la que se mide (`baseline`)? Es lo que
 * decide si salir pierde algo: la copia es la que se abrió o, tras cada guardado, lo que se
 * mandó. Se compara el contenido, no que se haya tocado algo: escribir una letra y borrarla,
 * añadir una fila y quitarla, o desmarcar un chip y volver a marcarlo lo deja sin cambios.
 *
 * - Los ids de los chips son un conjunto (el orden en que se marcaron no importa).
 * - Los coaching points y las variantes cuentan por contenido y por orden; su `key` es de esta
 *   pantalla y no es contenido.
 */
export function hasUnsavedChanges(state: DrillFormState, baseline: DrillFormState): boolean {
  const { coachingPoints, variants, focusAreaIds, principleIds, standardIds, ...scalars } = state;

  return (
    (Object.keys(scalars) as Array<keyof typeof scalars>).some((name) => scalars[name] !== baseline[name]) ||
    !samePoints(coachingPoints, baseline.coachingPoints) ||
    !sameVariants(variants, baseline.variants) ||
    !sameIds(focusAreaIds, baseline.focusAreaIds) ||
    !sameIds(principleIds, baseline.principleIds) ||
    !sameIds(standardIds, baseline.standardIds)
  );
}

/**
 * El material como lo escribe quien lo teclea, una sola caja: separado por comas, cada elemento
 * recortado, sin vacíos y sin repetidos (el primero que aparece manda).
 */
export function parseEquipment(text: string): string[] {
  const items: string[] = [];

  for (const part of text.split(",")) {
    const item = part.trim();
    if (item !== "" && !items.includes(item)) items.push(item);
  }

  return items;
}

/**
 * El número que ha tecleado quien rellena el formulario. Una caja vacía o un texto que no es un
 * número no son un 0: son `NaN`, que el esquema de las acciones rechaza con el mensaje del
 * campo («Elige entre 1 y 40 jugadores.»). Los decimales pasan tal cual: el esquema exige un
 * entero y es quien dice si vale.
 */
export function parseNumber(text: string): number {
  if (text.trim() === "") return Number.NaN;

  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
}

/** Un texto opcional: recortado, y `null` si queda en blanco. */
function optional(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** El estado con el que empieza el formulario: el de un ejercicio vacío, o el de uno que existe. */
export function initialFormState(drill: DrillDetail | null): DrillFormState {
  if (drill === null) {
    return {
      title: "",
      summary: "",
      objective: "",
      setupMd: "",
      minPlayers: "",
      maxPlayers: "",
      minMinutes: "",
      maxMinutes: "",
      minAge: "",
      maxAge: "",
      equipment: "",
      videoUrl: "",
      diagramMediaId: null,
      coachingPoints: [],
      variants: [],
      focusAreaIds: [],
      principleIds: [],
      standardIds: [],
    };
  }

  return {
    title: drill.title,
    summary: drill.summary ?? "",
    objective: drill.objective ?? "",
    setupMd: drill.setupMd ?? "",
    minPlayers: String(drill.minPlayers),
    maxPlayers: String(drill.maxPlayers),
    minMinutes: String(drill.minMinutes),
    maxMinutes: String(drill.maxMinutes),
    minAge: String(drill.minAge),
    maxAge: drill.maxAge === null ? "" : String(drill.maxAge),
    equipment: drill.equipment.join(", "),
    videoUrl: drill.videoUrl ?? "",
    diagramMediaId: drill.diagramMediaId,
    coachingPoints: drill.coachingPoints.map((point, index) => ({
      key: `point-${index}`,
      text: point.text,
      isKey: point.isKey,
    })),
    variants: drill.variants.map((variant, index) => ({
      key: `variant-${index}`,
      title: variant.title,
      description: variant.description ?? "",
    })),
    // Los ids de todos los vínculos (`principleIds`, `standardIds`), no los de `principles` ni
    // `standards`, que son solo lo publicado: partir de lo que enseña la ficha desvincularía en
    // silencio, al guardar, lo que está en borrador.
    focusAreaIds: [...drill.focusAreaIds],
    principleIds: [...drill.principleIds],
    standardIds: [...drill.standardIds],
  };
}

/**
 * Lo que el formulario manda al guardar: el `DrillInput` de las acciones. `initial` es el
 * ejercicio que se abrió (o `null` en el alta).
 *
 * - Los textos se recortan y los que quedan en blanco son `null`. El servidor vuelve a hacerlo,
 *   pero lo que sale de aquí ya es lo que se guardará.
 * - Los números salen de `parseNumber`: una caja vacía es `NaN`, no un 0.
 * - `diagramMediaId` va SIEMPRE: `updateDrill` quita el diagrama si falta o es `null`, así que
 *   el formulario manda el del ejercicio, el recién subido o `null` si se ha quitado.
 * - Los ids vienen tal cual del estado: incluyen los vínculos sin chip (ver `toggleId`).
 * - El material se trocea por comas. Si la caja no se ha tocado, vuelve la lista que se guardó
 *   sin trocear: un elemento con una coma dentro («Balones (6, del cinco)»), que solo puede venir
 *   de escribir directamente en la base de datos, se partiría en dos al guardar sin que nadie
 *   hubiera tocado el material.
 */
export function toDrillInput(state: DrillFormState, initial: DrillDetail | null): DrillInput {
  const untouchedEquipment =
    initial !== null && state.equipment === initial.equipment.join(", ") ? [...initial.equipment] : null;

  return {
    title: state.title.trim(),
    summary: optional(state.summary),
    objective: optional(state.objective),
    setupMd: optional(state.setupMd),
    minPlayers: parseNumber(state.minPlayers),
    maxPlayers: parseNumber(state.maxPlayers),
    minMinutes: parseNumber(state.minMinutes),
    maxMinutes: parseNumber(state.maxMinutes),
    minAge: parseNumber(state.minAge),
    maxAge: state.maxAge === "" ? null : parseNumber(state.maxAge),
    equipment: untouchedEquipment ?? parseEquipment(state.equipment),
    videoUrl: optional(state.videoUrl),
    diagramMediaId: state.diagramMediaId,
    coachingPoints: state.coachingPoints.map((point) => ({ text: point.text.trim(), isKey: point.isKey })),
    variants: state.variants.map((variant) => ({
      title: variant.title.trim(),
      description: optional(variant.description),
    })),
    focusAreaIds: [...state.focusAreaIds],
    principleIds: [...state.principleIds],
    standardIds: [...state.standardIds],
  };
}
