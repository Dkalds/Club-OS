import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

/**
 * Acepta, para la cuenta de la sesión, toda invitación pendiente y vigente: crea la
 * membresía (y la persona, si hacía falta) en cada club nuevo. Se llama en cada entrada,
 * antes de listar los clubes (`/select-club`, Task 9): sin invitaciones, no hace nada, y
 * no es un error. Los slugs devueltos son los clubes nuevos, por si hiciera falta
 * distinguirlos; un fallo se registra y no interrumpe la entrada.
 */
export async function acceptPendingInvitations(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("accept_pending_invitations");
  if (error) {
    logError("invitations.accept", error);
    return [];
  }

  return data ?? [];
}
