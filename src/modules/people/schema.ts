import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";

// Entrada de las acciones de personas (`/admin/people`, Fase 7 Task 11). Mismos nombres y
// topes que el alta por CSV (`src/modules/people-import`): un nombre o unos apellidos
// vacíos, o un año fuera de 1900-2100, se quedan aquí.

const NAME_MISSING = "Escribe el nombre.";
const LAST_NAME_MISSING = "Escribe los apellidos.";
const YEAR_INVALID = "El año de nacimiento debe estar entre 1900 y 2100.";

const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);
const name = z.string({ error: NAME_MISSING }).trim().min(1, NAME_MISSING).max(80);
const lastName = z.string({ error: LAST_NAME_MISSING }).trim().min(1, LAST_NAME_MISSING).max(80);

/** Un año opcional de un campo que puede llegar vacío (persona adulta). */
const birthYear = z
  .union([z.number().int().min(1900, YEAR_INVALID).max(2100, YEAR_INVALID), z.literal(""), z.null()], {
    error: YEAR_INVALID,
  })
  .nullable()
  .default(null)
  .transform((value) => (value === "" ? null : value));

const personFields = { firstName: name, lastName, birthYear };

export const createPersonSchema = z.object(personFields);
export const updatePersonSchema = z.object({ personId: id, ...personFields });
export const personIdSchema = z.object({ personId: id });
export const createGuardianshipSchema = z.object({ guardianPersonId: id, childPersonId: id });

export type CreatePersonInput = z.input<typeof createPersonSchema>;
export type UpdatePersonInput = z.input<typeof updatePersonSchema>;
export type PersonIdInput = z.input<typeof personIdSchema>;
export type CreateGuardianshipInput = z.input<typeof createGuardianshipSchema>;
