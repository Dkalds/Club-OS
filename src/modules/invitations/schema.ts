import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";

// Entrada de las acciones de invitaciones. Los mismos topes que el CHECK de la tabla
// (`invitations`, Fase 7 Task 1): quien escribe ve el mensaje aquí, nunca un 22023/23514 sin
// campo.

const EMAIL_MISSING = "Escribe un email.";
const EMAIL_INVALID = "Escribe un email válido.";
const NAME_MISSING = "Escribe el nombre.";
const ROLE_INVALID = "Elige un rol.";
const STAFF_ROLE_INVALID = "Elige qué hace en el equipo.";

const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);

const email = z.string({ error: EMAIL_MISSING }).trim().toLowerCase().max(254).pipe(z.email(EMAIL_INVALID));

const name = z.string({ error: NAME_MISSING }).trim().min(1, NAME_MISSING).max(80);

/** Un id opcional de un `<select>`: uuid, o `""`/null/ausente si no se elige ninguno. */
function optionalId(message: string) {
  return z
    .union([z.guid(message), z.literal(""), z.null()], { error: message })
    .nullable()
    .default(null)
    .transform((value) => (value === "" ? null : value));
}

/**
 * Un admin no lleva equipo ni persona ya dada de alta: solo email. Un coach siempre lleva
 * equipo y su rol en él, y o una persona existente o un nombre con el que crear la suya.
 */
export const createInvitationSchema = z
  .object({
    email,
    role: z.enum(["admin", "coach"], { error: ROLE_INVALID }),
    teamId: optionalId(ROLE_INVALID),
    staffRole: z.enum(["head_coach", "assistant"]).nullable().default(null),
    personId: optionalId(ROLE_INVALID),
    firstName: name.nullable().default(null),
    lastName: name.nullable().default(null),
  })
  .refine((value) => value.role !== "coach" || value.teamId !== null, {
    error: ROLE_INVALID,
    path: ["teamId"],
  })
  .refine((value) => value.role !== "coach" || value.staffRole !== null, {
    error: STAFF_ROLE_INVALID,
    path: ["staffRole"],
  })
  .refine(
    (value) =>
      value.role !== "coach" ||
      value.personId !== null ||
      (value.firstName !== null && value.lastName !== null),
    { error: NAME_MISSING, path: ["firstName"] },
  );

export const invitationIdSchema = z.object({ invitationId: id });

export type CreateInvitationInput = z.input<typeof createInvitationSchema>;
export type InvitationIdInput = z.input<typeof invitationIdSchema>;
