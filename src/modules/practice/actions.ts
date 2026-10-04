"use server";

import type { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { Json } from "@/lib/database.types";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import { zonedDateTimeToIso } from "@/lib/time";
import {
  cancelPracticeSchema,
  createPracticeSchema,
  duplicatePracticeSchema,
  savePracticeItemsSchema,
  updatePracticeMetaSchema,
  type CancelPracticeInput,
  type CreatePracticeInput,
  type DuplicatePracticeInput,
  type SavePracticeItemsInput,
  type UpdatePracticeMetaInput,
} from "./schema";
import type { PracticeItemDraft } from "./types";

// Acciones de las sesiones de entrenamiento: crear, editar sus datos, guardar sus ítems,
// duplicar y cancelar. Las usa quien entrena (y la dirección).
//
// Todas siguen el orden de `mutate` (`@/lib/mutate`): Zod sobre la entrada, el club y el
// permiso `practice.manage` (sin permiso, `NOT_FOUND` sin tocar la base de datos), la escritura
// y, si ha ido bien, `revalidatePath`. RLS decide de verdad quién escribe en qué equipo; `can`
// solo evita llegar hasta ella.
//
// Las tres escrituras de varias tablas y el duplicado van por las funciones SQL de
// `20261117000300_practice_functions.sql`, que son una sola transacción y traducen sus problemas
// al contrato de errores del proyecto (`STALE_COPY`, `SESSION_CLOSED`, `NOT_FOUND`, `INVALID`).
// No hay ningún insert ni update directo de `events`, `practice_plans` ni `practice_items`;
// cancelar es el único `update`, y solo del estado.
//
// Todo va acotado al club de `clubSlug`: las funciones SQL que reciben un id sin el club
// (`update_practice_session`, `save_practice_items`, `duplicate_practice`) no lo comprueban, así
// que toda acción con `eventId` lee antes el entreno filtrando por el club, y cancelar filtra
// el propio `update`. Las horas se calculan en la zona del club (`ctx.org.timezone`), nunca en
// la del servidor.

/**
 * Lo que se revalida tras escribir: un patrón de ruta, no una URL (el porqué está en
 * `MutateConfig.routes`, de `@/lib/mutate`). Es todo el grupo `(app)` porque una sesión se
 * muestra en varias pestañas de quien entrena (la lista, el detalle, el inicio) y cualquiera
 * de ellas queda vieja al escribir. Sigue las carpetas de `src/app/c/[club]/`.
 */
const APP_ROUTE = "/c/[club]/(app)";

/**
 * El esqueleto de `@/lib/mutate` con lo de esta área: el permiso `practice.manage`, la etiqueta
 * `practice.<acción>` del log y la ruta de la app.
 */
function mutate<D, T>(
  name: string,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runMutation(
    { tag: `practice.${name}`, permission: "practice.manage", routes: [APP_ROUTE] },
    clubSlug,
    schema,
    input,
    write,
  );
}

/** El error de campo de una fecha y una hora que no forman un instante que exista. */
const INVALID_SLOT = { date: "Elige una fecha y una hora válidas." };

/**
 * El instante del día `date` a la hora `time` del reloj de `timezone`, en ISO UTC; `null` si no
 * existe (30 de febrero, las 25:00). `zonedDateTimeToIso` avisa con un `RangeError`: cualquier
 * otra excepción no es un dato malo y sigue su camino.
 */
function startsAt(date: string, time: string, timezone: string): string | null {
  try {
    return zonedDateTimeToIso(date, time, timezone);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

/**
 * El fin de una sesión: el inicio más su duración. Es aritmética de instantes y no de reloj de
 * pared: una sesión que cruza el cambio de hora dura lo que dice, no una hora más o menos.
 */
function endsAt(start: string, minutes: number): string {
  return new Date(Date.parse(start) + minutes * 60_000).toISOString();
}

/**
 * Los argumentos opcionales de una función SQL (`default null`) solo viajan si tienen valor.
 * Para la función, ausente y null son lo mismo (el campo queda vacío), y los tipos generados
 * los marcan opcionales, no anulables: así no hace falta mentir con un `as string`.
 */
function given<K extends string>(args: Record<K, string | null>): Partial<Record<K, string>> {
  const present = Object.entries<string | null>(args).filter(
    (entry): entry is [string, string] => entry[1] !== null,
  );
  return Object.fromEntries(present) as Partial<Record<K, string>>;
}

/**
 * El id del plan del entreno `eventId` si es un entreno de este club con plan; si no existe, es
 * de otro club, no es un entreno o no tiene plan, `NOT_FOUND` (el mismo 404 opaco para todos).
 * Las funciones SQL escriben por id sin recibir el club: sin esta lectura previa, quien
 * gestiona dos clubes escribiría en una sesión del B llamando a la acción del A. PostgREST
 * devuelve el plan como lista de un elemento (la clave foránea es compuesta) o como objeto, y
 * aquí se lee igual.
 */
async function findPractice(
  { db, ctx, fromDb }: Pick<Write<unknown>, "db" | "ctx" | "fromDb">,
  eventId: string,
): Promise<ActionResult<{ planId: string }>> {
  const { data, error } = await db
    .from("events")
    .select("id, practice_plans(id)")
    .eq("organization_id", ctx.org.id)
    .eq("id", eventId)
    .eq("kind", "practice")
    .maybeSingle();
  if (error) return fromDb(error);

  const plans = data?.practice_plans;
  const plan = Array.isArray(plans) ? plans[0] : plans;
  return plan ? ok({ planId: plan.id }) : fail("NOT_FOUND");
}

/** Un ítem con las claves de `save_practice_items`. Un ítem nuevo no lleva `id`. */
function toRpcItem(item: PracticeItemDraft): Json {
  return {
    ...(item.id === undefined ? {} : { id: item.id }),
    drill_id: item.drillId,
    title: item.title,
    phase: item.phase,
    minutes: item.minutes,
    notes: item.notes,
  };
}

// ── Crear ───────────────────────────────────────────────────────────────────────────────

/**
 * Un entreno programado en un equipo, con su plan en borrador y sin ítems, con
 * `create_practice_session`. Empieza a la `date` y `time` del reloj del club y acaba
 * `durationMinutes` después. Si la fecha o la hora no existen, `INVALID` en `date` sin llegar a
 * la base de datos. El equipo lo comprueba la función: uno que no se gestiona es `NOT_FOUND`.
 * Los objetivos y el lugar vacíos no se envían; el objetivo secundario sin principal pasa a ser
 * el principal (ver el esquema).
 */
export async function createPractice(
  clubSlug: string,
  input: CreatePracticeInput,
): Promise<ActionResult<{ eventId: string }>> {
  return mutate(
    "create-practice",
    clubSlug,
    createPracticeSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const start = startsAt(data.date, data.time, ctx.org.timezone);
      if (start === null) return fail("INVALID", INVALID_SLOT);

      const { data: eventId, error } = await db.rpc("create_practice_session", {
        p_team: data.teamId,
        p_starts_at: start,
        p_ends_at: endsAt(start, data.durationMinutes),
        p_title: data.title,
        ...given({
          p_primary_focus: data.primaryFocusId,
          p_secondary_focus: data.secondaryFocusId,
          p_location: data.location,
        }),
      });
      if (error) return fromDb(error);

      return ok({ eventId });
    },
  );
}

// ── Editar ──────────────────────────────────────────────────────────────────────────────

/**
 * Cambia los datos de una sesión abierta con `update_practice_session`: las horas y el lugar
 * (en el evento), el título, los objetivos y las notas (en el plan). Editar es dejar la sesión
 * como dice el formulario: lo que llega vacío se envía ausente y la función lo vacía. Antes
 * comprueba que el entreno es de este club: si no, `NOT_FOUND` sin llamar a la función. Si
 * `expectedUpdatedAt` ya no es el del plan, alguien guardó antes: `STALE_COPY`; si la sesión
 * ya no está programada, `SESSION_CLOSED`. Devuelve el `updated_at` nuevo tal cual lo da la
 * función (con microsegundos), que es la copia de quien siga editando.
 */
export async function updatePracticeMeta(
  clubSlug: string,
  input: UpdatePracticeMetaInput,
): Promise<ActionResult<{ updatedAt: string }>> {
  return mutate(
    "update-practice-meta",
    clubSlug,
    updatePracticeMetaSchema,
    input,
    async (run) => {
      const { db, ctx, data, fromDb } = run;

      const start = startsAt(data.date, data.time, ctx.org.timezone);
      if (start === null) return fail("INVALID", INVALID_SLOT);

      const practice = await findPractice(run, data.eventId);
      if (!practice.ok) return practice;

      const { data: updatedAt, error } = await db.rpc("update_practice_session", {
        p_event: data.eventId,
        p_expected_updated_at: data.expectedUpdatedAt,
        p_starts_at: start,
        p_ends_at: endsAt(start, data.durationMinutes),
        p_title: data.title,
        ...given({
          p_primary_focus: data.primaryFocusId,
          p_secondary_focus: data.secondaryFocusId,
          p_location: data.location,
          p_notes: data.notes,
        }),
      });
      if (error) return fromDb(error);

      return ok({ updatedAt });
    },
  );
}

// ── Ítems ───────────────────────────────────────────────────────────────────────────────

/**
 * Deja la lista de ítems de la sesión como llega, en su orden, con `save_practice_items`: la
 * función borra los que faltan, cambia los que traen `id` y crea los que no. Antes lee el
 * entreno de este club y de él sale el plan (`p_plan`): si no está, `NOT_FOUND` sin llamar a la
 * función. `STALE_COPY` y `SESSION_CLOSED` como al editar los datos: la copia es una sola para
 * los datos y para los ítems. Devuelve el `updated_at` nuevo del plan tal cual lo da la función.
 */
export async function savePracticeItems(
  clubSlug: string,
  input: SavePracticeItemsInput,
): Promise<ActionResult<{ updatedAt: string }>> {
  return mutate(
    "save-practice-items",
    clubSlug,
    savePracticeItemsSchema,
    input,
    async (run) => {
      const { db, data, fromDb } = run;

      const practice = await findPractice(run, data.eventId);
      if (!practice.ok) return practice;

      const { data: updatedAt, error } = await db.rpc("save_practice_items", {
        p_plan: practice.data.planId,
        p_expected_updated_at: data.expectedUpdatedAt,
        p_items: data.items.map(toRpcItem),
      });
      if (error) return fromDb(error);

      return ok({ updatedAt });
    },
  );
}

// ── Duplicar y cancelar ─────────────────────────────────────────────────────────────────

/**
 * Una sesión nueva a partir de otra, en cualquier estado, con `duplicate_practice`: empieza a
 * la `date` y `time` del reloj del club y conserva la duración, el lugar, el título, los
 * objetivos, las notas y los ítems del origen. Antes comprueba que el origen es de este club:
 * si no, `NOT_FOUND` sin llamar a la función. No hay copia esperada: no se guarda sobre nada.
 * Devuelve el id del entreno nuevo.
 */
export async function duplicatePractice(
  clubSlug: string,
  input: DuplicatePracticeInput,
): Promise<ActionResult<{ eventId: string }>> {
  return mutate(
    "duplicate-practice",
    clubSlug,
    duplicatePracticeSchema,
    input,
    async (run) => {
      const { db, ctx, data, fromDb } = run;

      const start = startsAt(data.date, data.time, ctx.org.timezone);
      if (start === null) return fail("INVALID", INVALID_SLOT);

      const practice = await findPractice(run, data.eventId);
      if (!practice.ok) return practice;

      const { data: eventId, error } = await db.rpc("duplicate_practice", {
        p_event: data.eventId,
        p_starts_at: start,
      });
      if (error) return fromDb(error);

      return ok({ eventId });
    },
  );
}

/**
 * Cancela un entreno programado de este club: solo cambia el estado, y solo si es un entreno
 * de este club que sigue programado. Sin esa fila (no existe, es de otro club, no es un entreno
 * o ya está hecho o cancelado) no toca nada y es `NOT_FOUND`: el propio `update` es la
 * comprobación, no hace falta una lectura previa.
 */
export async function cancelPractice(
  clubSlug: string,
  input: CancelPracticeInput,
): Promise<ActionResult<null>> {
  return mutate(
    "cancel-practice",
    clubSlug,
    cancelPracticeSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const { data: rows, error } = await db
        .from("events")
        .update({ status: "cancelled" })
        .eq("organization_id", ctx.org.id)
        .eq("id", data.eventId)
        .eq("kind", "practice")
        .eq("status", "scheduled")
        .select("id");
      if (error) return fromDb(error);

      return rows.length === 0 ? fail("NOT_FOUND") : ok(null);
    },
  );
}
