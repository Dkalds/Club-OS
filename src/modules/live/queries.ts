import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import { UUID_RE } from "@/lib/uuid";
import { parseBoard } from "@/modules/board/schema";
import { signedUrl } from "@/modules/media/storage";
import type { ClubContext } from "@/modules/tenancy/queries";
import type { LiveItem, LiveSession } from "./types";

const ITEM_COLUMNS = `
  id, sort, phase, minutes, title_override, drill_id, completed, actual_minutes,
  drills (
    title, diagram_media_id, video_url, board, setup_md,
    media_assets ( path ),
    drill_coaching_points ( is_key, sort, text ),
    drill_standards ( standards ( number, title ) )
  )
`;

const EVENT_COLUMNS = `
  id, organization_id, status, starts_at, ends_at,
  practice_plans ( id, title, updated_at, live_started_at, live_position, practice_items ( ${ITEM_COLUMNS} ) )
`;

const MS_10_MIN = 10 * 60;
const MS_6_H = 6 * 3600;

function expiresIn(endsAt: string): number {
  const endsMs = new Date(endsAt).getTime() + 2 * 3600 * 1000;
  const remaining = Math.floor((endsMs - Date.now()) / 1000);
  return Math.min(Math.max(remaining, MS_10_MIN), MS_6_H);
}

type DrillRow = {
  title: string;
  diagram_media_id: string | null;
  video_url: string | null;
  board?: Json | null;
  setup_md?: string | null;
  media_assets: { path: string } | null;
  drill_coaching_points: { is_key: boolean; sort: number; text: string }[];
  drill_standards: { standards: { number: number; title: string } | null }[];
} | null;

type ItemRow = {
  id: string;
  sort: number;
  phase: string | null;
  minutes: number;
  title_override: string | null;
  drill_id: string | null;
  completed: boolean | null;
  actual_minutes: number | null;
  drills: DrillRow;
};

async function mapItem(item: ItemRow, endsAt: string): Promise<LiveItem> {
  const drill = item.drills;
  const title = item.title_override ?? drill?.title ?? "Ejercicio";

  // Con pizarra no hace falta la imagen: manda la pizarra, y no se firma una URL que no se usa.
  const board = parseBoard(drill?.board);
  const setup = drill?.setup_md?.trim();

  let diagramUrl: string | null = null;
  if (!board && drill?.media_assets?.path) {
    diagramUrl = await signedUrl(drill.media_assets.path, expiresIn(endsAt));
  }

  const keyPoints = drill
    ? drill.drill_coaching_points
        .filter((p) => p.is_key)
        .sort((a, b) => a.sort - b.sort)
        .slice(0, 3)
        .map((p) => p.text)
    : [];

  const standards = drill
    ? drill.drill_standards
        .map((ds) => ds.standards)
        .filter((s): s is { number: number; title: string } => s !== null)
    : [];

  return {
    id: item.id,
    title,
    phase: item.phase,
    minutes: item.minutes,
    ...(board ? { board } : {}),
    ...(setup ? { setup } : {}),
    diagramUrl,
    videoUrl: drill?.video_url ?? null,
    keyPoints,
    standards,
    completed: item.completed,
    actualMinutes: item.actual_minutes,
  };
}

/**
 * Lo que hay detrás de `/live` de un evento: la sesión que se puede dirigir (`open`), o que ya
 * está hecha (`done`: no hay directo, la ficha es su resumen).
 */
export type LiveLookup = { status: "open"; session: LiveSession } | { status: "done" };

/**
 * La sesión de entrenamiento de un evento para el directo, con lo que el servidor sabe de él
 * (`live`: cuándo se inició y por qué ejercicio va). `null` si el id no es un uuid, si la fila
 * no llega (no existe, es de otro club o RLS no la deja ver), si no es un entreno con plan o si
 * está cancelada: quien llama responde con el mismo 404. Si Supabase falla, lanza.
 */
export async function getLiveSession(ctx: ClubContext, eventId: string): Promise<LiveLookup | null> {
  if (!UUID_RE.test(eventId)) return null;

  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", eventId)
    .eq("organization_id", ctx.org.id)
    .eq("kind", "practice")
    .maybeSingle();
  if (error) throwReadError("live.session", error);

  if (!event || event.status === "cancelled") return null;

  const plan = Array.isArray(event.practice_plans)
    ? event.practice_plans[0]
    : event.practice_plans;
  if (!plan) return null;
  if (event.status === "done") return { status: "done" };

  const rawItems: ItemRow[] = [...(plan.practice_items ?? [])].sort((a, b) => a.sort - b.sort);
  const items = await Promise.all(rawItems.map((item) => mapItem(item, event.ends_at)));

  return {
    status: "open",
    session: {
      eventId,
      clubSlug: ctx.org.slug,
      title: plan.title,
      startsAt: event.starts_at,
      items,
      live: { startedAt: plan.live_started_at, position: plan.live_position, updatedAt: plan.updated_at },
    },
  };
}
