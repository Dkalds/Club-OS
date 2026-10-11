import { describe, expect, it } from "vitest";
import { jerseysToFree, renamesFor } from "./structure-room";

const SEED_A = "aaaaaaaa-0000-4000-8000-000000000001";
const SEED_B = "aaaaaaaa-0000-4000-8000-000000000002";
const HAND = "bbbbbbbb-1111-4000-8000-000000000003";

describe("renamesFor", () => {
  it("sin choques no renombra nada", () => {
    const seed = [{ id: SEED_A, name: "Alevín A", scope: "club|2026" }];
    const existing = [
      { id: SEED_A, name: "Alevín A", scope: "club|2026" },
      { id: HAND, name: "Cadete A", scope: "club|2026" },
    ];

    expect(renamesFor(existing, seed)).toEqual([]);
  });

  it("una fila creada a mano que lleva el nombre de una del seed gana una marca con su id", () => {
    const seed = [{ id: SEED_A, name: "Alevín A", scope: "club|2026" }];
    // La del seed se renombró en Gestión y otra ocupó su nombre.
    const existing = [
      { id: SEED_A, name: "Alevín Negro", scope: "club|2026" },
      { id: HAND, name: "Alevín A", scope: "club|2026" },
    ];

    expect(renamesFor(existing, seed)).toEqual([{ id: HAND, name: "Alevín A (bbbbbbbb)" }]);
  });

  it("compara como los índices únicos: sin mayúsculas ni espacios alrededor", () => {
    const seed = [{ id: SEED_A, name: "Alevín A", scope: "club" }];
    const existing = [{ id: HAND, name: "  ALEVÍN A ", scope: "club" }];

    expect(renamesFor(existing, seed)).toEqual([{ id: HAND, name: "ALEVÍN A (bbbbbbbb)" }]);
  });

  it("el mismo nombre en otro ámbito (otro club, otra temporada) no choca", () => {
    const seed = [{ id: SEED_A, name: "Alevín A", scope: "club|2026" }];
    const existing = [{ id: HAND, name: "Alevín A", scope: "club|2027" }];

    expect(renamesFor(existing, seed)).toEqual([]);
  });

  it("dos filas del seed con los nombres cruzados se apartan las dos: cada una recupera el suyo al sembrar", () => {
    const seed = [
      { id: SEED_A, name: "Alevín A", scope: "club" },
      { id: SEED_B, name: "Benjamín A", scope: "club" },
    ];
    const existing = [
      { id: SEED_A, name: "Benjamín A", scope: "club" },
      { id: SEED_B, name: "Alevín A", scope: "club" },
    ];

    expect(renamesFor(existing, seed).map((row) => row.id)).toEqual([SEED_A, SEED_B]);
  });

  it("el nombre con su marca no pasa del tope de 60 caracteres", () => {
    const seed = [{ id: SEED_A, name: "x".repeat(60), scope: "club" }];
    const existing = [{ id: HAND, name: "X".repeat(60), scope: "club" }];

    const [rename] = renamesFor(existing, seed);

    expect(rename?.name).toHaveLength(60);
    expect(rename?.name.endsWith(" (bbbbbbbb)")).toBe(true);
  });
});

describe("jerseysToFree", () => {
  const TEAM = "cccccccc-0000-4000-8000-000000000001";
  const OTHER_TEAM = "cccccccc-0000-4000-8000-000000000002";

  it("sin choques no suelta ningún dorsal", () => {
    const seed = [{ team_id: TEAM, person_id: SEED_A, jersey_number: 4 }];
    const existing = [
      { team_id: TEAM, person_id: SEED_A, jersey_number: 4 },
      { team_id: TEAM, person_id: HAND, jersey_number: 9 },
      { team_id: OTHER_TEAM, person_id: HAND, jersey_number: 4 },
    ];

    expect(jerseysToFree(existing, seed)).toEqual([]);
  });

  it("quien lleva el dorsal que va a llevar otra persona del seed en ese equipo lo suelta", () => {
    const seed = [{ team_id: TEAM, person_id: SEED_A, jersey_number: 4 }];
    const existing = [
      { team_id: TEAM, person_id: SEED_A, jersey_number: 14 },
      { team_id: TEAM, person_id: HAND, jersey_number: 4 },
    ];

    expect(jerseysToFree(existing, seed)).toEqual([{ team_id: TEAM, person_id: HAND }]);
  });

  it("dos del seed con los dorsales cruzados los sueltan los dos", () => {
    const seed = [
      { team_id: TEAM, person_id: SEED_A, jersey_number: 4 },
      { team_id: TEAM, person_id: SEED_B, jersey_number: 5 },
    ];
    const existing = [
      { team_id: TEAM, person_id: SEED_A, jersey_number: 5 },
      { team_id: TEAM, person_id: SEED_B, jersey_number: 4 },
    ];

    expect(jerseysToFree(existing, seed)).toHaveLength(2);
  });

  it("sin dorsal no hay nada que soltar ni que reservar", () => {
    const seed = [{ team_id: TEAM, person_id: SEED_A, jersey_number: null }];
    const existing = [{ team_id: TEAM, person_id: HAND, jersey_number: null }];

    expect(jerseysToFree(existing, seed)).toEqual([]);
  });
});
