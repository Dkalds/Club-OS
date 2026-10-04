// Los límites del constructor. Los que dicen `check` repiten los de la base de datos: si se
// cambian allí, se cambian aquí (la base manda; esto solo evita llegar a ella con un error).

/** Ítems por sesión: el tope que aplica la función de la base que guarda la sesión (más de 30 es `INVALID`). */
export const MAX_ITEMS = 30;
/**
 * Lo que se dice al pasar de `MAX_ITEMS`: el esquema de las acciones, la acción de añadir desde la
 * ficha y las pantallas (el constructor, el selector de ejercicios y la hoja de la ficha) dicen
 * esta misma frase. Vive aquí, y no en el esquema, porque este módulo no lleva Zod y lo importan
 * componentes de cliente.
 */
export const MAX_ITEMS_MESSAGE = `Una sesión tiene como máximo ${MAX_ITEMS} ejercicios.`;
/** `check` de la base: los minutos de un ítem van de 1 a 120. */
export const MIN_MINUTES = 1;
/** `check` de la base: los minutos de un ítem van de 1 a 120. */
export const MAX_MINUTES = 120;
/** Regla de diseño: los botones del constructor suben y bajan de cinco en cinco. */
export const MINUTES_STEP = 5;
/** Regla de diseño: los minutos con los que nace un ítem nuevo. */
export const DEFAULT_ITEM_MINUTES = 10;
/** `check` de la base: el título de un ítem o de la sesión, 80 caracteres como máximo. */
export const TITLE_MAX = 80;
/** `check` de la base: la fase de un ítem, 40 caracteres como máximo. */
export const PHASE_MAX = 40;
/** `check` de la base: el lugar del entrenamiento, 80 caracteres como máximo. */
export const LOCATION_MAX = 80;
/** `check` de la base: las notas de la sesión, 2000 caracteres como máximo. */
export const NOTES_MAX = 2000;
/** `check` de la base: las notas de un ítem, 500 caracteres como máximo. */
export const ITEM_NOTES_MAX = 500;
/** Regla de diseño: la sesión más corta que se puede programar, en minutos. */
export const MIN_SESSION_MINUTES = 15;
/** Regla de diseño: la sesión más larga que se puede programar, en minutos. */
export const MAX_SESSION_MINUTES = 240;
/** Regla de diseño: la duración con la que se propone un entrenamiento nuevo, en minutos. */
export const DEFAULT_SESSION_MINUTES = 75;
/** Regla de diseño: la hora (hh:mm, en la zona del club) con la que se propone un entrenamiento nuevo. */
export const DEFAULT_SESSION_TIME = "18:00";
