import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/log";
import type { ClubContext } from "@/modules/tenancy/queries";
import type { ConsentStatus } from "./types";

// Lectura de qué consentimiento falta ([D7] términos, [D8] imagen). Con la sesión de quien
// entra: RLS ya limita cada consulta a sus propias filas y a sus propias tutelas.

/**
 * Si la cuenta de la sesión ya aceptó los términos de este club, y qué tutelas propias no
 * tienen todavía un consentimiento de imagen activo (ni dado, ni revocado desde entonces).
 */
export async function getConsentStatus(ctx: ClubContext): Promise<ConsentStatus> {
  const supabase = await createClient();
  const orgId = ctx.org.id;

  const [auth, terms] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("consents").select("id").eq("organization_id", orgId).eq("kind", "terms").limit(1),
  ]);
  if (auth.error) logError("consents.status.auth", auth.error);
  if (terms.error) throwReadError("consents.status.terms", terms.error);

  const userId = auth.data?.claims.sub;
  const needsTerms = terms.data.length === 0;

  const personId = ctx.membership.personId;
  if (personId === null || userId === undefined) {
    return { needsTerms, pendingGuardianships: [] };
  }

  const { data: wards, error: wardsError } = await supabase
    .from("guardianships")
    .select("child_person_id, child:people!guardianships_organization_id_child_person_id_fkey(first_name, last_name)")
    .eq("organization_id", orgId)
    .eq("guardian_person_id", personId);
  if (wardsError) throwReadError("consents.status.guardianships", wardsError);

  if (wards.length === 0) return { needsTerms, pendingGuardianships: [] };

  const { data: active, error: activeError } = await supabase
    .from("consents")
    .select("person_id")
    .eq("organization_id", orgId)
    .eq("kind", "image")
    .is("revoked_at", null)
    .in(
      "person_id",
      wards.map((ward) => ward.child_person_id),
    );
  if (activeError) throwReadError("consents.status.active", activeError);

  const decided = new Set(active.map((row) => row.person_id));

  return {
    needsTerms,
    pendingGuardianships: wards
      .filter((ward) => !decided.has(ward.child_person_id))
      .map((ward) => ({
        personId: ward.child_person_id,
        firstName: ward.child?.first_name ?? "",
        lastName: ward.child?.last_name ?? "",
      })),
  };
}
