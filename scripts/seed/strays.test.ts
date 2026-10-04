import { describe, expect, it } from "vitest";
import type { Tables } from "@/lib/database.types";
import { renumberStandards, restackSections } from "./strays";

const CLUB_A = "00000000-0000-4000-8000-00000000000a";
const CLUB_B = "00000000-0000-4000-8000-00000000000b";

let nextId = 0;
const uuid = () => `00000000-0000-4000-8000-${String((nextId += 1)).padStart(12, "0")}`;

function section(organizationId: string, number: number, title: string): Tables<"way_sections"> {
  return {
    id: uuid(),
    organization_id: organizationId,
    number,
    slug: title.toLowerCase(),
    title,
    summary: null,
    body_md: "",
    content_kind: "text",
    sort: number,
    status: "draft",
    created_at: "2026-10-01T10:00:00+00:00",
    updated_at: "2026-10-01T10:00:00+00:00",
    updated_by: null,
  };
}

function standard(organizationId: string, number: number, title: string): Tables<"standards"> {
  return {
    id: uuid(),
    organization_id: organizationId,
    number,
    title,
    description: "Texto.",
    sort: number,
    status: "draft",
    created_at: "2026-10-01T10:00:00+00:00",
  };
}

/** Las filas del seed de un club: tantas como `count`, numeradas desde 1. */
const seedOf = (organizationId: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({ organization_id: organizationId, number: index + 1 }));

describe("restackSections", () => {
  it("coloca las secciones creadas a mano detrás de las del seed de su club, en el orden en que llegan", () => {
    const seed = [...seedOf(CLUB_A, 5), ...seedOf(CLUB_B, 2)];
    // Dirección subió «segunda» al primer puesto: llega antes que «primera».
    const strays = [section(CLUB_A, 1, "segunda"), section(CLUB_B, 3, "de-b"), section(CLUB_A, 7, "primera")];

    const placed = restackSections(seed, strays);

    expect(placed.map((row) => [row.title, row.number, row.sort])).toEqual([
      ["segunda", 6, 6],
      ["de-b", 3, 3],
      ["primera", 7, 7],
    ]);
  });

  it("no cambia nada más de la fila", () => {
    const stray = section(CLUB_A, 2, "a-mano");

    const [placed] = restackSections(seedOf(CLUB_A, 5), [stray]);

    expect(placed).toEqual({ ...stray, number: 6, sort: 6 });
  });

  it("sin secciones a mano no hay nada que recolocar", () => {
    expect(restackSections(seedOf(CLUB_A, 5), [])).toEqual([]);
  });

  it("si entre las del seed y las creadas a mano pasan de 99, se niega y dice en qué club", () => {
    const strays = Array.from({ length: 95 }, (_, index) => section(CLUB_A, index + 1, `s${index}`));

    expect(() => restackSections(seedOf(CLUB_A, 5), strays)).toThrow(
      `Seed: el club ${CLUB_A} tendría 100 secciones y el máximo es 99.`,
    );
  });
});

describe("renumberStandards", () => {
  it("un Standard creado a mano con un número del seed pasa al primer número libre", () => {
    const stray = standard(CLUB_A, 3, "A mano");

    const { rows, moved } = renumberStandards(seedOf(CLUB_A, 5), [stray]);

    expect(rows).toEqual([{ ...stray, number: 6 }]);
    expect(moved).toEqual([{ organization_id: CLUB_A, title: "A mano", from: 3, to: 6 }]);
  });

  it("el que no choca con el seed conserva su número y no se reescribe", () => {
    const { rows, moved } = renumberStandards(seedOf(CLUB_A, 5), [standard(CLUB_A, 20, "Lejos")]);

    expect(rows).toEqual([]);
    expect(moved).toEqual([]);
  });

  it("el número libre tampoco es el de otro Standard creado a mano, ni el que ya se dio a otro", () => {
    const strays = [
      standard(CLUB_A, 1, "Choca uno"),
      standard(CLUB_A, 6, "Ocupa el seis"),
      standard(CLUB_A, 2, "Choca dos"),
    ];

    const { moved } = renumberStandards(seedOf(CLUB_A, 5), strays);

    expect(moved.map((move) => [move.title, move.from, move.to])).toEqual([
      ["Choca uno", 1, 7],
      ["Choca dos", 2, 8],
    ]);
  });

  it("cada club con sus números: el seed de un club no mueve los Standards de otro", () => {
    const { rows, moved } = renumberStandards(
      [...seedOf(CLUB_A, 5), ...seedOf(CLUB_B, 2)],
      [standard(CLUB_B, 4, "Libre en B"), standard(CLUB_B, 2, "Choca en B")],
    );

    expect(rows.map((row) => [row.title, row.number])).toEqual([["Choca en B", 3]]);
    expect(moved).toEqual([{ organization_id: CLUB_B, title: "Choca en B", from: 2, to: 3 }]);
  });

  it("si no queda ningún número libre hasta el 99, se niega y dice en qué club", () => {
    // El seed ocupa del 1 al 5 y dirección creó el resto, del 6 al 99, y además uno con el 3
    // no puede existir (el número es único): se simula con el seed ocupando hasta el 99.
    const stray = standard(CLUB_A, 3, "Sin sitio");

    expect(() => renumberStandards(seedOf(CLUB_A, 99), [stray])).toThrow(
      `Seed: el club ${CLUB_A} no tiene ningún número de Standard libre para «Sin sitio».`,
    );
  });
});
