import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import type { ClubContext } from "@/modules/tenancy/queries";
import type { AdminPerson } from "./types";

// Lectura de las personas del club para Gestión (`/admin/people`, Fase 7 Task 11): todas,
// archivadas incluidas. Quien llama ya ha pasado por `requireClub` y `requireAdmin`.

/** Todas las personas del club, de la más reciente a la más antigua. */
export async function listPeopleForAdmin(ctx: ClubContext): Promise<AdminPerson[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("people")
    .select("id, first_name, last_name, birth_year, archived_at, memberships ( user_id )")
    .eq("organization_id", ctx.org.id)
    .order("created_at", { ascending: false });
  if (error) throwReadError("people.admin.list", error);

  return data.map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthYear: row.birth_year,
    archivedAt: row.archived_at,
    hasAccount: row.memberships.length > 0,
  }));
}
