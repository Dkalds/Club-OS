"use server";

import type { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import { zonedDateTimeToIso } from "@/lib/time";
import {
  cancelGameSchema,
  createGameSchema,
  recordResultSchema,
  updateGameSchema,
  type CancelGameInput,
  type CreateGameInput,
  type RecordResultInput,
  type UpdateGameInput,
} from "./schema";

// Acciones de partidos: crear, cambiar sus datos, apuntar el resultado y cancelar. Siguen el
// orden de `mutate` (`@/lib/mutate`): Zod, el club y el permiso `game.manage` (sin él,
// `NOT_FOUND` sin tocar la base), la escritura y `revalidatePath`.
//
// Las cuatro van por las funciones SQL de `20261215000200_games_write.sql`, que son una sola
// transacción y traducen sus problemas al contrato de errores (`NOT_FOUND`, `GAME_CLOSED`,
// `INVALID`). Esas funciones reciben un id y escriben donde esté esa fila, sin mirar el club: por
// eso cada acción lee antes el equipo o el partido filtrando por el club (C25). Las horas se
// calculan en la zona del club, nunca en la del servidor.

/** Todo el grupo `(app)`: un partido sale en Partidos, en Inicio y en el detalle. */
const APP_ROUTE = "/c/[club]/(app)";

function mutate<D, T>(
  name: string,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runMutation(
    { tag: `games.${name}`, permission: "game.manage", routes: [APP_ROUTE] },
    clubSlug,
    schema,
    input,
    write,
  );
}

const INVALID_SLOT = { date: "Elige una fecha y una hora válidas." };

/** El instante del día y la hora en el reloj del club; `null` si no existe (30 de febrero). */
function startsAt(date: string, time: string, timezone: string): string | null {
  try {
    return zonedDateTimeToIso(date, time, timezone);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function endsAt(start: string, minutes: number): string {
  return new Date(Date.parse(start) + minutes * 60_000).toISOString();
}

type Run = Pick<Write<unknown>, "db" | "ctx" | "fromDb">;

/** ¿Es `teamId` un equipo de este club? Con la sesión de quien escribe. */
async function teamInClub({ db, ctx, fromDb }: Run, teamId: string): Promise<ActionResult<null>> {
  const { data, error } = await db
    .from("teams")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("id", teamId)
    .maybeSingle();
  if (error) return fromDb(error);
  return data ? ok(null) : fail("NOT_FOUND");
}

/** ¿Es `eventId` un partido de este club? Con la sesión de quien escribe. */
async function gameInClub({ db, ctx, fromDb }: Run, eventId: string): Promise<ActionResult<null>> {
  const { data, error } = await db
    .from("events")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("id", eventId)
    .eq("kind", "game")
    .maybeSingle();
  if (error) return fromDb(error);
  return data ? ok(null) : fail("NOT_FOUND");
}

/** Crea un partido de un equipo de la temporada actual y devuelve el id de su evento. */
export async function createGame(
  clubSlug: string,
  input: CreateGameInput,
): Promise<ActionResult<{ eventId: string }>> {
  return mutate("create-game", clubSlug, createGameSchema, input, async (run) => {
    const { db, ctx, data, fromDb } = run;

    const start = startsAt(data.date, data.time, ctx.org.timezone);
    if (start === null) return fail("INVALID", INVALID_SLOT);

    const team = await teamInClub(run, data.teamId);
    if (!team.ok) return team;

    const { data: eventId, error } = await db.rpc("create_game", {
      p_team: data.teamId,
      p_starts_at: start,
      p_ends_at: endsAt(start, data.durationMinutes),
      p_opponent: data.opponent,
      ...(data.competition === null ? {} : { p_competition: data.competition }),
      ...(data.homeAway === null ? {} : { p_home_away: data.homeAway }),
      ...(data.location === null ? {} : { p_location: data.location }),
    });
    if (error) return fromDb(error);

    return ok({ eventId });
  });
}

/**
 * Deja el partido como dice el formulario: lo que llega vacío se envía ausente y la función lo
 * vacía. Un partido cancelado no cambia (`GAME_CLOSED`).
 */
export async function updateGame(clubSlug: string, input: UpdateGameInput): Promise<ActionResult<null>> {
  return mutate("update-game", clubSlug, updateGameSchema, input, async (run) => {
    const { db, ctx, data, fromDb } = run;

    const start = startsAt(data.date, data.time, ctx.org.timezone);
    if (start === null) return fail("INVALID", INVALID_SLOT);

    const game = await gameInClub(run, data.eventId);
    if (!game.ok) return game;

    const { error } = await db.rpc("update_game", {
      p_event: data.eventId,
      p_starts_at: start,
      p_ends_at: endsAt(start, data.durationMinutes),
      p_opponent: data.opponent,
      ...(data.competition === null ? {} : { p_competition: data.competition }),
      ...(data.homeAway === null ? {} : { p_home_away: data.homeAway }),
      ...(data.location === null ? {} : { p_location: data.location }),
      ...(data.opponentNotes === null ? {} : { p_opponent_notes: data.opponentNotes }),
    });
    if (error) return fromDb(error);

    return ok(null);
  });
}

/**
 * Apunta o corrige el resultado y deja el partido jugado. Antes de la hora de inicio, `INVALID`;
 * en uno cancelado, `GAME_CLOSED`.
 */
export async function recordResult(clubSlug: string, input: RecordResultInput): Promise<ActionResult<null>> {
  return mutate("record-result", clubSlug, recordResultSchema, input, async (run) => {
    const { db, data, fromDb } = run;

    const game = await gameInClub(run, data.eventId);
    if (!game.ok) return game;

    const { error } = await db.rpc("record_game_result", {
      p_event: data.eventId,
      p_score_for: data.scoreFor,
      p_score_against: data.scoreAgainst,
    });
    if (error) return fromDb(error);

    return ok(null);
  });
}

/** Cancela un partido programado. No se deshace. */
export async function cancelGame(clubSlug: string, input: CancelGameInput): Promise<ActionResult<null>> {
  return mutate("cancel-game", clubSlug, cancelGameSchema, input, async (run) => {
    const { db, data, fromDb } = run;

    const game = await gameInClub(run, data.eventId);
    if (!game.ok) return game;

    const { error } = await db.rpc("cancel_game", { p_event: data.eventId });
    if (error) return fromDb(error);

    return ok(null);
  });
}
