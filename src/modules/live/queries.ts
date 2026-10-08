import { signedUrl } from "@/modules/media/storage";
import { createClient } from "@/lib/supabase/server";
import type { ClubContext } from "@/modules/tenancy/queries";
import type { LiveItem, LiveSession } from "./types";

const ITEM_COLUMNS = `
  id, sort, phase, minutes, title_override, drill_id,
  drills (
    title, diagram_media_id,
    media_assets ( path ),
    drill_coaching_points ( is_key, sort, text ),
    drill_standards ( standards ( number, title ) )
  )
`;

const EVENT_COLUMNS = `
  id, organization_id, status, starts_at, ends_at,
  practice_plans ( id, title, practice_items ( ${ITEM_COLUMNS} ) )
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
  drills: DrillRow;
};

async function mapItem(item: ItemRow, endsAt: string): Promise<LiveItem> {
  const drill = item.drills;
  const title = item.title_override ?? drill?.title ?? "Ejercicio";

  let diagramUrl: string | null = null;
  if (drill?.media_assets?.path) {
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

  return { id: item.id, title, phase: item.phase, minutes: item.minutes, diagramUrl, keyPoints, standards };
}

export async function getLiveSession(ctx: ClubContext, eventId: string): Promise<LiveSession | null> {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", eventId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();

  if (!event || event.status !== "scheduled") return null;

  const plan = Array.isArray(event.practice_plans)
    ? event.practice_plans[0]
    : event.practice_plans;
  if (!plan) return null;

  const rawItems: ItemRow[] = [...(plan.practice_items ?? [])].sort((a, b) => a.sort - b.sort);
  const items = await Promise.all(rawItems.map((item) => mapItem(item, event.ends_at)));

  return {
    eventId,
    clubSlug: ctx.org.slug,
    title: plan.title,
    startsAt: event.starts_at,
    items,
  };
}
