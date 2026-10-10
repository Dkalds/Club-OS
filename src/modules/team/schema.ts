import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";

// Entrada de las acciones de Gestión de equipos (`/admin/teams`, Fase 7 Task 10). Mismos
// topes que el CHECK de cada tabla, con su mensaje y su campo.

const NAME_MISSING = "Escribe el nombre.";
const DATE_INVALID = "Elige una fecha válida.";
const AGE_BAND_INVALID = "Una franja como U12.";

const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);
const name = z.string({ error: NAME_MISSING }).trim().min(1, NAME_MISSING).max(80);
const date = z.string({ error: DATE_INVALID }).regex(/^\d{4}-\d{2}-\d{2}$/, DATE_INVALID);

const seasonFields = {
  name,
  startsOn: date,
  endsOn: date,
  isCurrent: z.boolean().default(false),
};

const categoryFields = {
  name,
  ageBand: z
    .string({ error: AGE_BAND_INVALID })
    .trim()
    .toUpperCase()
    .regex(/^U\d{1,2}$/, AGE_BAND_INVALID),
  sort: z.number().int().default(0),
};

const teamFields = {
  seasonId: id,
  categoryId: id,
  name,
};

export const createSeasonSchema = z.object(seasonFields);
export const updateSeasonSchema = z.object({ seasonId: id, ...seasonFields });
export const createCategorySchema = z.object(categoryFields);
export const updateCategorySchema = z.object({ categoryId: id, ...categoryFields });
export const createTeamSchema = z.object(teamFields);
export const updateTeamSchema = z.object({ teamId: id, ...teamFields });

export type CreateSeasonInput = z.input<typeof createSeasonSchema>;
export type UpdateSeasonInput = z.input<typeof updateSeasonSchema>;
export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
export type CreateTeamInput = z.input<typeof createTeamSchema>;
export type UpdateTeamInput = z.input<typeof updateTeamSchema>;
