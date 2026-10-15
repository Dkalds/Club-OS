import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";

// Entrada de las acciones del calendario de Gestión. Los límites son los `check` de
// `20270316000100_calendar.sql`: con ellos, un nombre vacío, un día imposible o una duración
// fuera de rango se quedan aquí, con su mensaje, y no llegan a la base como un error sin campo.

export const VENUE_NAME_MAX = 60;
export const DURATION_MIN = 15;
export const DURATION_MAX = 240;

const NAME_MISSING = "Escribe un nombre.";
const WEEKDAY_INVALID = "Elige un día de la semana.";
const TIME_INVALID = "Escribe una hora válida.";
const DURATION_RANGE = `La duración tiene que estar entre ${DURATION_MIN} y ${DURATION_MAX} minutos.`;

// Un id que no tenga forma de uuid no llega a la base de datos (daría un `22P02`).
const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);

const venueName = z
  .string({ error: NAME_MISSING })
  .trim()
  .min(1, NAME_MISSING)
  .max(VENUE_NAME_MAX, `Máximo ${VENUE_NAME_MAX} caracteres.`);

/** Una hora de reloj que existe, como la entrega un campo de hora: `HH:mm`, de 00:00 a 23:59. */
const time = z.string({ error: TIME_INVALID }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, TIME_INVALID);

const slot = {
  // El día ISO: 1 lunes, 7 domingo.
  weekday: z.number({ error: WEEKDAY_INVALID }).int(WEEKDAY_INVALID).min(1, WEEKDAY_INVALID).max(7, WEEKDAY_INVALID),
  time,
  durationMinutes: z
    .number({ error: DURATION_RANGE })
    .int(DURATION_RANGE)
    .min(DURATION_MIN, DURATION_RANGE)
    .max(DURATION_MAX, DURATION_RANGE),
  venueId: id.nullable(),
};

// ── Pistas ──────────────────────────────────────────────────────────────────────────────

export const createVenueSchema = z.object({ name: venueName });
export type CreateVenueInput = z.input<typeof createVenueSchema>;

export const renameVenueSchema = z.object({ id, name: venueName });
export type RenameVenueInput = z.input<typeof renameVenueSchema>;

export const venueIdSchema = z.object({ id });
export type VenueIdInput = z.input<typeof venueIdSchema>;

// ── Horarios semanales ──────────────────────────────────────────────────────────────────

export const createTeamScheduleSchema = z.object({ teamId: id, ...slot });
export type CreateTeamScheduleInput = z.input<typeof createTeamScheduleSchema>;

export const updateTeamScheduleSchema = z.object({ id, ...slot });
export type UpdateTeamScheduleInput = z.input<typeof updateTeamScheduleSchema>;

export const scheduleIdSchema = z.object({ id });
export type ScheduleIdInput = z.input<typeof scheduleIdSchema>;
