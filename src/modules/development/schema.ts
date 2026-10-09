import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { GOAL_DESCRIPTION_MAX, GOAL_TITLE_MAX, NOTE_BODY_MAX } from "./limits";

// Entrada de las acciones de objetivos y notas. Un texto vacío, un null o un id que no es uuid
// se quedan aquí, con su mensaje y su campo, y nunca llegan a la base como un `22P02` o un
// `23514` sin campo. Aparte de `actions.ts` porque un módulo `'use server'` solo exporta
// funciones asíncronas.

const FIELD_INVALID = "Revisa este campo.";
const GOAL_TITLE_MISSING = "Escribe el objetivo.";
const NOTE_BODY_MISSING = "Escribe la nota.";
const FOCUS_INVALID = "Elige un foco de la lista.";
const STANDARD_INVALID = "Elige un Standard de la lista.";
const VISIBILITY_INVALID = "Elige quién puede leerla.";

function tooLong(max: number): string {
  return `Máximo ${max} caracteres.`;
}

function required(missing: string, max: number) {
  return z.string({ error: missing }).trim().min(1, missing).max(max, tooLong(max));
}

/** Texto opcional: recortado; vacío o null se guarda como null. */
function optional(max: number) {
  return z
    .string({ error: FIELD_INVALID })
    .trim()
    .max(max, tooLong(max))
    .nullable()
    .transform((text) => (text === "" ? null : text));
}

/** Un id opcional de un `<select>`: uuid, o `""`/null si no se elige ninguno. */
function optionalId(message: string) {
  return z
    .union([z.guid(message), z.literal(""), z.null()], { error: message })
    .transform((value) => (value === "" ? null : value));
}

const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);

const goalFields = {
  title: required(GOAL_TITLE_MISSING, GOAL_TITLE_MAX),
  description: optional(GOAL_DESCRIPTION_MAX),
  focusAreaId: optionalId(FOCUS_INVALID),
  standardId: optionalId(STANDARD_INVALID),
};

const noteFields = {
  body: required(NOTE_BODY_MISSING, NOTE_BODY_MAX),
  visibility: z.enum(["private", "staff"], { error: VISIBILITY_INVALID }),
};

export const createGoalSchema = z.object({ teamId: id, personId: id, ...goalFields });
export const updateGoalSchema = z.object({ goalId: id, ...goalFields });
export const goalIdSchema = z.object({ goalId: id });

export const createNoteSchema = z.object({ teamId: id, personId: id, ...noteFields });
export const updateNoteSchema = z.object({ noteId: id, ...noteFields });
export const noteIdSchema = z.object({ noteId: id });

export type CreateGoalInput = z.input<typeof createGoalSchema>;
export type UpdateGoalInput = z.input<typeof updateGoalSchema>;
export type GoalIdInput = z.input<typeof goalIdSchema>;
export type CreateNoteInput = z.input<typeof createNoteSchema>;
export type UpdateNoteInput = z.input<typeof updateNoteSchema>;
export type NoteIdInput = z.input<typeof noteIdSchema>;
