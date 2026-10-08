import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { liveProgressSchema } from "@/modules/live/schema";

const APP_ROUTE = "/c/[club]/(app)";

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.nextUrl.origin;
  if (!origin || origin !== host) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID" }, { status: 422 });
  }

  const parsed = liveProgressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 422 });
  }

  const { clubSlug, eventId, items, finished, actualMinutes } = parsed.data;

  const { data: event } = await supabase
    .from("events")
    .select("id, organizations!inner(slug)")
    .eq("id", eventId)
    .eq("organizations.slug", clubSlug)
    .maybeSingle();

  if (!event) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const { data, error } = await supabase.rpc("record_live_progress", {
    p_event: eventId,
    p_items: items.map((item) => ({
      id: item.id,
      completed: item.completed,
      actual_minutes: item.actualMinutes,
    })),
    p_finished: finished,
    p_actual_minutes: actualMinutes,
  });

  if (error) {
    if (error.code === "P0001" && error.message === "SESSION_CLOSED") {
      return NextResponse.json({ error: "SESSION_CLOSED" }, { status: 409 });
    }
    if (error.code === "P0002" || (error.code === "P0001" && error.message === "NOT_FOUND")) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    logError("live.record-progress", error);
    return NextResponse.json({ error: "SAVE_FAILED" }, { status: 500 });
  }

  revalidatePath(APP_ROUTE, "layout");

  return NextResponse.json(data ?? {}, { status: 200 });
}
