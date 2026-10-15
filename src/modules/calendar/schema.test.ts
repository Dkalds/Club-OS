import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { fromZodError } from "@/lib/action-result";
import {
  createTeamScheduleSchema,
  createVenueSchema,
  DURATION_MAX,
  DURATION_MIN,
  renameVenueSchema,
  scheduleIdSchema,
  updateTeamScheduleSchema,
  VENUE_NAME_MAX,
  venueIdSchema,
} from "./schema";

// Lo que valida la entrada de las acciones del calendario, con los mensajes que ve la persona
// (`fieldErrors`). Los límites son los CHECK de `20270316000100_calendar.sql`: lo que pasa por
// aquí no llega a la base de datos como un error sin campo al que señalar. Datos neutros y
// ficticios (pnpm check:guards).

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = uuid(1);
const TEAM = uuid(2);
const VENUE = uuid(3);

const NAME_MISSING = "Escribe un nombre.";
const NAME_TOO_LONG = "Máximo 60 caracteres.";
const WEEKDAY_INVALID = "Elige un día de la semana.";
const TIME_INVALID = "Escribe una hora válida.";
const DURATION_RANGE = "La duración tiene que estar entre 15 y 240 minutos.";
const NOT_FOUND = "No encontramos este contenido.";

/** Los errores de campo de una entrada; `null` si es válida. */
function errorsOf(schema: z.ZodType, input: unknown): Record<string, string> | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return null;
  const result = fromZodError(parsed.error);
  return result.ok ? null : (result.fieldErrors ?? {});
}

/** La misma entrada sin una de sus claves: lo que mandaría un cliente que la olvida. */
function without(input: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([name]) => name !== key));
}

const SLOT = { weekday: 2, time: "18:00", durationMinutes: 75, venueId: VENUE };
const CREATE = { teamId: TEAM, ...SLOT };
const UPDATE = { id: ID, ...SLOT };

/** Los dos esquemas que llevan un horario: el alta y el cambio comparten sus cuatro campos. */
const SLOT_SCHEMAS: Array<[string, z.ZodType, Record<string, unknown>]> = [
  ["createTeamSchedule", createTeamScheduleSchema, CREATE],
  ["updateTeamSchedule", updateTeamScheduleSchema, UPDATE],
];

describe("los límites son los de la base de datos", () => {
  it("nombres de pista de 60 y duraciones de 15 a 240 minutos", () => {
    expect({ VENUE_NAME_MAX, DURATION_MIN, DURATION_MAX }).toEqual({
      VENUE_NAME_MAX: 60,
      DURATION_MIN: 15,
      DURATION_MAX: 240,
    });
  });
});

// ── Pistas ──────────────────────────────────────────────────────────────────────────────

/** Los dos esquemas que llevan el nombre de una pista. */
const NAME_SCHEMAS: Array<[string, z.ZodType, Record<string, unknown>]> = [
  ["createVenue", createVenueSchema, { name: "Pista 1" }],
  ["renameVenue", renameVenueSchema, { id: ID, name: "Pista 1" }],
];

describe("el nombre de una pista", () => {
  it.each(NAME_SCHEMAS)("%s: la entrada de partida es válida", (_case, schema, valid) => {
    expect(errorsOf(schema, valid)).toBeNull();
  });

  it.each(NAME_SCHEMAS)("%s: vacío pide un nombre", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, name: "" })).toEqual({ name: NAME_MISSING });
  });

  it.each(NAME_SCHEMAS)("%s: solo espacios es como vacío", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, name: "   " })).toEqual({ name: NAME_MISSING });
    expect(errorsOf(schema, { ...valid, name: "\t\n" })).toEqual({ name: NAME_MISSING });
  });

  it.each(NAME_SCHEMAS)("%s: 60 caracteres caben; 61, no", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, name: "a".repeat(60) })).toBeNull();
    expect(errorsOf(schema, { ...valid, name: "a".repeat(61) })).toEqual({ name: NAME_TOO_LONG });
  });

  it.each(NAME_SCHEMAS)("%s: los espacios de los lados no cuentan para el máximo", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, name: `  ${"a".repeat(60)}  ` })).toBeNull();
  });

  it.each(NAME_SCHEMAS)("%s: llega a la acción sin los espacios de los lados", (_case, schema, valid) => {
    expect(schema.parse({ ...valid, name: "  Pista 1  " })).toMatchObject({ name: "Pista 1" });
  });

  it.each(NAME_SCHEMAS)("%s: sin nombre, o con algo que no es texto, pide un nombre", (_case, schema, valid) => {
    expect(errorsOf(schema, without(valid, "name"))).toEqual({ name: NAME_MISSING });
    expect(errorsOf(schema, { ...valid, name: null })).toEqual({ name: NAME_MISSING });
    expect(errorsOf(schema, { ...valid, name: 7 })).toEqual({ name: NAME_MISSING });
  });

  it("createVenue no deja pasar nada más que el nombre", () => {
    expect(createVenueSchema.parse({ name: "Pista 1", organization_id: "otro-club", id: ID })).toEqual({
      name: "Pista 1",
    });
  });
});

// ── Ids ─────────────────────────────────────────────────────────────────────────────────

/** Cada id de la entrada: en qué esquema está, con qué entrada válida y en qué campo. */
const IDS: Array<[string, z.ZodType, Record<string, unknown>, string]> = [
  ["renameVenue · id", renameVenueSchema, { id: ID, name: "Pista 1" }, "id"],
  ["venueId · id", venueIdSchema, { id: ID }, "id"],
  ["createTeamSchedule · teamId", createTeamScheduleSchema, CREATE, "teamId"],
  ["updateTeamSchedule · id", updateTeamScheduleSchema, UPDATE, "id"],
  ["scheduleId · id", scheduleIdSchema, { id: ID }, "id"],
];

describe("los ids", () => {
  it.each(IDS)("%s: un uuid vale", (_case, schema, valid) => {
    expect(errorsOf(schema, valid)).toBeNull();
  });

  // Un id sin forma de uuid daría un `22P02` en la base: se queda aquí, como «no existe».
  it.each(IDS)("%s: lo que no tiene forma de uuid no llega a la base", (_case, schema, valid, field) => {
    for (const bad of ["no-es-un-id", "", "pista-1", "00000000-0000-4000-8000-00000000000", `${ID} `]) {
      expect(errorsOf(schema, { ...valid, [field]: bad }), JSON.stringify(bad)).toEqual({ [field]: NOT_FOUND });
    }
  });

  it.each(IDS)("%s: sin id, o con algo que no es texto, tampoco", (_case, schema, valid, field) => {
    expect(errorsOf(schema, without(valid, field))).toEqual({ [field]: NOT_FOUND });
    expect(errorsOf(schema, { ...valid, [field]: null })).toEqual({ [field]: NOT_FOUND });
    expect(errorsOf(schema, { ...valid, [field]: 7 })).toEqual({ [field]: NOT_FOUND });
  });
});

// ── Horarios semanales ──────────────────────────────────────────────────────────────────

describe("el día de la semana", () => {
  it.each(SLOT_SCHEMAS)("%s: del 1 (lunes) al 7 (domingo) valen", (_case, schema, valid) => {
    for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
      expect(errorsOf(schema, { ...valid, weekday }), String(weekday)).toBeNull();
    }
  });

  it.each(SLOT_SCHEMAS)("%s: el 0 y el 8 no son ningún día", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, weekday: 0 })).toEqual({ weekday: WEEKDAY_INVALID });
    expect(errorsOf(schema, { ...valid, weekday: 8 })).toEqual({ weekday: WEEKDAY_INVALID });
    expect(errorsOf(schema, { ...valid, weekday: -1 })).toEqual({ weekday: WEEKDAY_INVALID });
  });

  it.each(SLOT_SCHEMAS)("%s: un decimal no es un día", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, weekday: 2.5 })).toEqual({ weekday: WEEKDAY_INVALID });
  });

  it.each(SLOT_SCHEMAS)("%s: NaN, infinito, un texto o nada piden elegir un día", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, weekday: Number.NaN })).toEqual({ weekday: WEEKDAY_INVALID });
    expect(errorsOf(schema, { ...valid, weekday: Number.POSITIVE_INFINITY })).toEqual({ weekday: WEEKDAY_INVALID });
    expect(errorsOf(schema, { ...valid, weekday: "2" })).toEqual({ weekday: WEEKDAY_INVALID });
    expect(errorsOf(schema, { ...valid, weekday: null })).toEqual({ weekday: WEEKDAY_INVALID });
    expect(errorsOf(schema, without(valid, "weekday"))).toEqual({ weekday: WEEKDAY_INVALID });
  });
});

describe("la hora", () => {
  it.each(SLOT_SCHEMAS)("%s: de 00:00 a 23:59, como la entrega un campo de hora", (_case, schema, valid) => {
    for (const time of ["00:00", "09:05", "18:00", "19:59", "20:00", "23:59"]) {
      expect(errorsOf(schema, { ...valid, time }), time).toBeNull();
    }
  });

  it.each(SLOT_SCHEMAS)("%s: una hora que no existe en el reloj no vale", (_case, schema, valid) => {
    for (const time of ["24:00", "18:60", "25:30", "99:99"]) {
      expect(errorsOf(schema, { ...valid, time }), time).toEqual({ time: TIME_INVALID });
    }
  });

  it.each(SLOT_SCHEMAS)("%s: solo `HH:mm`: ni una cifra en la hora, ni segundos, ni otra cosa", (_case, schema, valid) => {
    for (const time of ["9:00", "18:00:00", "18:0", "1800", "18.00", " 18:00", "18:00 ", "", "tarde"]) {
      expect(errorsOf(schema, { ...valid, time }), JSON.stringify(time)).toEqual({ time: TIME_INVALID });
    }
  });

  it.each(SLOT_SCHEMAS)("%s: sin hora, o con algo que no es texto, pide una hora", (_case, schema, valid) => {
    expect(errorsOf(schema, without(valid, "time"))).toEqual({ time: TIME_INVALID });
    expect(errorsOf(schema, { ...valid, time: null })).toEqual({ time: TIME_INVALID });
    expect(errorsOf(schema, { ...valid, time: 1800 })).toEqual({ time: TIME_INVALID });
  });
});

describe("la duración", () => {
  it.each(SLOT_SCHEMAS)("%s: 15 y 240 minutos caben", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, durationMinutes: 15 })).toBeNull();
    expect(errorsOf(schema, { ...valid, durationMinutes: 240 })).toBeNull();
  });

  it.each(SLOT_SCHEMAS)("%s: 14 y 241, no", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, durationMinutes: 14 })).toEqual({ durationMinutes: DURATION_RANGE });
    expect(errorsOf(schema, { ...valid, durationMinutes: 241 })).toEqual({ durationMinutes: DURATION_RANGE });
    expect(errorsOf(schema, { ...valid, durationMinutes: 0 })).toEqual({ durationMinutes: DURATION_RANGE });
    expect(errorsOf(schema, { ...valid, durationMinutes: -75 })).toEqual({ durationMinutes: DURATION_RANGE });
  });

  // El campo vacío viaja como NaN (`ScheduleSection`): se queda aquí, con su mensaje.
  it.each(SLOT_SCHEMAS)("%s: NaN, un decimal, un texto o nada dicen el rango", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, durationMinutes: Number.NaN })).toEqual({ durationMinutes: DURATION_RANGE });
    expect(errorsOf(schema, { ...valid, durationMinutes: 60.5 })).toEqual({ durationMinutes: DURATION_RANGE });
    expect(errorsOf(schema, { ...valid, durationMinutes: "75" })).toEqual({ durationMinutes: DURATION_RANGE });
    expect(errorsOf(schema, { ...valid, durationMinutes: null })).toEqual({ durationMinutes: DURATION_RANGE });
    expect(errorsOf(schema, without(valid, "durationMinutes"))).toEqual({ durationMinutes: DURATION_RANGE });
  });
});

describe("la pista de un horario", () => {
  it.each(SLOT_SCHEMAS)("%s: sin pista es `null`, y vale", (_case, schema, valid) => {
    expect(errorsOf(schema, { ...valid, venueId: null })).toBeNull();
    expect(schema.parse({ ...valid, venueId: null })).toMatchObject({ venueId: null });
  });

  it.each(SLOT_SCHEMAS)("%s: con pista, su uuid", (_case, schema, valid) => {
    expect(schema.parse(valid)).toMatchObject({ venueId: VENUE });
  });

  it.each(SLOT_SCHEMAS)("%s: lo que no tiene forma de uuid no llega a la base", (_case, schema, valid) => {
    for (const bad of ["no-es-un-id", "", "Pista 1"]) {
      expect(errorsOf(schema, { ...valid, venueId: bad }), JSON.stringify(bad)).toEqual({ venueId: NOT_FOUND });
    }
  });

  // «Sin pista» se dice con `null`: la clave no puede faltar.
  it.each(SLOT_SCHEMAS)("%s: la clave ausente no es «sin pista»", (_case, schema, valid) => {
    expect(errorsOf(schema, without(valid, "venueId"))).toEqual({ venueId: NOT_FOUND });
  });
});

describe("varios campos mal", () => {
  it.each(SLOT_SCHEMAS)("%s: cada uno con su mensaje", (_case, schema, valid) => {
    expect(
      errorsOf(schema, { ...valid, weekday: 0, time: "24:00", durationMinutes: 241, venueId: "no-es-un-id" }),
    ).toEqual({
      weekday: WEEKDAY_INVALID,
      time: TIME_INVALID,
      durationMinutes: DURATION_RANGE,
      venueId: NOT_FOUND,
    });
  });

  it("renameVenue: el id y el nombre, cada uno con el suyo", () => {
    expect(errorsOf(renameVenueSchema, { id: "no-es-un-id", name: " " })).toEqual({ id: NOT_FOUND, name: NAME_MISSING });
  });

  it("una entrada que no es un objeto es inválida, sin campo al que señalar", () => {
    for (const schema of [createVenueSchema, venueIdSchema, createTeamScheduleSchema, scheduleIdSchema]) {
      expect(errorsOf(schema, null)).toEqual({});
      expect(errorsOf(schema, "Pista 1")).toEqual({});
    }
  });
});

describe("lo que llega a la acción", () => {
  it("el alta de un horario entrega sus cinco datos, y nada más", () => {
    expect(createTeamScheduleSchema.parse({ ...CREATE, organization_id: "otro-club", id: ID })).toEqual(CREATE);
  });

  it("el cambio de un horario no deja pasar el equipo: un horario no cambia de equipo", () => {
    expect(updateTeamScheduleSchema.parse({ ...UPDATE, teamId: TEAM })).toEqual(UPDATE);
  });

  it("borrar una pista o quitar un horario solo llevan el id", () => {
    expect(venueIdSchema.parse({ id: ID, name: "Pista 1" })).toEqual({ id: ID });
    expect(scheduleIdSchema.parse({ id: ID, teamId: TEAM })).toEqual({ id: ID });
  });
});
