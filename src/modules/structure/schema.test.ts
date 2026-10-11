import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import { fromZodError } from "@/lib/action-result";
import {
  AGE_MAX,
  BIRTH_YEAR_MIN,
  categoryIdSchema,
  createCategorySchema,
  createPersonSchema,
  createSeasonSchema,
  createTeamSchema,
  JERSEY_MAX,
  NAME_MAX,
  newPlayerSchema,
  playerSchema,
  POSITION_MAX,
  seasonIdSchema,
  seatSchema,
  setPersonArchivedSchema,
  SORT_MAX,
  staffSchema,
  teamIdSchema,
  updateCategorySchema,
  updatePersonSchema,
  updateSeasonSchema,
  updateTeamSchema,
} from "./schema";

// Lo que valida la entrada de las acciones de la estructura del club, con los mensajes que ve la
// persona (`fieldErrors`). Los límites son los CHECK de `20261005000200_people_structure.sql` y
// `20270302000100_club_structure.sql`: lo que pasa por aquí no llega a la base de datos como un
// error sin campo al que señalar. Datos neutros y ficticios (pnpm check:guards); de las
// personas, solo el año de nacimiento.

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = uuid(1);
const SEASON = uuid(2);
const CATEGORY = uuid(3);
const TEAM = uuid(4);
const PERSON = uuid(5);

/** El año en que corren estos tests: el reloj está parado (ver `beforeEach`). */
const THIS_YEAR = 2026;

const NAME_MISSING = "Escribe un nombre.";
const LAST_NAME_MISSING = "Escribe los apellidos.";
const NAME_TOO_LONG = "Máximo 60 caracteres.";
const POSITION_TOO_LONG = "Máximo 30 caracteres.";
const DATE_MISSING = "Elige una fecha.";
const DATES_ORDER = "El fin tiene que ser posterior al inicio.";
const AGE_RANGE = "La edad tiene que estar entre 1 y 99.";
const SORT_RANGE = "El orden tiene que estar entre 0 y 9999.";
const JERSEY_RANGE = "El dorsal tiene que estar entre 0 y 99.";
const BIRTH_YEAR_RANGE = "Escribe un año de nacimiento válido.";
const NOT_FOUND = "No encontramos este contenido.";

/** Los errores de campo de una entrada; `null` si es válida. */
function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return null;
  const result = fromZodError(parsed.error);
  return result.ok ? null : (result.fieldErrors ?? {});
}

/** Lo que el esquema entrega a la acción; falla si la entrada no es válida. */
function parsed<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  return schema.parse(input);
}

const SEASON_INPUT = { name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30" };
const CATEGORY_INPUT = { name: "Categoría A", age: 12, sort: 10 };
const TEAM_INPUT = { name: "Equipo A", categoryId: CATEGORY };
const PERSON_INPUT = { firstName: "Ana", lastName: "García López", birthYear: 2014 };
const SEAT = { teamId: TEAM, personId: PERSON };
const PLAYER_INPUT = { ...SEAT, jerseyNumber: 7, position: "Base" };
const NEW_PLAYER_INPUT = { teamId: TEAM, ...PERSON_INPUT, jerseyNumber: 7, position: "Base" };

beforeEach(() => {
  // Solo el reloj: el año de nacimiento se compara con el año en curso.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${THIS_YEAR}-10-11T12:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("los límites son los de la base de datos", () => {
  it("nombres de 60, posición de 30, dorsal y edad hasta 99, orden hasta 9999, año desde 1900", () => {
    expect({ NAME_MAX, POSITION_MAX, JERSEY_MAX, AGE_MAX, SORT_MAX, BIRTH_YEAR_MIN }).toEqual({
      NAME_MAX: 60,
      POSITION_MAX: 30,
      JERSEY_MAX: 99,
      AGE_MAX: 99,
      SORT_MAX: 9999,
      BIRTH_YEAR_MIN: 1900,
    });
  });
});

// ── Lo que se repite en varios esquemas ─────────────────────────────────────────────────

/** Cada nombre obligatorio: en qué esquema está, con qué entrada válida y qué dice si falta. */
const NAMES: Array<[string, z.ZodType, Record<string, unknown>, string, string]> = [
  ["createSeason · name", createSeasonSchema, { ...SEASON_INPUT, copyTeamsFrom: null }, "name", NAME_MISSING],
  ["updateSeason · name", updateSeasonSchema, { id: ID, ...SEASON_INPUT }, "name", NAME_MISSING],
  ["createCategory · name", createCategorySchema, CATEGORY_INPUT, "name", NAME_MISSING],
  ["updateCategory · name", updateCategorySchema, { id: ID, ...CATEGORY_INPUT }, "name", NAME_MISSING],
  ["createTeam · name", createTeamSchema, { seasonId: SEASON, ...TEAM_INPUT }, "name", NAME_MISSING],
  ["updateTeam · name", updateTeamSchema, { id: ID, ...TEAM_INPUT }, "name", NAME_MISSING],
  ["createPerson · firstName", createPersonSchema, PERSON_INPUT, "firstName", NAME_MISSING],
  ["createPerson · lastName", createPersonSchema, PERSON_INPUT, "lastName", LAST_NAME_MISSING],
  ["updatePerson · firstName", updatePersonSchema, { id: ID, ...PERSON_INPUT }, "firstName", NAME_MISSING],
  ["updatePerson · lastName", updatePersonSchema, { id: ID, ...PERSON_INPUT }, "lastName", LAST_NAME_MISSING],
  ["newPlayer · firstName", newPlayerSchema, NEW_PLAYER_INPUT, "firstName", NAME_MISSING],
  ["newPlayer · lastName", newPlayerSchema, NEW_PLAYER_INPUT, "lastName", LAST_NAME_MISSING],
];

describe("los nombres", () => {
  it.each(NAMES)("%s: la entrada de partida es válida", (_case, schema, valid) => {
    expect(errorsOf(schema, valid)).toBeNull();
  });

  it.each(NAMES)("%s: vacío pide escribirlo", (_case, schema, valid, field, missing) => {
    expect(errorsOf(schema, { ...valid, [field]: "" })).toEqual({ [field]: missing });
  });

  it.each(NAMES)("%s: solo espacios es vacío", (_case, schema, valid, field, missing) => {
    expect(errorsOf(schema, { ...valid, [field]: "   \t " })).toEqual({ [field]: missing });
  });

  it.each(NAMES)("%s: null, un número o que falte piden escribirlo", (_case, schema, valid, field, missing) => {
    expect(errorsOf(schema, { ...valid, [field]: null })).toEqual({ [field]: missing });
    expect(errorsOf(schema, { ...valid, [field]: 7 })).toEqual({ [field]: missing });
    const without = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== field));
    expect(errorsOf(schema, without)).toEqual({ [field]: missing });
  });

  it.each(NAMES)("%s: 60 caracteres caben y 61 no", (_case, schema, valid, field) => {
    expect(errorsOf(schema, { ...valid, [field]: "a".repeat(60) })).toBeNull();
    expect(errorsOf(schema, { ...valid, [field]: "a".repeat(61) })).toEqual({ [field]: NAME_TOO_LONG });
  });

  it.each(NAMES)("%s: se recorta, y el tope cuenta lo recortado", (_case, schema, valid, field) => {
    const output = parsed(schema, { ...valid, [field]: `  ${"a".repeat(60)}  ` }) as Record<string, unknown>;

    expect(output[field]).toBe("a".repeat(60));
  });
});

/** Cada id: en qué esquema está y con qué entrada válida. */
const IDS: Array<[string, z.ZodType, Record<string, unknown>, string]> = [
  ["updateSeason · id", updateSeasonSchema, { id: ID, ...SEASON_INPUT }, "id"],
  ["seasonId · id", seasonIdSchema, { id: ID }, "id"],
  ["createSeason · copyTeamsFrom", createSeasonSchema, { ...SEASON_INPUT, copyTeamsFrom: SEASON }, "copyTeamsFrom"],
  ["updateCategory · id", updateCategorySchema, { id: ID, ...CATEGORY_INPUT }, "id"],
  ["categoryId · id", categoryIdSchema, { id: ID }, "id"],
  ["createTeam · seasonId", createTeamSchema, { seasonId: SEASON, ...TEAM_INPUT }, "seasonId"],
  ["createTeam · categoryId", createTeamSchema, { seasonId: SEASON, ...TEAM_INPUT }, "categoryId"],
  ["updateTeam · id", updateTeamSchema, { id: ID, ...TEAM_INPUT }, "id"],
  ["updateTeam · categoryId", updateTeamSchema, { id: ID, ...TEAM_INPUT }, "categoryId"],
  ["teamId · id", teamIdSchema, { id: ID }, "id"],
  ["staff · teamId", staffSchema, { ...SEAT, role: "assistant" }, "teamId"],
  ["staff · personId", staffSchema, { ...SEAT, role: "assistant" }, "personId"],
  ["seat · teamId", seatSchema, SEAT, "teamId"],
  ["seat · personId", seatSchema, SEAT, "personId"],
  ["player · teamId", playerSchema, PLAYER_INPUT, "teamId"],
  ["player · personId", playerSchema, PLAYER_INPUT, "personId"],
  ["newPlayer · teamId", newPlayerSchema, NEW_PLAYER_INPUT, "teamId"],
  ["updatePerson · id", updatePersonSchema, { id: ID, ...PERSON_INPUT }, "id"],
  ["setPersonArchived · id", setPersonArchivedSchema, { id: ID, archived: true }, "id"],
];

describe("los ids", () => {
  it.each(IDS)("%s: un uuid pasa", (_case, schema, valid) => {
    expect(errorsOf(schema, valid)).toBeNull();
  });

  it.each(IDS)("%s: lo que no tiene forma de uuid no llega a la base: «No encontramos este contenido.»", (_case, schema, valid, field) => {
    for (const bad of ["no-es-un-id", "", "1", `${ID}0`, `${ID} `, "00000000000040008000000000000001", 7, undefined]) {
      expect(errorsOf(schema, { ...valid, [field]: bad })).toEqual({ [field]: NOT_FOUND });
    }
  });

  it("un uuid en mayúsculas también es un uuid", () => {
    expect(errorsOf(seasonIdSchema, { id: "9B2F6C1E-3A4D-4E5F-8A6B-7C8D9E0F1A2B" })).toBeNull();
  });

  it.each(
    IDS.filter(([name]) => name !== "createSeason · copyTeamsFrom"),
  )("%s: null no es un id", (_case, schema, valid, field) => {
    expect(errorsOf(schema, { ...valid, [field]: null })).toEqual({ [field]: NOT_FOUND });
  });
});

// ── Temporadas ──────────────────────────────────────────────────────────────────────────

const SEASON_SCHEMAS: Array<[string, z.ZodType, Record<string, unknown>]> = [
  ["createSeason", createSeasonSchema, { ...SEASON_INPUT, copyTeamsFrom: null }],
  ["updateSeason", updateSeasonSchema, { id: ID, ...SEASON_INPUT }],
];

describe("las fechas de una temporada", () => {
  it.each(SEASON_SCHEMAS)("%s: un día que no existe (2027-02-30) pide elegir fecha", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, endsOn: "2027-02-30" })).toEqual({ endsOn: DATE_MISSING });
    expect(errorsOf(schema, { ...valid, startsOn: "2026-02-30" })).toEqual({ startsOn: DATE_MISSING });
  });

  it.each(SEASON_SCHEMAS)("%s: el 29 de febrero existe solo en año bisiesto", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, startsOn: "2028-02-29", endsOn: "2028-06-30" })).toBeNull();
    expect(errorsOf(schema, { ...valid, endsOn: "2027-02-29" })).toEqual({ endsOn: DATE_MISSING });
  });

  it.each(SEASON_SCHEMAS)("%s: ni el mes 13, ni el día 0, ni el 31 de un mes de 30", (_n, schema, valid) => {
    for (const bad of ["2027-13-01", "2027-00-10", "2027-06-00", "2027-06-31", "2027-04-31"]) {
      expect(errorsOf(schema, { ...valid, endsOn: bad })).toEqual({ endsOn: DATE_MISSING });
    }
  });

  it.each(SEASON_SCHEMAS)("%s: lo que no es `YYYY-MM-DD` pide elegir fecha", (_n, schema, valid) => {
    for (const bad of ["", "30/06/2027", "2027-6-30", "2027-06-30T00:00:00Z", " 2027-06-30", "mañana", null, 20270630, undefined]) {
      expect(errorsOf(schema, { ...valid, endsOn: bad })).toEqual({ endsOn: DATE_MISSING });
    }
    for (const bad of ["", "01/09/2026", "2026-9-1", null, undefined]) {
      expect(errorsOf(schema, { ...valid, startsOn: bad })).toEqual({ startsOn: DATE_MISSING });
    }
  });

  it.each(SEASON_SCHEMAS)("%s: sin ninguna de las dos fechas, cada una pide la suya", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, startsOn: "", endsOn: "" })).toEqual({
      startsOn: DATE_MISSING,
      endsOn: DATE_MISSING,
    });
  });

  it.each(SEASON_SCHEMAS)("%s: el fin el mismo día que el inicio: el error va en el fin", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, startsOn: "2026-09-01", endsOn: "2026-09-01" })).toEqual({
      endsOn: DATES_ORDER,
    });
  });

  it.each(SEASON_SCHEMAS)("%s: el fin antes que el inicio: el error va en el fin", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, startsOn: "2027-06-30", endsOn: "2026-09-01" })).toEqual({
      endsOn: DATES_ORDER,
    });
    expect(errorsOf(schema, { ...valid, startsOn: "2026-09-02", endsOn: "2026-09-01" })).toEqual({
      endsOn: DATES_ORDER,
    });
  });

  it.each(SEASON_SCHEMAS)("%s: el fin un día después del inicio ya vale", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, startsOn: "2026-12-31", endsOn: "2027-01-01" })).toBeNull();
  });

  it.each(SEASON_SCHEMAS)("%s: el orden de las fechas se dice a la vez que un nombre vacío", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, name: "", startsOn: "2027-06-30", endsOn: "2026-09-01" })).toEqual({
      name: NAME_MISSING,
      endsOn: DATES_ORDER,
    });
  });

  it.each(SEASON_SCHEMAS)("%s: un inicio que no existe y un fin anterior dan los dos errores", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, startsOn: "2027-02-30", endsOn: "2027-01-01" })).toEqual({
      startsOn: DATE_MISSING,
      endsOn: DATES_ORDER,
    });
  });
});

describe("createSeasonSchema", () => {
  it("entrega el nombre recortado, las fechas y de qué temporada copiar", () => {
    expect(parsed(createSeasonSchema, { ...SEASON_INPUT, name: "  2026/27 ", copyTeamsFrom: SEASON })).toEqual({
      ...SEASON_INPUT,
      copyTeamsFrom: SEASON,
    });
  });

  it("`copyTeamsFrom` null es no copiar nada", () => {
    expect(parsed(createSeasonSchema, { ...SEASON_INPUT, copyTeamsFrom: null })).toEqual({
      ...SEASON_INPUT,
      copyTeamsFrom: null,
    });
  });

  it("`copyTeamsFrom` no se puede dejar sin decir: o un id o null", () => {
    expect(errorsOf(createSeasonSchema, SEASON_INPUT)).toEqual({ copyTeamsFrom: NOT_FOUND });
  });
});

describe("updateSeasonSchema", () => {
  it("entrega el id, el nombre y las fechas, y nada más", () => {
    expect(parsed(updateSeasonSchema, { id: ID, ...SEASON_INPUT, isCurrent: true, organizationId: uuid(99) })).toEqual({
      id: ID,
      ...SEASON_INPUT,
    });
  });
});

// ── Categorías ──────────────────────────────────────────────────────────────────────────

const CATEGORY_SCHEMAS: Array<[string, z.ZodType, Record<string, unknown>]> = [
  ["createCategory", createCategorySchema, CATEGORY_INPUT],
  ["updateCategory", updateCategorySchema, { id: ID, ...CATEGORY_INPUT }],
];

describe("la edad de una categoría", () => {
  it.each(CATEGORY_SCHEMAS)("%s: de 1 a 99", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, age: 1 })).toBeNull();
    expect(errorsOf(schema, { ...valid, age: 99 })).toBeNull();
  });

  it.each(CATEGORY_SCHEMAS)("%s: 0, 100 y los negativos quedan fuera", (_n, schema, valid) => {
    for (const bad of [0, 100, -1]) {
      expect(errorsOf(schema, { ...valid, age: bad })).toEqual({ age: AGE_RANGE });
    }
  });

  it.each(CATEGORY_SCHEMAS)("%s: un decimal no es una edad", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, age: 12.5 })).toEqual({ age: AGE_RANGE });
  });

  it.each(CATEGORY_SCHEMAS)("%s: NaN (el campo vacío), null, un texto o infinito tampoco", (_n, schema, valid) => {
    for (const bad of [Number.NaN, null, "12", undefined, Number.POSITIVE_INFINITY]) {
      expect(errorsOf(schema, { ...valid, age: bad })).toEqual({ age: AGE_RANGE });
    }
  });
});

describe("el orden de una categoría", () => {
  it.each(CATEGORY_SCHEMAS)("%s: de 0 a 9999", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, sort: 0 })).toBeNull();
    expect(errorsOf(schema, { ...valid, sort: 9999 })).toBeNull();
  });

  it.each(CATEGORY_SCHEMAS)("%s: -1, 10000, un decimal y NaN quedan fuera", (_n, schema, valid) => {
    for (const bad of [-1, 10_000, 1.5, Number.NaN, null, "10", undefined]) {
      expect(errorsOf(schema, { ...valid, sort: bad })).toEqual({ sort: SORT_RANGE });
    }
  });

  it.each(CATEGORY_SCHEMAS)("%s: todo mal a la vez, cada campo con su mensaje", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, name: " ", age: Number.NaN, sort: Number.NaN })).toEqual({
      name: NAME_MISSING,
      age: AGE_RANGE,
      sort: SORT_RANGE,
    });
  });
});

describe("createCategorySchema y updateCategorySchema", () => {
  it("entregan la edad como número: la acción la escribe como `U12`", () => {
    expect(parsed(createCategorySchema, { name: " Categoría A ", age: 12, sort: 10 })).toEqual(CATEGORY_INPUT);
    expect(parsed(updateCategorySchema, { id: ID, ...CATEGORY_INPUT })).toEqual({ id: ID, ...CATEGORY_INPUT });
  });
});

// ── Equipos ─────────────────────────────────────────────────────────────────────────────

describe("createTeamSchema y updateTeamSchema", () => {
  it("el alta lleva la temporada; el cambio, el id del equipo y no la temporada", () => {
    expect(parsed(createTeamSchema, { seasonId: SEASON, name: " Equipo A ", categoryId: CATEGORY })).toEqual({
      seasonId: SEASON,
      ...TEAM_INPUT,
    });
    // La temporada de un equipo no se cambia: aunque llegue, no sale.
    expect(parsed(updateTeamSchema, { id: ID, ...TEAM_INPUT, seasonId: SEASON })).toEqual({ id: ID, ...TEAM_INPUT });
  });

  it("sin categoría elegida (vacía) no hay equipo", () => {
    expect(errorsOf(createTeamSchema, { seasonId: SEASON, name: "Equipo A", categoryId: "" })).toEqual({
      categoryId: NOT_FOUND,
    });
  });
});

// ── Cuerpo técnico ──────────────────────────────────────────────────────────────────────

describe("staffSchema", () => {
  it.each(["head_coach", "assistant"])("el papel «%s» vale", (role) => {
    expect(parsed(staffSchema, { ...SEAT, role })).toEqual({ ...SEAT, role });
  });

  it.each([["otro papel", "coach"], ["vacío", ""], ["null", null], ["que falte", undefined], ["en mayúsculas", "HEAD_COACH"]])(
    "el papel %s no vale, y el error va en `role`",
    (_case, role) => {
      expect(Object.keys(errorsOf(staffSchema, { ...SEAT, role }) ?? {})).toEqual(["role"]);
    },
  );

  it("sin persona elegida (id vacío) el error va en `personId`", () => {
    expect(errorsOf(staffSchema, { teamId: TEAM, personId: "", role: "assistant" })).toEqual({ personId: NOT_FOUND });
  });
});

describe("seatSchema", () => {
  it("es el equipo y la persona, y nada más", () => {
    expect(parsed(seatSchema, { ...SEAT, role: "assistant", jerseyNumber: 4 })).toEqual(SEAT);
  });
});

// ── Plantilla: dorsal y posición ────────────────────────────────────────────────────────

const SEAT_SCHEMAS: Array<[string, z.ZodType, Record<string, unknown>]> = [
  ["player", playerSchema, PLAYER_INPUT],
  ["newPlayer", newPlayerSchema, NEW_PLAYER_INPUT],
];

describe("el dorsal", () => {
  it.each(SEAT_SCHEMAS)("%s: de 0 a 99", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, jerseyNumber: 0 })).toBeNull();
    expect(errorsOf(schema, { ...valid, jerseyNumber: 99 })).toBeNull();
  });

  it.each(SEAT_SCHEMAS)("%s: null es «sin dorsal», y se entrega null", (_n, schema, valid) => {
    expect((parsed(schema, { ...valid, jerseyNumber: null }) as Record<string, unknown>).jerseyNumber).toBeNull();
  });

  it.each(SEAT_SCHEMAS)("%s: el 0 es un dorsal, no «sin dorsal»", (_n, schema, valid) => {
    expect((parsed(schema, { ...valid, jerseyNumber: 0 }) as Record<string, unknown>).jerseyNumber).toBe(0);
  });

  it.each(SEAT_SCHEMAS)("%s: -1 y 100 quedan fuera", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, jerseyNumber: -1 })).toEqual({ jerseyNumber: JERSEY_RANGE });
    expect(errorsOf(schema, { ...valid, jerseyNumber: 100 })).toEqual({ jerseyNumber: JERSEY_RANGE });
  });

  it.each(SEAT_SCHEMAS)("%s: un decimal, NaN, un texto o que falte, tampoco", (_n, schema, valid) => {
    for (const bad of [7.5, Number.NaN, "7", undefined, Number.NEGATIVE_INFINITY]) {
      expect(errorsOf(schema, { ...valid, jerseyNumber: bad })).toEqual({ jerseyNumber: JERSEY_RANGE });
    }
  });
});

describe("la posición", () => {
  const positionOf = (schema: z.ZodType, valid: Record<string, unknown>, position: unknown) =>
    (parsed(schema, { ...valid, position }) as Record<string, unknown>).position;

  it.each(SEAT_SCHEMAS)("%s: se recorta", (_n, schema, valid) => {
    expect(positionOf(schema, valid, "  Ala-pívot ")).toBe("Ala-pívot");
  });

  it.each(SEAT_SCHEMAS)("%s: en blanco (vacía o solo espacios) se guarda como null", (_n, schema, valid) => {
    expect(positionOf(schema, valid, "")).toBeNull();
    expect(positionOf(schema, valid, "    ")).toBeNull();
  });

  it.each(SEAT_SCHEMAS)("%s: null es null", (_n, schema, valid) => {
    expect(positionOf(schema, valid, null)).toBeNull();
  });

  it.each(SEAT_SCHEMAS)("%s: 30 caracteres caben y 31 no", (_n, schema, valid) => {
    expect(positionOf(schema, valid, "a".repeat(30))).toBe("a".repeat(30));
    expect(errorsOf(schema, { ...valid, position: "a".repeat(31) })).toEqual({ position: POSITION_TOO_LONG });
  });

  it.each(SEAT_SCHEMAS)("%s: el tope cuenta lo recortado", (_n, schema, valid) => {
    expect(positionOf(schema, valid, `  ${"a".repeat(30)}  `)).toBe("a".repeat(30));
  });
});

// ── Personas: el año de nacimiento ──────────────────────────────────────────────────────

const PERSON_SCHEMAS: Array<[string, z.ZodType, Record<string, unknown>]> = [
  ["createPerson", createPersonSchema, PERSON_INPUT],
  ["updatePerson", updatePersonSchema, { id: ID, ...PERSON_INPUT }],
  ["newPlayer", newPlayerSchema, NEW_PLAYER_INPUT],
];

describe("el año de nacimiento", () => {
  it.each(PERSON_SCHEMAS)("%s: desde 1900 hasta el año en curso", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, birthYear: 1900 })).toBeNull();
    expect(errorsOf(schema, { ...valid, birthYear: THIS_YEAR })).toBeNull();
  });

  it.each(PERSON_SCHEMAS)("%s: 1899 queda fuera", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, birthYear: 1899 })).toEqual({ birthYear: BIRTH_YEAR_RANGE });
  });

  it.each(PERSON_SCHEMAS)("%s: el año que viene aún no ha llegado", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, birthYear: THIS_YEAR + 1 })).toEqual({ birthYear: BIRTH_YEAR_RANGE });
  });

  it.each(PERSON_SCHEMAS)("%s: el tope es el año en curso de verdad: al cambiar de año, cambia", (_n, schema, valid) => {
    vi.setSystemTime(new Date(`${THIS_YEAR + 1}-01-02T12:00:00Z`));

    expect(errorsOf(schema, { ...valid, birthYear: THIS_YEAR + 1 })).toBeNull();
    expect(errorsOf(schema, { ...valid, birthYear: THIS_YEAR + 2 })).toEqual({ birthYear: BIRTH_YEAR_RANGE });
  });

  it.each(PERSON_SCHEMAS)("%s: null es «sin año», y se entrega null", (_n, schema, valid) => {
    expect((parsed(schema, { ...valid, birthYear: null }) as Record<string, unknown>).birthYear).toBeNull();
  });

  it.each(PERSON_SCHEMAS)("%s: un decimal no es un año", (_n, schema, valid) => {
    expect(errorsOf(schema, { ...valid, birthYear: 2014.5 })).toEqual({ birthYear: BIRTH_YEAR_RANGE });
  });

  it.each(PERSON_SCHEMAS)("%s: ni NaN, ni un texto, ni una fecha completa, ni que falte", (_n, schema, valid) => {
    for (const bad of [Number.NaN, "2014", "2014-05-06", undefined, 0, -2014]) {
      expect(errorsOf(schema, { ...valid, birthYear: bad })).toEqual({ birthYear: BIRTH_YEAR_RANGE });
    }
  });

  it.each(PERSON_SCHEMAS)("%s: de una persona solo sale el año, nunca una fecha de nacimiento", (_n, schema, valid) => {
    const output = parsed(schema, { ...valid, birthDate: "2014-05-06", birthday: "2014-05-06" }) as Record<string, unknown>;

    expect(output).not.toHaveProperty("birthDate");
    expect(output).not.toHaveProperty("birthday");
    expect(output.birthYear).toBe(2014);
  });
});

describe("createPersonSchema y updatePersonSchema", () => {
  it("entregan nombre y apellidos recortados y el año", () => {
    expect(parsed(createPersonSchema, { firstName: " Ana ", lastName: " García López ", birthYear: 2014 })).toEqual(
      PERSON_INPUT,
    );
    expect(parsed(updatePersonSchema, { id: ID, ...PERSON_INPUT })).toEqual({ id: ID, ...PERSON_INPUT });
  });

  it("todo mal a la vez, cada campo con su mensaje", () => {
    expect(errorsOf(createPersonSchema, { firstName: "", lastName: " ", birthYear: 1899 })).toEqual({
      firstName: NAME_MISSING,
      lastName: LAST_NAME_MISSING,
      birthYear: BIRTH_YEAR_RANGE,
    });
  });
});

describe("newPlayerSchema", () => {
  it("entrega el equipo, la persona, el dorsal y la posición", () => {
    expect(parsed(newPlayerSchema, NEW_PLAYER_INPUT)).toEqual(NEW_PLAYER_INPUT);
  });

  it("solo son obligatorios el nombre y los apellidos: lo demás puede ir sin valor", () => {
    expect(
      parsed(newPlayerSchema, {
        teamId: TEAM,
        firstName: "Ana",
        lastName: "García López",
        birthYear: null,
        jerseyNumber: null,
        position: "",
      }),
    ).toEqual({
      teamId: TEAM,
      firstName: "Ana",
      lastName: "García López",
      birthYear: null,
      jerseyNumber: null,
      position: null,
    });
  });

  it("todo mal a la vez, cada campo con su mensaje", () => {
    expect(
      errorsOf(newPlayerSchema, {
        teamId: "x",
        firstName: "",
        lastName: "",
        birthYear: THIS_YEAR + 1,
        jerseyNumber: 100,
        position: "a".repeat(31),
      }),
    ).toEqual({
      teamId: NOT_FOUND,
      firstName: NAME_MISSING,
      lastName: LAST_NAME_MISSING,
      birthYear: BIRTH_YEAR_RANGE,
      jerseyNumber: JERSEY_RANGE,
      position: POSITION_TOO_LONG,
    });
  });
});

describe("playerSchema", () => {
  it("entrega el asiento, el dorsal y la posición", () => {
    expect(parsed(playerSchema, PLAYER_INPUT)).toEqual(PLAYER_INPUT);
  });
});

describe("setPersonArchivedSchema", () => {
  it.each([true, false])("archived %s vale", (archived) => {
    expect(parsed(setPersonArchivedSchema, { id: ID, archived })).toEqual({ id: ID, archived });
  });

  it.each([["un texto", "true"], ["un número", 1], ["null", null], ["que falte", undefined]])(
    "archived %s no vale, y el error va en `archived`",
    (_case, archived) => {
      expect(Object.keys(errorsOf(setPersonArchivedSchema, { id: ID, archived }) ?? {})).toEqual(["archived"]);
    },
  );
});

describe("los esquemas de un solo id", () => {
  it.each([
    ["seasonIdSchema", seasonIdSchema],
    ["categoryIdSchema", categoryIdSchema],
    ["teamIdSchema", teamIdSchema],
  ])("%s: el id y nada más", (_name, schema) => {
    expect(parsed(schema, { id: ID, organizationId: uuid(99) })).toEqual({ id: ID });
    expect(errorsOf(schema, {})).toEqual({ id: NOT_FOUND });
  });

  it.each([
    ["seasonIdSchema", seasonIdSchema],
    ["categoryIdSchema", categoryIdSchema],
    ["teamIdSchema", teamIdSchema],
  ])("%s: lo que no es un objeto se rechaza sin campo al que señalar", (_name, schema) => {
    expect(errorsOf(schema, ID)).toEqual({});
    expect(errorsOf(schema, null)).toEqual({});
  });
});
