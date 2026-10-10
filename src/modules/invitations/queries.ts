import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import type { ClubContext } from "@/modules/tenancy/queries";
import type { Invitation, InvitationStatus } from "./types";

// Lectura de las invitaciones del club (`/admin/invites`, Task 10). Solo dirección las ve
// (RLS, `invitations_select_managed`): `mutate`/`can` ya lo exige antes de llegar aquí.

const COLUMNS =
  "id, email, role, team_id, staff_role, person_id, expires_at, accepted_at, cancelled_at, created_at, teams ( name )";

function statusOf(row: { accepted_at: string | null; cancelled_at: string | null; expires_at: string }): InvitationStatus {
  if (row.accepted_at !== null) return "accepted";
  if (row.cancelled_at !== null) return "cancelled";
  return new Date(row.expires_at).getTime() <= Date.now() ? "expired" : "pending";
}

/** Las invitaciones del club, de la más reciente a la más antigua. */
export async function listInvitations(ctx: ClubContext): Promise<Invitation[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invitations")
    .select(COLUMNS)
    .eq("organization_id", ctx.org.id)
    .order("created_at", { ascending: false });
  if (error) throwReadError("invitations.list", error);

  return data.map((row) => ({
    id: row.id,
    email: row.email,
    // El CHECK de la tabla solo deja 'admin' o 'coach'; el tipo de la columna es el enum entero.
    role: row.role as Invitation["role"],
    teamId: row.team_id,
    teamName: row.teams?.name ?? null,
    staffRole: row.staff_role,
    personId: row.person_id,
    status: statusOf(row),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}
