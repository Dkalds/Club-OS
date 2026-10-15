import { describe, expect, it } from "vitest";
import { parseCsv } from "./parse";

describe("parseCsv", () => {
  it("lee las tres columnas, con cabecera", () => {
    const csv = "nombre,apellidos,año_nacimiento\nAna,Pino,2014\nLuis,Ruiz,2013";

    expect(parseCsv(csv).rows).toEqual([
      { row: 1, valid: true, firstName: "Ana", lastName: "Pino", birthYear: 2014 },
      { row: 2, valid: true, firstName: "Luis", lastName: "Ruiz", birthYear: 2013 },
    ]);
  });

  it("un año de nacimiento vacío es una persona adulta: null, no un error", () => {
    const csv = "nombre,apellidos,año_nacimiento\nCoach,Ficticio,";

    expect(parseCsv(csv).rows).toEqual([
      { row: 1, valid: true, firstName: "Coach", lastName: "Ficticio", birthYear: null },
    ]);
  });

  it("recorta los espacios de cada campo", () => {
    const csv = "nombre,apellidos,año_nacimiento\n  Ana  ,  Pino  , 2014 ";

    expect(parseCsv(csv).rows).toEqual([
      { row: 1, valid: true, firstName: "Ana", lastName: "Pino", birthYear: 2014 },
    ]);
  });

  it("líneas en blanco entre filas se saltan, sin contar como fila", () => {
    const csv = "nombre,apellidos,año_nacimiento\nAna,Pino,2014\n\n   \nLuis,Ruiz,2013";

    expect(parseCsv(csv).rows.map((r) => r.row)).toEqual([1, 2]);
  });

  it("un campo entre comillas puede llevar una coma", () => {
    const csv = 'nombre,apellidos,año_nacimiento\nAna,"Pino, Ruiz",2014';

    expect(parseCsv(csv).rows).toEqual([
      { row: 1, valid: true, firstName: "Ana", lastName: "Pino, Ruiz", birthYear: 2014 },
    ]);
  });

  it("una comilla doble escapada dentro de un campo entre comillas", () => {
    const csv = 'nombre,apellidos,año_nacimiento\n"Ana ""La Base""",Pino,2014';

    expect(parseCsv(csv).rows).toEqual([
      { row: 1, valid: true, firstName: 'Ana "La Base"', lastName: "Pino", birthYear: 2014 },
    ]);
  });

  it("sin nombre: inválida, con su motivo y el texto tal cual llegó", () => {
    const csv = "nombre,apellidos,año_nacimiento\n,Pino,2014";

    expect(parseCsv(csv).rows).toEqual([
      { row: 1, valid: false, error: "Escribe el nombre.", raw: ["", "Pino", "2014"] },
    ]);
  });

  it("sin apellidos: inválida", () => {
    const csv = "nombre,apellidos,año_nacimiento\nAna,,2014";

    expect(parseCsv(csv).rows).toEqual([
      { row: 1, valid: false, error: "Escribe los apellidos.", raw: ["Ana", "", "2014"] },
    ]);
  });

  it("un año de nacimiento que no es un número: inválida", () => {
    const csv = "nombre,apellidos,año_nacimiento\nAna,Pino,dos mil catorce";

    expect(parseCsv(csv).rows).toEqual([
      {
        row: 1,
        valid: false,
        error: "El año de nacimiento debe estar entre 1900 y 2100.",
        raw: ["Ana", "Pino", "dos mil catorce"],
      },
    ]);
  });

  it.each([1899, 2101])("un año de nacimiento fuera de rango (%i): inválida", (year) => {
    const csv = `nombre,apellidos,año_nacimiento\nAna,Pino,${year}`;

    expect(parseCsv(csv).rows[0]).toMatchObject({
      valid: false,
      error: "El año de nacimiento debe estar entre 1900 y 2100.",
    });
  });

  it("una fila con menos de tres columnas: inválida", () => {
    const csv = "nombre,apellidos,año_nacimiento\nAna,Pino";

    expect(parseCsv(csv).rows).toEqual([
      {
        row: 1,
        valid: false,
        error: "Se esperaban 3 columnas: nombre, apellidos y año de nacimiento.",
        raw: ["Ana", "Pino"],
      },
    ]);
  });

  it("una fila con más de tres columnas: inválida", () => {
    const csv = "nombre,apellidos,año_nacimiento\nAna,Pino,2014,T1";

    expect(parseCsv(csv).rows[0]).toMatchObject({ valid: false });
  });

  it("filas válidas e inválidas mezcladas, cada una con su número", () => {
    const csv = "nombre,apellidos,año_nacimiento\nAna,Pino,2014\n,Ruiz,2013\nLuis,Gil,2012";

    expect(parseCsv(csv).rows.map((r) => ({ row: r.row, valid: r.valid }))).toEqual([
      { row: 1, valid: true },
      { row: 2, valid: false },
      { row: 3, valid: true },
    ]);
  });

  it("solo la cabecera, sin filas: una lista vacía", () => {
    expect(parseCsv("nombre,apellidos,año_nacimiento").rows).toEqual([]);
  });

  it("un fichero vacío: una lista vacía", () => {
    expect(parseCsv("").rows).toEqual([]);
  });
});
