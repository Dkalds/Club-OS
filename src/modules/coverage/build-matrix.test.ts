import { describe, expect, it } from "vitest";
import { buildCoverageMatrix } from "./build-matrix";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM_A = { id: uuid(1), name: "Alevín A" };
const TEAM_B = { id: uuid(2), name: "Benjamín A" };
const STANDARD_1 = { id: uuid(10), number: 1, title: "Protejo el balón" };
const STANDARD_2 = { id: uuid(11), number: 2, title: "Leo la defensa" };

describe("buildCoverageMatrix", () => {
  it("una fila por equipo, una columna por Standard, en su orden", () => {
    const matrix = buildCoverageMatrix([], [TEAM_A, TEAM_B], [STANDARD_1, STANDARD_2]);

    expect(matrix.standards).toEqual([STANDARD_1, STANDARD_2]);
    expect(matrix.rows.map((r) => r.team)).toEqual([TEAM_A, TEAM_B]);
  });

  it("sin ningún par cubierto: todo false", () => {
    const matrix = buildCoverageMatrix([], [TEAM_A], [STANDARD_1, STANDARD_2]);

    expect(matrix.rows[0]?.covered).toEqual([false, false]);
  });

  it("un par cubierto marca solo esa celda", () => {
    const matrix = buildCoverageMatrix(
      [{ teamId: TEAM_A.id, standardId: STANDARD_2.id }],
      [TEAM_A, TEAM_B],
      [STANDARD_1, STANDARD_2],
    );

    expect(matrix.rows[0]?.covered).toEqual([false, true]);
    expect(matrix.rows[1]?.covered).toEqual([false, false]);
  });

  it("un par de un equipo o un Standard que no está en las listas se ignora", () => {
    const matrix = buildCoverageMatrix(
      [{ teamId: "no-existe", standardId: STANDARD_1.id }],
      [TEAM_A],
      [STANDARD_1],
    );

    expect(matrix.rows[0]?.covered).toEqual([false]);
  });

  it("sin equipos: una lista de filas vacía", () => {
    expect(buildCoverageMatrix([], [], [STANDARD_1]).rows).toEqual([]);
  });

  it("sin Standards: cada fila con una lista de celdas vacía", () => {
    const matrix = buildCoverageMatrix([], [TEAM_A], []);

    expect(matrix.rows).toEqual([{ team: TEAM_A, covered: [] }]);
  });

  it("es determinista: el mismo par dos veces no cambia nada", () => {
    const pair = { teamId: TEAM_A.id, standardId: STANDARD_1.id };

    expect(buildCoverageMatrix([pair, pair], [TEAM_A], [STANDARD_1])).toEqual(
      buildCoverageMatrix([pair], [TEAM_A], [STANDARD_1]),
    );
  });
});
