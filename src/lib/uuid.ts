/**
 * La forma de un uuid escrito con guiones, sin mirar versión ni variante. Lo que llega de la
 * URL y no la tiene no puede ser un id: ni se consulta (`getDrill`, `getSectionForAdmin`).
 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
