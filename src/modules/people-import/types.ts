/** Una fila válida: lista para escribirse tal cual en `people`. */
export type ValidRow = {
  row: number;
  firstName: string;
  lastName: string;
  birthYear: number | null;
};

/** Una fila con un error: por qué no se escribe, con el texto tal cual llegó. */
export type InvalidRow = {
  row: number;
  error: string;
  raw: string[];
};

export type ParsedRow = (ValidRow & { valid: true }) | (InvalidRow & { valid: false });

/** El resultado de leer el fichero entero: cada fila, válida o no, en su orden. */
export type ParseResult = {
  rows: ParsedRow[];
};
