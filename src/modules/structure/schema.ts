import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import type { StaffRole } from "./types";

// Entrada de las acciones de la estructura del club. Los límites son los `check` de
// `20261005000200_people_structure.sql` y `20270302000100_club_structure.sql`: con ellos, un
// nombre vacío, una fecha al revés o un dorsal imposible se quedan aquí, con su mensaje, y no
// llegan a la base como un `23514` sin campo al que señalar. Los esquemas viven aparte porque
// un módulo `'use server'` solo puede exportar funciones asíncronas.

export const NAME_MAX = 60;
export const POSITION_MAX = 30;
export const JERSEY_MAX = 99;
export const AGE_MAX = 99;
export const SORT_MAX = 9999;
export const BIRTH_YEAR_MIN = 1900;

const NAME_MISSING = "Escribe un nombre.";
const LAST_NAME_MISSING = "Escribe los apellidos.";
const DATE_MISSING = "Elige una fecha.";
const DATES_ORDER = "El fin tiene que ser posterior al inicio.";
const AGE_RANGE = `La edad tiene que estar entre 1 y ${AGE_MAX}.`;
const SORT_RANGE = `El orden tiene que estar entre 0 y ${SORT_MAX}.`;
const JERSEY_RANGE = `El dorsal tiene que estar entre 0 y ${JERSEY_MAX}.`;
const BIRTH_YEAR_RANGE = "Escribe un año de nacimiento válido.";

function tooLong(max: number): string {
  return `Máximo ${max} caracteres.`;
}

/** Texto obligatorio: recortado, ni vacío ni null, de `max` caracteres como mucho. */
function required(missing: string, max: number) {
  return z.string({ error: missing }).trim().min(1, missing).max(max, tooLong(max));
}

// Un id que no tenga forma de uuid no llega a la base de datos (daría un `22P02`).
const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);

/** Un día de calendario que existe: `2027-02-30` no pasa. */
const day = z
  .string({ error: DATE_MISSING })
  .regex(/^\d{4}-\d{2}-\d{2}$/, DATE_MISSING)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, DATE_MISSING);

const staffRole = z.enum(["head_coach", "assistant"]) satisfies z.ZodType<StaffRole>;

/** `jersey_number smallint check (between 0 and 99)`; sin dorsal es `null`. */
const jerseyNumber = z
  .number({ error: JERSEY_RANGE })
  .int(JERSEY_RANGE)
  .min(0, JERSEY_RANGE)
  .max(JERSEY_MAX, JERSEY_RANGE)
  .nullable();

/** Posición: recortada; vacía o null se guarda como null. */
const position = z
  .string()
  .trim()
  .max(POSITION_MAX, tooLong(POSITION_MAX))
  .nullable()
  .transform((text) => (text === "" ? null : text));

/** Solo el año, nunca la fecha completa. Opcional; no puede ser un año que aún no ha llegado. */
const birthYear = z
  .number({ error: BIRTH_YEAR_RANGE })
  .int(BIRTH_YEAR_RANGE)
  .min(BIRTH_YEAR_MIN, BIRTH_YEAR_RANGE)
  .refine((year) => year <= new Date().getFullYear(), BIRTH_YEAR_RANGE)
  .nullable();

const personFields = {
  firstName: required(NAME_MISSING, NAME_MAX),
  lastName: required(LAST_NAME_MISSING, NAME_MAX),
  birthYear,
};

// ── Temporadas ──────────────────────────────────────────────────────────────────────────

const seasonFields = {
  name: required(NAME_MISSING, NAME_MAX),
  startsOn: day,
  endsOn: day,
};

/** El fin, después del inicio: `seasons_dates_check`. Las dos son `YYYY-MM-DD`: se comparan como texto. */
function datesInOrder(value: { startsOn: string; endsOn: string }): boolean {
  return value.endsOn > value.startsOn;
}

const DATES_ISSUE = { path: ["endsOn"], message: DATES_ORDER };

export const createSeasonSchema = z
  .object({ ...seasonFields, copyTeamsFrom: id.nullable() })
  .refine(datesInOrder, DATES_ISSUE);
export type CreateSeasonInput = z.input<typeof createSeasonSchema>;

export const updateSeasonSchema = z.object({ id, ...seasonFields }).refine(datesInOrder, DATES_ISSUE);
export type UpdateSeasonInput = z.input<typeof updateSeasonSchema>;

export const seasonIdSchema = z.object({ id });
export type SeasonIdInput = z.input<typeof seasonIdSchema>;

// ── Categorías ──────────────────────────────────────────────────────────────────────────

const categoryFields = {
  name: required(NAME_MISSING, NAME_MAX),
  // `age_band ~ '^U[0-9]{1,2}$'`: aquí viaja la edad, y la acción la escribe como `U12`.
  age: z.number({ error: AGE_RANGE }).int(AGE_RANGE).min(1, AGE_RANGE).max(AGE_MAX, AGE_RANGE),
  sort: z.number({ error: SORT_RANGE }).int(SORT_RANGE).min(0, SORT_RANGE).max(SORT_MAX, SORT_RANGE),
};

export const createCategorySchema = z.object(categoryFields);
export type CreateCategoryInput = z.input<typeof createCategorySchema>;

export const updateCategorySchema = z.object({ id, ...categoryFields });
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;

export const categoryIdSchema = z.object({ id });
export type CategoryIdInput = z.input<typeof categoryIdSchema>;

// ── Equipos ─────────────────────────────────────────────────────────────────────────────

const teamFields = { name: required(NAME_MISSING, NAME_MAX), categoryId: id };

export const createTeamSchema = z.object({ seasonId: id, ...teamFields });
export type CreateTeamInput = z.input<typeof createTeamSchema>;

export const updateTeamSchema = z.object({ id, ...teamFields });
export type UpdateTeamInput = z.input<typeof updateTeamSchema>;

export const teamIdSchema = z.object({ id });
export type TeamIdInput = z.input<typeof teamIdSchema>;

// ── Cuerpo técnico y plantilla ──────────────────────────────────────────────────────────

/** Una persona en un equipo: la clave de su fila en el cuerpo técnico o en la plantilla. */
const seat = { teamId: id, personId: id };

export const staffSchema = z.object({ ...seat, role: staffRole });
export type StaffInput = z.input<typeof staffSchema>;

export const seatSchema = z.object(seat);
export type SeatInput = z.input<typeof seatSchema>;

export const playerSchema = z.object({ ...seat, jerseyNumber, position });
export type PlayerInput = z.input<typeof playerSchema>;

export const newPlayerSchema = z.object({ teamId: id, ...personFields, jerseyNumber, position });
export type NewPlayerInput = z.input<typeof newPlayerSchema>;

// ── Personas ────────────────────────────────────────────────────────────────────────────

export const createPersonSchema = z.object(personFields);
export type CreatePersonInput = z.input<typeof createPersonSchema>;

export const updatePersonSchema = z.object({ id, ...personFields });
export type UpdatePersonInput = z.input<typeof updatePersonSchema>;

export const setPersonArchivedSchema = z.object({ id, archived: z.boolean() });
export type SetPersonArchivedInput = z.input<typeof setPersonArchivedSchema>;
