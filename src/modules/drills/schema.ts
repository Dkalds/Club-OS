import { z } from "zod";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { DIAGRAM_ERROR, validateDiagramFile } from "@/modules/media/diagram-file";
import type { Board } from "@/modules/board/types";
import type { DrillDetail } from "./types";

// Entrada de las acciones de ejercicios. Los límites son los CHECK de
// `20261103000100_drills.sql` y las claves del payload de `save_drill`: con ellos, lo que la
// base de datos rechazaría (un entero con decimales, un rango al revés, un id que no es uuid,
// un texto demasiado largo) se queda aquí, con su mensaje y el campo al que señalar, y nunca
// llega a `save_drill` como un `22P02` o un `23514` sin campo. Los esquemas viven aparte porque
// un módulo `'use server'` solo puede exportar funciones asíncronas.

/**
 * Un enlace de YouTube o Vimeo por https, con el host exacto: `youtube.com.evil.com` y los
 * enlaces que solo nombran YouTube en la query no pasan. Es el patrón del CHECK de
 * `drills.video_url`.
 */
export const VIDEO_URL_RE = /^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com)\/\S*$/;

/**
 * Lo que manda el formulario al crear o guardar un ejercicio: la ficha menos lo que no se
 * escribe (el id, el estado, el autor, las fechas, la pizarra, la URL firmada del diagrama y lo
 * que se calcula al leer). Los principios y Standards van como ids (`principleIds`, `standardIds`,
 * que la ficha ya trae con todos los vínculos), no como lo que se muestra.
 */
export type DrillInput = Omit<
  DrillDetail,
  | "id"
  | "status"
  | "createdBy"
  | "focus"
  | "board"
  | "diagramUrl"
  | "principles"
  | "principlesSectionSlug"
  | "standards"
  | "createdByMe"
  | "updatedAt"
>;

/** Guardar cambios: el ejercicio, y el `updated_at` de la copia que se estaba editando. */
export type UpdateDrillInput = { drillId: string; expectedUpdatedAt: string; drill: DrillInput };

/** Publicar o archivar: solo hace falta saber cuál. */
export type DrillIdInput = { drillId: string };

// ── Mensajes ─────────────────────────────────────────────────────────────────────────────

const TITLE_MESSAGE = "Escribe un título de 3 a 80 caracteres.";
const SUMMARY_TOO_LONG = "El resumen admite hasta 200 caracteres.";
const OBJECTIVE_TOO_LONG = "El objetivo admite hasta 500 caracteres.";
const SETUP_TOO_LONG = "La organización admite hasta 5000 caracteres.";
const PLAYERS_RANGE = "Elige entre 1 y 40 jugadores.";
const PLAYERS_ORDER = "El máximo de jugadores no puede ser menor que el mínimo.";
const MINUTES_RANGE = "Elige entre 1 y 120 minutos.";
const MINUTES_ORDER = "La duración máxima no puede ser menor que la mínima.";
const AGE_RANGE = "Elige una edad entre 8 y 18.";
const AGE_ORDER = "La edad máxima no puede ser menor que la mínima.";
const EQUIPMENT_COUNT = "El material admite hasta 12 elementos.";
const VIDEO_MESSAGE = "Pega un enlace de YouTube o Vimeo que empiece por https://.";
const FOCUS_MISSING = "Elige al menos un objetivo.";

const MAX_POINTS = 8;
const MAX_KEY_POINTS = 3;
const MAX_VARIANTS = 5;

// ── Piezas ───────────────────────────────────────────────────────────────────────────────

// Lo que llega de un formulario no es de fiar: un id que no tenga forma de uuid no llega a la
// base de datos (daría un `22P02`). Se acepta cualquier uuid escrito con guiones, sin mirar
// versión ni variante, como en la metodología.
const id = z.guid(ACTION_ERROR_COPY.NOT_FOUND);

function emptyToNull(text: string | null): string | null {
  return text === "" ? null : text;
}

/** Texto opcional: recortado, de `max` caracteres como mucho; vacío o null se guarda como null. */
function optionalText(max: number, tooLong: string) {
  return z.string().trim().max(max, tooLong).nullable().transform(emptyToNull);
}

/**
 * Un entero dentro de su rango, venga como venga (`1.5`, `NaN`, un texto o un null): todo con
 * el mismo mensaje, que dice el rango.
 */
function integerBetween(min: number, max: number, message: string) {
  return z.number({ error: message }).int(message).min(min, message).max(max, message);
}

/**
 * `char_length(title) between 3 and 80`: la base de datos cuenta caracteres, no unidades
 * UTF-16. Para el máximo da igual (por unidades se es más estricto), pero un título de dos
 * emojis tiene 4 unidades y solo 2 caracteres: pasaría un `min(3)` y la base lo rechazaría.
 */
const title = z
  .string({ error: TITLE_MESSAGE })
  .trim()
  .refine((text) => {
    const characters = Array.from(text).length;
    return characters >= 3 && characters <= 80;
  }, TITLE_MESSAGE);

const videoUrl = z
  .string({ error: VIDEO_MESSAGE })
  .trim()
  .max(300, VIDEO_MESSAGE)
  .refine((url) => url === "" || VIDEO_URL_RE.test(url), VIDEO_MESSAGE)
  .nullable()
  .transform(emptyToNull);

/**
 * El material: cada elemento se recorta y los vacíos se descartan antes de contar, para que
 * un hueco en blanco del formulario no gaste uno de los 12.
 */
const equipment = z
  .array(z.string().trim())
  .transform((items) => items.filter((item) => item !== ""))
  .pipe(z.array(z.string()).max(12, EQUIPMENT_COUNT));

/**
 * Los puntos de coaching. Todo lo que está mal en la lista se señala en `coachingPoints`, la
 * lista entera, con el mensaje de lo primero que falla: el formulario lo enseña bajo la
 * lista. Cada punto se recorta antes de mirarlo.
 *
 * El error lleva `continue: true`: Zod aborta las comprobaciones del objeto (los máximos no
 * bajan de los mínimos, más abajo) tras un error que no lo lleve, y quien arregla la lista
 * descubriría un segundo error que ya estaba. Vale igual para las variantes.
 */
const coachingPoints = z
  .array(z.object({ text: z.string().trim(), isKey: z.boolean() }))
  .check((ctx) => {
    const points = ctx.value;
    const problem =
      points.some((point) => point.text === "")
        ? "Escribe el punto o quítalo."
        : points.some((point) => point.text.length > 140)
          ? "Cada punto admite hasta 140 caracteres."
          : points.filter((point) => point.isKey).length > MAX_KEY_POINTS
            ? `Marca como clave ${MAX_KEY_POINTS} puntos como máximo.`
            : points.length > MAX_POINTS
              ? `Un ejercicio admite hasta ${MAX_POINTS} puntos.`
              : null;

    if (problem) ctx.issues.push({ code: "custom", message: problem, input: points, continue: true });
  });

/** Las variantes, con la misma regla que los puntos: todo se señala en `variants`. */
const variants = z
  .array(
    z.object({
      title: z.string().trim(),
      description: z.string().trim().nullable().transform(emptyToNull),
    }),
  )
  .check((ctx) => {
    const items = ctx.value;
    const problem = items.some((variant) => variant.title === "")
      ? "Escribe el título de la variante o quítala."
      : items.some((variant) => variant.title.length > 80)
        ? "El título de la variante admite hasta 80 caracteres."
        : items.some((variant) => (variant.description?.length ?? 0) > 500)
          ? "La descripción de la variante admite hasta 500 caracteres."
          : items.length > MAX_VARIANTS
            ? `Un ejercicio admite hasta ${MAX_VARIANTS} variantes.`
            : null;

    if (problem) ctx.issues.push({ code: "custom", message: problem, input: items, continue: true });
  });

// ── El ejercicio ─────────────────────────────────────────────────────────────────────────

/**
 * `diagramMediaId` es una clave obligatoria (`uuid | null`): al guardar, `save_drill` deja el
 * ejercicio tal como dice el payload, y un diagrama ausente lo quitaría. Quien no lo cambia
 * reenvía el actual.
 */
const drillFields = z.object({
  title,
  summary: optionalText(200, SUMMARY_TOO_LONG),
  objective: optionalText(500, OBJECTIVE_TOO_LONG),
  setupMd: optionalText(5000, SETUP_TOO_LONG),
  minPlayers: integerBetween(1, 40, PLAYERS_RANGE),
  maxPlayers: integerBetween(1, 40, PLAYERS_RANGE),
  minMinutes: integerBetween(1, 120, MINUTES_RANGE),
  maxMinutes: integerBetween(1, 120, MINUTES_RANGE),
  minAge: integerBetween(8, 18, AGE_RANGE),
  maxAge: integerBetween(8, 18, AGE_RANGE).nullable(),
  equipment,
  videoUrl,
  diagramMediaId: id.nullable(),
  coachingPoints,
  variants,
  focusAreaIds: z.array(id, { error: FOCUS_MISSING }).min(1, FOCUS_MISSING),
  principleIds: z.array(id),
  standardIds: z.array(id),
});

/**
 * Los máximos no bajan de los mínimos. El mensaje va en el máximo (con `path`: sin él se
 * perdería, ver `fromZodError`). Solo se comprueba si los seis números ya son números; si no,
 * el error de cada uno es el que se enseña.
 */
export const drillInputSchema = drillFields
  .refine((drill) => drill.maxPlayers >= drill.minPlayers, {
    path: ["maxPlayers"],
    error: PLAYERS_ORDER,
  })
  .refine((drill) => drill.maxMinutes >= drill.minMinutes, {
    path: ["maxMinutes"],
    error: MINUTES_ORDER,
  })
  .refine((drill) => drill.maxAge === null || drill.maxAge >= drill.minAge, {
    path: ["maxAge"],
    error: AGE_ORDER,
  }) satisfies z.ZodType<DrillInput, DrillInput>;

// ── Guardar cambios, publicar y archivar ─────────────────────────────────────────────────

/**
 * El id del ejercicio y la copia que se editaba: obligatorios y con texto. Sin id, `save_drill`
 * crearía un borrador nuevo en vez de guardar; sin copia, daría `STALE_COPY` siempre. La copia
 * es el `updated_at` tal cual lo devolvió la base de datos (microsegundos y desfase): se
 * recorta pero no se interpreta, y no pasa nunca por `Date`.
 */
const updateKeys = z.object({ drillId: id, expectedUpdatedAt: z.string().trim().min(1) });

/**
 * `{ drillId, expectedUpdatedAt, drill }` llega anidado, pero se valida plano: así los errores
 * de campo llevan las mismas claves que al crear (`title`, no `drill.title`) y el formulario
 * lee los mismos en alta y en edición. Lo que el cliente ponga dentro de `drill` junto al id
 * o a la copia no los pisa.
 */
function flattenUpdate(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;

  const { drillId, expectedUpdatedAt, drill } = raw as Record<string, unknown>;
  const fields = typeof drill === "object" && drill !== null ? drill : {};

  return { ...fields, drillId, expectedUpdatedAt };
}

/** Lo que valida `updateDrill`, ya plano: el id, la copia y los campos del ejercicio. */
export const updateDrillSchema = z.preprocess(
  flattenUpdate,
  z.intersection(updateKeys, drillInputSchema),
);

export const drillIdSchema = z.object({ drillId: id });

// ── La pizarra ───────────────────────────────────────────────────────────────────────────

/**
 * Guardar la pizarra de un ejercicio: cuál, la copia que se editaba y la pizarra, o `null`
 * para quitarla. Aquí solo se pide que venga: su forma (fichas, pasos, movimientos y topes) la
 * comprueba la acción con `parseBoard`, el mismo validador que usa quien la lee.
 */
export const saveDrillBoardSchema = z.object({
  drillId: id,
  expectedUpdatedAt: z.string().trim().min(1),
  board: z.unknown(),
});

/** Lo que recibe `saveDrillBoard`. */
export type SaveDrillBoardInput = { drillId: string; expectedUpdatedAt: string; board: Board | null };

// ── Subir el diagrama ────────────────────────────────────────────────────────────────────

/**
 * Lo que valida `uploadDrillDiagram`: el ejercicio y el fichero. El fichero va bajo la clave
 * `diagram`, que es la del campo del formulario al que apunta `fieldErrors`; en el `FormData`
 * viaja como `file` y la acción lo renombra antes de validar. Aquí solo se mira lo que se sabe
 * sin leerlo: que es un `File` y que su tipo declarado y su tamaño valen (`validateDiagramFile`,
 * la misma comprobación que hace el formulario en el navegador). Los bytes los mira la acción,
 * ya autorizada: leer el fichero es asíncrono y un esquema síncrono no puede. Cualquier problema
 * del fichero, sea cual sea, da el mismo mensaje.
 */
export const diagramUploadSchema = z.object({
  drillId: id,
  diagram: z
    .instanceof(File, { error: DIAGRAM_ERROR })
    .refine((file) => validateDiagramFile(file) === "ok", DIAGRAM_ERROR),
});
