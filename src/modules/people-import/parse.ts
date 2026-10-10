import type { ParseResult, ParsedRow } from "./types";

// El analizador de CSV de `/admin/people` (Fase 7 Task 11). Función pura: texto a filas
// tipadas, sin tocar la base. Columnas fijas, con cabecera, decididas con el propietario
// (memoria, 2026-10-10): `nombre,apellidos,año_nacimiento`. No asigna a ningún equipo.

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

const TOO_FEW_OR_MANY = "Se esperaban 3 columnas: nombre, apellidos y año de nacimiento.";
const NAME_MISSING = "Escribe el nombre.";
const LAST_NAME_MISSING = "Escribe los apellidos.";
const YEAR_INVALID = `El año de nacimiento debe estar entre ${MIN_YEAR} y ${MAX_YEAR}.`;

/** Una línea de CSV a sus campos, respetando comillas: comas y `""` dentro de un campo. */
function splitLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  fields.push(field);

  return fields;
}

function parseRow(row: number, raw: string[]): ParsedRow {
  if (raw.length !== 3) return { row, valid: false, error: TOO_FEW_OR_MANY, raw };

  const firstName = raw[0]!.trim();
  const lastName = raw[1]!.trim();
  const birthYearText = raw[2]!.trim();

  if (firstName === "") return { row, valid: false, error: NAME_MISSING, raw };
  if (lastName === "") return { row, valid: false, error: LAST_NAME_MISSING, raw };

  if (birthYearText === "") return { row, valid: true, firstName, lastName, birthYear: null };

  const birthYear = Number(birthYearText);
  if (!Number.isInteger(birthYear) || birthYear < MIN_YEAR || birthYear > MAX_YEAR) {
    return { row, valid: false, error: YEAR_INVALID, raw };
  }

  return { row, valid: true, firstName, lastName, birthYear };
}

/** Lee el fichero entero: cada fila de datos (sin la cabecera), válida o no, en su orden. */
export function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r\n|\r|\n/).slice(1);

  const rows: ParsedRow[] = [];
  let row = 0;
  for (const line of lines) {
    if (line.trim() === "") continue;
    row += 1;
    rows.push(parseRow(row, splitLine(line)));
  }

  return { rows };
}
