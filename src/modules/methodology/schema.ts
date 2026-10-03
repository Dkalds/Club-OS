import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import type { ContentKind, ContentStatus, MethodologyKind } from "./types";

// Entrada de las acciones de metodología. Los límites son los CHECK de
// `20261020000100_methodology.sql`: con ellos, un texto vacío, un null o uno demasiado largo
// se queda aquí, con su mensaje, y nunca llega a la base de datos como un `23502` o un
// `23514` sin campo al que señalar. Los esquemas viven aparte porque un módulo `'use server'`
// solo puede exportar funciones asíncronas.

const TITLE_MISSING = "Escribe un título.";
const DESCRIPTION_MISSING = "Escribe una descripción.";
const BODY_TOO_LONG = "El texto es demasiado largo (máximo 20.000 caracteres).";
const NUMBER_RANGE = "El número tiene que estar entre 1 y 99.";
const MAX_POINTS = 12;
const TOO_MANY_POINTS = `Un principio tiene como máximo ${MAX_POINTS} puntos.`;

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
    .string()
    .trim()
    .max(max, tooLong(max))
    .nullable()
    .transform((text) => (text === "" ? null : text));
}

// Lo que llega de un formulario no es de fiar: un id que no tenga forma de uuid no llega a
// la base de datos (daría un `22P02`). Se acepta cualquier uuid escrito con guiones, sin
// mirar versión ni variante, como `admin-queries.ts`.
const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);

const contentKind = z.enum([
  "text",
  "values",
  "principles",
  "standards",
]) satisfies z.ZodType<ContentKind>;
const status = z.enum(["draft", "published"]) satisfies z.ZodType<ContentStatus>;
const methodologyKind = z.enum([
  "way_sections",
  "club_values",
  "game_principles",
  "standards",
]) satisfies z.ZodType<MethodologyKind>;

/**
 * Los puntos de un principio. Cada uno se recorta y mide por separado, antes de descartar
 * los vacíos, para que el error de uno señale su fila (`points.1`); luego se cuenta lo que
 * queda: un hueco en blanco en el formulario no gasta uno de los 12.
 */
const points = z
  .array(z.string().trim().max(200, tooLong(200)))
  .transform((texts) => texts.filter((text) => text !== ""))
  .pipe(z.array(z.string()).max(MAX_POINTS, TOO_MANY_POINTS));

/** `number smallint check (number between 1 and 99)`: entero, venga como venga. */
const standardNumber = z
  .number({ error: NUMBER_RANGE })
  .int(NUMBER_RANGE)
  .min(1, NUMBER_RANGE)
  .max(99, NUMBER_RANGE);

// ── Secciones de The Way ────────────────────────────────────────────────────────────────

export const createWaySectionSchema = z.object({
  title: required(TITLE_MISSING, 80),
  contentKind,
});

export const updateWaySectionSchema = z.object({
  id,
  // El `updated_at` que tenía la copia que se editaba, tal cual: ni se recorta ni se parsea.
  expectedUpdatedAt: z.string().min(1),
  title: required(TITLE_MISSING, 80),
  summary: optional(200),
  contentKind,
  bodyMd: z.string().trim().max(20000, BODY_TOO_LONG),
});

// ── Estado y orden (las cuatro listas) ──────────────────────────────────────────────────

export const setMethodologyStatusSchema = z.object({ kind: methodologyKind, id, status });

export const moveMethodologyItemSchema = z.object({
  kind: methodologyKind,
  id,
  direction: z.enum(["up", "down"]),
});

// ── Valores ─────────────────────────────────────────────────────────────────────────────

export const createValueSchema = z.object({
  code: required("Escribe el código del valor.", 40),
  title: optional(80),
  description: required(DESCRIPTION_MISSING, 500),
});

export const updateValueSchema = createValueSchema.extend({ id });

// ── Principios ──────────────────────────────────────────────────────────────────────────

export const createPrincipleSchema = z.object({
  title: required(TITLE_MISSING, 80),
  summary: optional(300),
});

export const savePrincipleSchema = createPrincipleSchema.extend({ id, points });

// ── Standards ───────────────────────────────────────────────────────────────────────────

export const createStandardSchema = z.object({
  number: standardNumber,
  title: required(TITLE_MISSING, 80),
  description: required(DESCRIPTION_MISSING, 500),
});

export const updateStandardSchema = createStandardSchema.extend({ id });

// Lo que reciben las acciones: la entrada tal cual la manda un formulario, antes de Zod.
export type CreateWaySectionInput = z.input<typeof createWaySectionSchema>;
export type UpdateWaySectionInput = z.input<typeof updateWaySectionSchema>;
export type SetMethodologyStatusInput = z.input<typeof setMethodologyStatusSchema>;
export type MoveMethodologyItemInput = z.input<typeof moveMethodologyItemSchema>;
export type CreateValueInput = z.input<typeof createValueSchema>;
export type UpdateValueInput = z.input<typeof updateValueSchema>;
export type CreatePrincipleInput = z.input<typeof createPrincipleSchema>;
export type SavePrincipleInput = z.input<typeof savePrincipleSchema>;
export type CreateStandardInput = z.input<typeof createStandardSchema>;
export type UpdateStandardInput = z.input<typeof updateStandardSchema>;
