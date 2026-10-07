import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import {
  ITEM_NOTES_MAX,
  LOCATION_MAX,
  MAX_ITEMS,
  MAX_ITEMS_MESSAGE,
  MAX_MINUTES,
  MAX_SESSION_MINUTES,
  MIN_MINUTES,
  MIN_SESSION_MINUTES,
  NOTES_MAX,
  PHASE_MAX,
  TITLE_MAX,
} from "./limits";
import type { PracticeItemDraft } from "./types";

// Entrada de las acciones de sesiones. Los límites son los de `limits.ts` (los `check` de
// `20261117000100_practice_integrity.sql` y las reglas de diseño del constructor): con ellos,
// un texto vacío, un null, un entero con decimales o un id que no es uuid se quedan aquí, con
// su mensaje y el campo al que señalar, y nunca llegan a la base de datos como un `22P02`, un
// `23502` o un `23514` sin campo. Los esquemas viven aparte porque un módulo `'use server'`
// solo puede exportar funciones asíncronas.

const TEAM_MISSING = "Elige un equipo.";
const TITLE_MISSING = "Escribe un título.";
const DATE_MISSING = "Elige una fecha.";
const TIME_MISSING = "Elige una hora.";
const DURATION_RANGE = `La duración tiene que estar entre ${MIN_SESSION_MINUTES} y ${MAX_SESSION_MINUTES} minutos.`;
const FOCUS_INVALID = "Elige un objetivo de la lista.";
const FOCUS_REPEATED = "El objetivo secundario tiene que ser distinto del principal.";
const MINUTES_RANGE = `Entre ${MIN_MINUTES} y ${MAX_MINUTES} minutos.`;
/** Un campo de texto que no es texto: solo lo manda un cliente manipulado, nunca el formulario. */
const FIELD_INVALID = "Revisa este campo.";

function tooLong(max: number): string {
  return `Máximo ${max} caracteres.`;
}

/** Texto obligatorio: recortado, ni vacío ni null, de `max` caracteres como mucho. */
function required(missing: string, max: number) {
  return z.string({ error: missing }).trim().min(1, missing).max(max, tooLong(max));
}

/** Texto opcional: recortado; vacío o null se guarda como null, nunca como texto vacío. */
function optional(max: number) {
  return z
    .string({ error: FIELD_INVALID })
    .trim()
    .max(max, tooLong(max))
    .nullable()
    .transform((text) => (text === "" ? null : text));
}

/**
 * Un entero dentro de su rango, venga como venga (`1.5`, `NaN`, un texto o un null): todo con
 * el mismo mensaje, que dice el rango.
 */
function integerBetween(min: number, max: number, message: string) {
  return z.number({ error: message }).int(message).min(min, message).max(max, message);
}

// Lo que llega de un formulario no es de fiar: un id que no tenga forma de uuid no llega a la
// base de datos (daría un `22P02`). Se acepta cualquier uuid escrito con guiones, sin mirar
// versión ni variante, como en la metodología.
const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);
const teamId = z.guid(TEAM_MISSING);

/**
 * Un objetivo: un uuid, o `null` o texto vacío cuando no se elige ninguno (el `<select>` manda
 * `""`). El mensaje va en el uuid y en la unión: con solo uno de los dos, Zod enseñaría el suyo
 * en inglés según qué pieza falle.
 */
const focusId = z
  .union([z.guid(FOCUS_INVALID), z.literal(""), z.null()], { error: FOCUS_INVALID })
  .transform((value) => (value === "" ? null : value));

/**
 * El `updated_at` que tenía la copia que se editaba, tal cual lo devolvió la base de datos
 * (microsegundos y desfase): ni se recorta ni se parsea, y no pasa nunca por `Date`.
 */
const expectedUpdatedAt = z.string().min(1);

// ── Cuándo ───────────────────────────────────────────────────────────────────────────────

// La fecha y la hora son los textos de `<input type="date">` y `<input type="time">`, en el
// reloj del club. Aquí solo se pide que vengan; que formen un instante que existe (30 de
// febrero no) lo dice `zonedDateTimeToIso` en la acción, que conoce la zona del club.
const date = z.string({ error: DATE_MISSING }).trim().min(1, DATE_MISSING);
const time = z.string({ error: TIME_MISSING }).trim().min(1, TIME_MISSING);
const durationMinutes = integerBetween(MIN_SESSION_MINUTES, MAX_SESSION_MINUTES, DURATION_RANGE);

// ── Los datos de una sesión ──────────────────────────────────────────────────────────────

/** Lo que comparten crear una sesión y editar sus datos. */
const sessionFields = {
  date,
  time,
  durationMinutes,
  title: required(TITLE_MISSING, TITLE_MAX),
  primaryFocusId: focusId,
  secondaryFocusId: focusId,
  location: optional(LOCATION_MAX),
};

type Focus = { primaryFocusId: string | null; secondaryFocusId: string | null };

/**
 * El secundario no repite el principal (`practice_plans_secondary_focus_check`). El mensaje va
 * en el secundario, con `path`: sin él se perdería (ver `fromZodError`). Como toda comprobación
 * de un objeto, solo corre si cada campo ya es válido: si no, el error de cada uno es el que se
 * enseña.
 */
function differentFocus(data: Focus): boolean {
  return data.primaryFocusId === null || data.primaryFocusId !== data.secondaryFocusId;
}

const DIFFERENT_FOCUS = { path: ["secondaryFocusId"], error: FOCUS_REPEATED };

/**
 * Un secundario sin principal no tiene sentido (el secundario acompaña al principal, que es el
 * objetivo de la sesión): pasa a ser el principal, y el secundario queda vacío.
 */
function promoteSecondary<T extends Focus>(data: T): T {
  if (data.primaryFocusId !== null || data.secondaryFocusId === null) return data;
  return { ...data, primaryFocusId: data.secondaryFocusId, secondaryFocusId: null };
}

export const createPracticeSchema = z
  .object({ teamId, ...sessionFields })
  .refine(differentFocus, DIFFERENT_FOCUS)
  .transform(promoteSecondary);

export const updatePracticeMetaSchema = z
  .object({
    eventId: id,
    expectedUpdatedAt,
    ...sessionFields,
    notes: optional(NOTES_MAX),
  })
  .refine(differentFocus, DIFFERENT_FOCUS)
  .transform(promoteSecondary);

// ── Los ítems ────────────────────────────────────────────────────────────────────────────

/**
 * Un ítem como lo edita el constructor. `id` falta hasta que el ítem se guarda; `drillId` es
 * null en un título libre. Cada texto se recorta y mide por separado, para que el error de uno
 * señale su fila y su campo (`items.2.title`).
 */
const item = z.object({
  id: id.optional(),
  drillId: id.nullable(),
  title: required(TITLE_MISSING, TITLE_MAX),
  phase: optional(PHASE_MAX),
  minutes: integerBetween(MIN_MINUTES, MAX_MINUTES, MINUTES_RANGE),
  notes: optional(ITEM_NOTES_MAX),
}) satisfies z.ZodType<PracticeItemDraft, PracticeItemDraft>;

export const savePracticeItemsSchema = z.object({
  eventId: id,
  expectedUpdatedAt,
  saveId: id,
  items: z.array(item, { error: FIELD_INVALID }).max(MAX_ITEMS, MAX_ITEMS_MESSAGE),
});

// ── Ejercicios de la biblioteca en la sesión ─────────────────────────────────────────────

/**
 * Lo que busca el selector: un texto y un objetivo (su slug), los dos opcionales. Aquí solo se
 * pide que sean texto; qué es una búsqueda válida (sin caracteres de control, recortada, de 80
 * caracteres como mucho) y qué es un slug lo dice el lector de la biblioteca
 * (`parseDrillFilters`), que es el que corre en la acción: lo que no vale se ignora, no falla.
 */
export const findDrillsSchema = z.object({
  q: z.string({ error: FIELD_INVALID }).optional(),
  focus: z.string({ error: FIELD_INVALID }).optional(),
});

/** Un ejercicio de la biblioteca que se añade al final de una sesión. */
export const addDrillToPracticeSchema = z.object({ eventId: id, drillId: id });

// ── Duplicar y cancelar ──────────────────────────────────────────────────────────────────

export const duplicatePracticeSchema = z.object({ eventId: id, date, time });

export const cancelPracticeSchema = z.object({ eventId: id });

// Lo que reciben las acciones: la entrada tal cual la manda un formulario, antes de Zod.
export type CreatePracticeInput = z.input<typeof createPracticeSchema>;
export type UpdatePracticeMetaInput = z.input<typeof updatePracticeMetaSchema>;
export type SavePracticeItemsInput = z.input<typeof savePracticeItemsSchema>;
export type FindDrillsInput = z.input<typeof findDrillsSchema>;
export type AddDrillToPracticeInput = z.input<typeof addDrillToPracticeSchema>;
export type DuplicatePracticeInput = z.input<typeof duplicatePracticeSchema>;
export type CancelPracticeInput = z.input<typeof cancelPracticeSchema>;
