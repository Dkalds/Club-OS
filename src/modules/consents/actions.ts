"use server";

import { z } from "zod";
import { ok, type ActionResult } from "@/lib/action-result";
import { mutate as runMutation, type Write } from "@/lib/mutate";
import {
  consentIdSchema,
  grantImageConsentSchema,
  type ConsentIdInput,
  type GrantImageConsentInput,
} from "./schema";

// Acciones de consentimiento ([D7] términos, [D8] imagen). Las tres van por las funciones SQL
// `security definer` de la Fase 7 Task 2, que deciden de verdad quién puede dar o revocar cada
// uno (la propia guardianship, o dirección): sin permiso de rol aquí, para cualquier miembro
// del club (`permission` ausente en `mutate`, decide RLS/la función).

const noInput = z.object({});

function mutate<D, T>(
  name: string,
  clubSlug: string,
  schema: z.ZodType<D>,
  input: unknown,
  write: (run: Write<D>) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  return runMutation({ tag: `consents.${name}`, routes: ["/c/[club]"] }, clubSlug, schema, input, write);
}

/** Acepta los términos vigentes de este club, una vez por cuenta ([D7]). */
export async function acceptTerms(clubSlug: string): Promise<ActionResult<{ consentId: string }>> {
  return mutate("accept-terms", clubSlug, noInput, {}, async ({ db, ctx, fromDb }) => {
    const { data: consentId, error } = await db.rpc("grant_terms_consent", { p_org: ctx.org.id });
    if (error) return fromDb(error);

    return ok({ consentId });
  });
}

/** El tutor da el consentimiento de imagen de su hijo o hija ([D8]). */
export async function grantImageConsent(
  clubSlug: string,
  input: GrantImageConsentInput,
): Promise<ActionResult<{ consentId: string }>> {
  return mutate("grant-image", clubSlug, grantImageConsentSchema, input, async ({ db, data, fromDb }) => {
    const { data: consentId, error } = await db.rpc("grant_image_consent", { p_person: data.personId });
    if (error) return fromDb(error);

    return ok({ consentId });
  });
}

/** Dirección revoca un consentimiento de imagen. No se deshace ([D9]: la fila no se borra). */
export async function revokeImageConsent(clubSlug: string, input: ConsentIdInput): Promise<ActionResult<null>> {
  return mutate("revoke-image", clubSlug, consentIdSchema, input, async ({ db, data, fromDb }) => {
    const { error } = await db.rpc("revoke_image_consent", { p_consent: data.consentId });
    if (error) return fromDb(error);

    return ok(null);
  });
}
