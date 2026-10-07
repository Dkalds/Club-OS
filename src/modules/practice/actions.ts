"use server";

import { unstable_rethrow } from "next/navigation";
import type { z } from "zod";
import { fail, fromZodError, ok, type ActionResult } from "@/lib/action-result";
import type { Json } from "@/lib/database.types";
import { requireClub } from "@/lib/guards";
import { logError } from "@/lib/log";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import { can } from "@/lib/permissions";
import { zonedDateTimeToIso } from "@/lib/time";
import { parseDrillFilters } from "@/modules/drills/filters";
import { searchDrills } from "@/modules/drills/queries";
import type { DrillSummary } from "@/modules/drills/types";
import { MAX_ITEMS, MAX_ITEMS_MESSAGE } from "./limits";
import {
  addDrillToPracticeSchema,
  cancelPracticeSchema,
  createPracticeSchema,
  duplicatePracticeSchema,
  findDrillsSchema,
  savePracticeItemsSchema,
  updatePracticeMetaSchema,
  type AddDrillToPracticeInput,
  type CancelPracticeInput,
  type CreatePracticeInput,
  type DuplicatePracticeInput,
  type FindDrillsInput,
  type SavePracticeItemsInput,
  type UpdatePracticeMetaInput,
} from "./schema";
import type { PracticeItemDraft } from "./types";

// Acciones de las sesiones de entrenamiento: crear, editar sus datos, guardar sus ítems,
// duplicar, cancelar y añadir ejercicios de la biblioteca. Las usa quien entrena (y la
// dirección).
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
// `findDrills` solo lee (es la búsqueda del selector de ejercicios) y no pasa por `mutate`: no
// hay nada que revalidar. Sigue su mismo orden de Zod, club y permiso.
//
// Todo va acotado al club de `clubSlug`. Las funciones SQL no comparan con él: las que reciben
// un id de entreno (`update_practice_session`, `save_practice_items`, `duplicate_practice`)
// escriben donde está ese entreno, y `create_practice_session` deduce el club del equipo. Por
// eso toda acción con `eventId` lee antes el entreno filtrando por el club, `createPractice`
// lee antes el equipo, y cancelar filtra el propio `update`. Las horas se calculan en la zona
// del club (`ctx.org.timezone`), nunca en la del servidor.

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
 * `NOT_FOUND` si el equipo `teamId` no es de este club (no existe o es de otro). La función que
 * crea la sesión deduce el club del equipo y no lo compara con el de quien llama: sin esta
 * lectura previa, quien gestiona equipos en dos clubes crearía una sesión en el B llamando a la
 * acción del A, con el permiso y la revalidación del A. Que además se gestione ese equipo lo
 * comprueba la función.
 */
async function findTeam(
  { db, ctx, fromDb }: Pick<Write<unknown>, "db" | "ctx" | "fromDb">,
  teamId: string,
): Promise<ActionResult<null>> {
  const { data, error } = await db
    .from("teams")
    .select("id")
    .eq("organization_id", ctx.org.id)
    .eq("id", teamId)
    .maybeSingle();
  if (error) return fromDb(error);

  return data ? ok(null) : fail("NOT_FOUND");
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
 * la base de datos. Antes comprueba que el equipo es de este club: si no, `NOT_FOUND` sin
 * llamar a la función, que es la que comprueba que además se gestiona (si no, `NOT_FOUND`
 * también). Los objetivos y el lugar vacíos no se envían; el objetivo secundario sin principal
 * pasa a ser el principal (ver el esquema).
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
    async (run) => {
      const { db, ctx, data, fromDb } = run;

      const start = startsAt(data.date, data.time, ctx.org.timezone);
      if (start === null) return fail("INVALID", INVALID_SLOT);

      const team = await findTeam(run, data.teamId);
      if (!team.ok) return team;

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
): Promise<ActionResult<{ updatedAt: string; itemIds: string[] }>> {
  return mutate(
    "save-practice-items",
    clubSlug,
    savePracticeItemsSchema,
    input,
    async (run) => {
      const { db, data, fromDb } = run;

      const practice = await findPractice(run, data.eventId);
      if (!practice.ok) return practice;

      const { data: result, error } = await db.rpc("save_practice_items", {
        p_plan: practice.data.planId,
        p_expected_updated_at: data.expectedUpdatedAt,
        p_items: data.items.map(toRpcItem),
      });
      if (error) return fromDb(error);

      const rpc = result as unknown as { updated_at: string; item_ids: string[] };
      return ok({ updatedAt: rpc.updated_at, itemIds: rpc.item_ids });
    },
  );
}

// ── Ejercicios de la biblioteca ─────────────────────────────────────────────────────────

/**
 * Los ejercicios publicados del club que se pueden añadir a una sesión, por título, para el
 * selector del constructor: lo mismo que busca la biblioteca (`searchDrills`, con su tope de
 * cien) con el texto y el objetivo (su slug) que se dan, y sin los borradores ni los archivados.
 * Con RLS un entrenador ve además sus propios borradores y la dirección todos: un borrador no se
 * ofrece aquí porque su ficha no la ve el resto del cuerpo técnico y la sesión la ve todo el
 * equipo. El texto y el objetivo pasan por el lector de filtros de la biblioteca: lo que no es
 * una búsqueda (caracteres de control, un objetivo que no es un slug) se ignora.
 *
 * Quien no gestiona sesiones recibe `NOT_FOUND` sin buscar nada; una lectura que falla es
 * `SAVE_FAILED` y se registra, para que el selector diga que no pudo cargar y deje reintentar.
 * Como el resto, el club se pide fuera de todo `try`: un club que no existe lanza el 404 de Next.
 */
export async function findDrills(
  clubSlug: string,
  input: FindDrillsInput,
): Promise<ActionResult<DrillSummary[]>> {
  const parsed = findDrillsSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const ctx = await requireClub(clubSlug);
  if (!can(ctx, "practice.manage")) return fail("NOT_FOUND");

  try {
    const { drills } = await searchDrills(ctx, parseDrillFilters(parsed.data));
    return ok(drills.filter((drill) => drill.status === "published"));
  } catch (error) {
    unstable_rethrow(error);
    logError("practice.find-drills", error);
    return fail("SAVE_FAILED");
  }
}

/**
 * Lo que `addDrillToPractice` lee de una sesión: su plan, la copia vigente (`updated_at` tal
 * cual lo da PostgREST, sin pasar por `Date`) y sus ítems, por `sort`, con las claves de
 * `save_practice_items`. Un ítem sin título propio (`title_override` a null: solo lo trae un
 * ejercicio) se devuelve así, sin inventarle uno: guardarlo no cambia lo que se ve.
 */
type PracticeToExtend = { planId: string; updatedAt: string; items: Json[] };

/**
 * El entreno `eventId` de este club con su plan y sus ítems; `NOT_FOUND` si no existe, es de
 * otro club, no es un entreno o no tiene plan. Como `findPractice`, acotado por
 * `organization_id` porque la función SQL escribe por id sin recibir el club.
 */
async function readPracticeToExtend(
  { db, ctx, fromDb }: Pick<Write<unknown>, "db" | "ctx" | "fromDb">,
  eventId: string,
): Promise<ActionResult<PracticeToExtend>> {
  const { data, error } = await db
    .from("events")
    .select(
      "id, practice_plans(id, updated_at, practice_items(id, sort, drill_id, title_override, phase, minutes, notes))",
    )
    .eq("organization_id", ctx.org.id)
    .eq("id", eventId)
    .eq("kind", "practice")
    .maybeSingle();
  if (error) return fromDb(error);

  const plans = data?.practice_plans;
  const plan = Array.isArray(plans) ? plans[0] : plans;
  if (!plan) return fail("NOT_FOUND");

  const items = [...(plan.practice_items ?? [])]
    .sort((a, b) => a.sort - b.sort)
    .map((item) => ({
      id: item.id,
      drill_id: item.drill_id,
      title: item.title_override,
      phase: item.phase,
      minutes: item.minutes,
      notes: item.notes,
    }));
  return ok({ planId: plan.id, updatedAt: plan.updated_at, items });
}

/**
 * Añade un ejercicio publicado de este club al final de una sesión, con `save_practice_items`:
 * la lista de ítems de ahora (cada uno con su `id`, que se conservan) más uno nuevo con el
 * título y los minutos mínimos del ejercicio, sin fase ni notas, y la copia esperada que se
 * leyó. Es lo que hace «Añadir a sesión» en la ficha de un ejercicio, sin pasar por el
 * constructor.
 *
 * Antes lee la sesión y el ejercicio filtrando por el club, y con RLS de quien llama: una sesión
 * que no es de este club o que no se ve, un entreno sin plan y un ejercicio que no existe, es de
 * otro club, está archivado o es un borrador que quien llama no ve son el mismo `NOT_FOUND`, sin
 * llamar a la función. Con 30 ítems no cabe otro: `INVALID` en `items`, con el mensaje del
 * constructor. Que además se gestione el equipo y que la sesión siga abierta lo dice la función
 * (`NOT_FOUND` y `SESSION_CLOSED`, como al guardar el constructor).
 *
 * Quien tiene la sesión abierta en el constructor, u otra persona, ha podido guardar entre la
 * lectura y el guardado: `STALE_COPY`. Aquí no hay nada escrito a medias que perder, así que se
 * relee la sesión (con sus ítems nuevos) y se repite, una sola vez: una segunda copia obsoleta
 * se devuelve. Devuelve el título del ejercicio añadido.
 */
export async function addDrillToPractice(
  clubSlug: string,
  input: AddDrillToPracticeInput,
): Promise<ActionResult<{ title: string }>> {
  return mutate(
    "add-drill-to-practice",
    clubSlug,
    addDrillToPracticeSchema,
    input,
    async (run) => {
      const { db, ctx, data, fromDb } = run;

      const practice = await readPracticeToExtend(run, data.eventId);
      if (!practice.ok) return practice;

      const { data: drill, error } = await db
        .from("drills")
        .select("id, title, min_minutes")
        .eq("organization_id", ctx.org.id)
        .eq("id", data.drillId)
        .eq("status", "published")
        .maybeSingle();
      if (error) return fromDb(error);
      if (!drill) return fail("NOT_FOUND");

      const added = {
        drill_id: drill.id,
        title: drill.title,
        phase: null,
        minutes: drill.min_minutes,
        notes: null,
      };

      async function saveOn({
        planId,
        updatedAt,
        items,
      }: PracticeToExtend): Promise<ActionResult<{ title: string }>> {
        if (items.length >= MAX_ITEMS) return fail("INVALID", { items: MAX_ITEMS_MESSAGE });

        const { error: saveError } = await db.rpc("save_practice_items", {
          p_plan: planId,
          p_expected_updated_at: updatedAt,
          p_items: [...items, added],
        });
        return saveError ? fromDb(saveError) : ok({ title: added.title });
      }

      const first = await saveOn(practice.data);
      if (first.ok || first.error !== "STALE_COPY") return first;

      const fresh = await readPracticeToExtend(run, data.eventId);
      if (!fresh.ok) return fresh;
      return saveOn(fresh.data);
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
