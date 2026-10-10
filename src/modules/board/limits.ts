// Los límites de una pizarra. La base solo acota su tamaño (32 kB); estos los aplica
// `parseBoard` al leer, y los aplicará el editor al dibujar.

/** Fichas en una pizarra: dos equipos de cinco, un balón y conos de sobra. */
export const MAX_TOKENS = 24;
/** Pasos de una secuencia. */
export const MAX_STEPS = 12;
/** Movimientos a la vez en un paso. */
export const MAX_MOVES = 12;
/** Caracteres de la nota de un paso. */
export const NOTE_MAX = 140;
/** Caracteres de la etiqueta de un jugador. */
export const LABEL_MAX = 2;
/** Los dos ejes de la pista van de 0 a este valor. */
export const COURT_MAX = 100;
/** A qué distancia, en unidades de pista, el balón está «pegado» a un jugador y le acompaña si bota. */
export const BALL_REACH = 6;
