import { throwReadError } from "@/lib/read-error";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/log";
import type { ClubContext } from "@/modules/tenancy/queries";
import type { ConsentStatus } from "./types";

// Lectura de qué consentimiento falta ([D7] términos, [D8] imagen). Con la sesión de quien
// entra: RLS ya limita cada consulta a sus propias filas y a sus propias tutelas.

/** Los dos textos vigentes del club, para la pantalla de consentimiento. */
export async function getConsentTexts(
  ctx: ClubContext,
): Promise<{ termsText: string; imageConsentText: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_branding")
    .select("terms_text, image_consent_text")
    .eq("organization_id", ctx.org.id)
    .single();
  if (error) throwReadError("consents.texts", error);

  return { termsText: data.terms_text, imageConsentText: data.image_consent_text };
}

/**
 * Si la cuenta de la sesión ya aceptó los términos de este club, y qué tutelas propias no
 * tienen todavía un consentimiento de imagen activo (ni dado, ni revocado desde entonces).
 */
export async function getConsentStatus(ctx: ClubContext): Promise<ConsentStatus> {
  const supabase = await createClient();
  const orgId = ctx.org.id;

  const auth = await supabase.auth.getClaims();
  if (auth.error) logError("consents.status.auth", auth.error);
  const userId = auth.data?.claims.sub;
  if (userId === undefined) return { needsTerms: true, pendingGuardianships: [] };

  // Por `granted_by`, no solo por club: a dirección RLS le deja ver los términos de todo el
  // club, y uno ajeno no cuenta como suyo.
  const terms = await supabase
    .from("consents")
    .select("id")
    .eq("organization_id", orgId)
    .eq("kind", "terms")
    .eq("granted_by", userId)
    .limit(1);
  if (terms.error) throwReadError("consents.status.terms", terms.error);
  const needsTerms = terms.data.length === 0;

  const personId = ctx.membership.personId;
  if (personId === null) return { needsTerms, pendingGuardianships: [] };

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
