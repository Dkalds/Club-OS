import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import type { ClubContext } from "@/modules/tenancy/queries";

// Lectura de la cola de revisión de Gestión (`/admin/drills`, Fase 7 Task 12): los
// borradores de TODO el club, no solo los propios ([D11]), del más antiguo al más nuevo:
// el que lleva más tiempo esperando revisión va primero. `can_see_drill` ya deja a dirección
// ver cualquier borrador del club, no solo el suyo (20261103000100).

export type DraftDrill = { id: string; title: string; summary: string | null; createdAt: string };

/** Los ejercicios en borrador del club entero, del más antiguo al más nuevo. */
export async function listDraftDrillsForAdmin(ctx: ClubContext): Promise<DraftDrill[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("drills")
    .select("id, title, summary, created_at")
    .eq("organization_id", ctx.org.id)
    .eq("status", "draft")
    .order("created_at", { ascending: true });
  if (error) throwReadError("drills.admin.drafts", error);

  return data.map((row) => ({ id: row.id, title: row.title, summary: row.summary, createdAt: row.created_at }));
}
