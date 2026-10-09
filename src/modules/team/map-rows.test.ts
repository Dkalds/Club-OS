import { describe, expect, it } from "vitest";
import { toStaffTeamSummaries, toTeamDetail, toTeamSummaries } from "./map-rows";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const teamRow = (n: number, name: string, category: string, sort: number) => ({
  id: uuid(n),
  name,
  categories: [{ name: category, sort }],
  seasons: { name: "2026/27", is_current: true },
});

describe("toTeamSummaries", () => {
  it("ordena por la categoría (su orden) y después por nombre", () => {
    const rows = [
      teamRow(1, "Mayores B", "Mayores", 20),
      teamRow(2, "Pequeños B", "Pequeños", 10),
      teamRow(3, "Mayores A", "Mayores", 20),
      teamRow(4, "Pequeños A", "Pequeños", 10),
    ];

    expect(toTeamSummaries(rows).map((team) => team.name)).toEqual([
      "Pequeños A",
      "Pequeños B",
      "Mayores A",
      "Mayores B",
    ]);
  });

  it("lleva categoría y temporada; sin ellas, texto vacío", () => {
    expect(
      toTeamSummaries([
        teamRow(1, "Equipo", "Categoría", 10),
        { id: uuid(2), name: "Sin datos", categories: null, seasons: null },
      ]),
    ).toEqual([
      { id: uuid(1), name: "Equipo", categoryName: "Categoría", seasonName: "2026/27" },
      { id: uuid(2), name: "Sin datos", categoryName: "", seasonName: "" },
    ]);
  });
});

describe("toStaffTeamSummaries", () => {
  it("toma el equipo de cada fila del cuerpo técnico y descarta las filas sin equipo", () => {
    const rows = [
      { teams: teamRow(2, "B", "Cat", 10) },
      { teams: null },
      { teams: [teamRow(1, "A", "Cat", 10)] },
    ];

    expect(toStaffTeamSummaries(rows).map((team) => team.id)).toEqual([uuid(1), uuid(2)]);
  });
});

describe("toTeamDetail", () => {
  const person = (n: number, first: string, last: string) => ({
    id: uuid(n),
    first_name: first,
    last_name: last,
  });

  it("plantilla por dorsal (sin dorsal al final, por apellido) y cuerpo técnico con el principal primero", () => {
    const detail = toTeamDetail({
      ...teamRow(1, "Equipo", "Categoría", 10),
      team_staff: [
        { staff_role: "assistant", people: person(20, "Ana", "Zamora") },
        { staff_role: "head_coach", people: [person(21, "Bea", "Arco")] },
      ],
      team_players: [
        { jersey_number: 12, position: "Pívot", people: person(30, "Ciro", "Luna") },
        { jersey_number: null, position: null, people: person(31, "Dani", "Sol") },
        { jersey_number: 4, position: "Base", people: person(32, "Eloy", "Mar") },
        { jersey_number: null, position: "Alero", people: person(33, "Fran", "Alba") },
      ],
    });

    expect(detail.players.map((p) => [p.jerseyNumber, p.lastName])).toEqual([
      [4, "Mar"],
      [12, "Luna"],
      [null, "Alba"],
      [null, "Sol"],
    ]);
    expect(detail.players[0]).toEqual({
      personId: uuid(32),
      firstName: "Eloy",
      lastName: "Mar",
      jerseyNumber: 4,
      position: "Base",
    });
    expect(detail.staff.map((s) => [s.role, s.firstName])).toEqual([
      ["head_coach", "Bea"],
      ["assistant", "Ana"],
    ]);
  });

  it("una persona que RLS no deja ver no sale en la plantilla", () => {
    const detail = toTeamDetail({
      ...teamRow(1, "Equipo", "Categoría", 10),
      team_staff: [],
      team_players: [{ jersey_number: 5, position: null, people: null }],
    });

    expect(detail.players).toEqual([]);
  });
});
