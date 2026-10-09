import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import {
  COMPETITION_MAX,
  LOCATION_MAX,
  MAX_GAME_MINUTES,
  MIN_GAME_MINUTES,
  OPPONENT_MAX,
  OPPONENT_NOTES_MAX,
  SCORE_MAX,
} from "./limits";

// Entrada de las acciones de partidos. Aparte de `actions.ts` porque un módulo `'use server'`
// solo exporta funciones asíncronas. La fecha y la hora son los textos de los `<input>`, en el
// reloj del club: que formen un instante que existe lo dice la acción, que conoce la zona.

const FIELD_INVALID = "Revisa este campo.";
const TEAM_MISSING = "Elige un equipo.";
const OPPONENT_MISSING = "Escribe el rival.";
const DATE_MISSING = "Elige una fecha.";
const TIME_MISSING = "Elige una hora.";
const DURATION_RANGE = `La duración tiene que estar entre ${MIN_GAME_MINUTES} y ${MAX_GAME_MINUTES} minutos.`;
const HOME_AWAY_INVALID = "Elige local o visitante.";
const SCORE_RANGE = `Entre 0 y ${SCORE_MAX}.`;

function tooLong(max: number): string {
  return `Máximo ${max} caracteres.`;
}

function optional(max: number) {
  return z
    .string({ error: FIELD_INVALID })
    .trim()
    .max(max, tooLong(max))
    .nullable()
    .transform((text) => (text === "" ? null : text));
}

const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);

const homeAway = z
  .union([z.enum(["home", "away"]), z.literal(""), z.null()], { error: HOME_AWAY_INVALID })
  .transform((value) => (value === "" ? null : value));

const gameFields = {
  opponent: z.string({ error: OPPONENT_MISSING }).trim().min(1, OPPONENT_MISSING).max(OPPONENT_MAX, tooLong(OPPONENT_MAX)),
  date: z.string({ error: DATE_MISSING }).trim().min(1, DATE_MISSING),
  time: z.string({ error: TIME_MISSING }).trim().min(1, TIME_MISSING),
  durationMinutes: z
    .number({ error: DURATION_RANGE })
    .int(DURATION_RANGE)
    .min(MIN_GAME_MINUTES, DURATION_RANGE)
    .max(MAX_GAME_MINUTES, DURATION_RANGE),
  homeAway,
  competition: optional(COMPETITION_MAX),
  location: optional(LOCATION_MAX),
};

const score = z.number({ error: SCORE_RANGE }).int(SCORE_RANGE).min(0, SCORE_RANGE).max(SCORE_MAX, SCORE_RANGE);

export const createGameSchema = z.object({ teamId: z.guid(TEAM_MISSING), ...gameFields });
export const updateGameSchema = z.object({
  eventId: id,
  ...gameFields,
  opponentNotes: optional(OPPONENT_NOTES_MAX),
});
export const recordResultSchema = z.object({ eventId: id, scoreFor: score, scoreAgainst: score });
export const cancelGameSchema = z.object({ eventId: id });

export type CreateGameInput = z.input<typeof createGameSchema>;
export type UpdateGameInput = z.input<typeof updateGameSchema>;
export type RecordResultInput = z.input<typeof recordResultSchema>;
export type CancelGameInput = z.input<typeof cancelGameSchema>;
