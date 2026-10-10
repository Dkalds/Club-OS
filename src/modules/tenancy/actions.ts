"use server";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { mutate } from "@/lib/mutate";
import { deriveBrandColors, validateAccent } from "./brand-tools";
import { updateClubSchema, type UpdateClubInput } from "./schema";

// `/admin/club` (Fase 7 Task 10): el nombre y la zona horaria del club, su marca, su
// terminología y los dos textos de consentimiento, todo en una sola pantalla. Dos updates (el
// propio club y su marca), no una función SQL: cada tabla tiene su columna de escritura
// (20270112000500) y su política ya exige dirección del club, así que no hace falta más.
//
// El acento se valida aquí, no solo en el formato (`updateClubSchema`): si no llega a 4.5:1
// contra los fondos de plataforma, o su `on-accent` no llega a 4.5:1 contra él
// (design/README.md), no se guarda, y el mensaje lleva el tono más cercano que sí cumple.

export async function updateClub(clubSlug: string, input: UpdateClubInput): Promise<ActionResult<null>> {
  return mutate(
    { tag: "tenancy.update-club", permission: "club.manage", routes: ["/c/[club]"] },
    clubSlug,
    updateClubSchema,
    input,
    async ({ db, ctx, data, fromDb }) => {
      const accent = validateAccent(data.accent);
      if (!accent.ok) {
        const message =
          accent.reason === "FORMAT"
            ? "Un color en formato #rrggbb."
            : `No se lee bien sobre el fondo de la app. Prueba con ${accent.suggested}.`;
        return fail("INVALID", { accent: message });
      }

      const colors = deriveBrandColors(data.accent);

      const org = await db
        .from("organizations")
        .update({ name: data.name, timezone: data.timezone })
        .eq("id", ctx.org.id)
        .select("id");
      if (org.error) return fromDb(org.error);
      if (org.data.length === 0) return fail("NOT_FOUND");

      const branding = await db
        .from("organization_branding")
        .update({
          display_name: data.displayName,
          wordmark_sub: data.wordmarkSub,
          short_name: data.shortName,
          way_name: data.wayName,
          tagline: data.tagline,
          color_accent: colors.accent,
          color_accent_pressed: colors.accentPressed,
          color_on_accent: colors.onAccent,
          color_accent_soft: colors.accentSoft,
          terminology: {
            ...(data.wayTerm === null ? {} : { way: data.wayTerm }),
            ...(data.standardsTerm === null ? {} : { standards: data.standardsTerm }),
          },
          terms_text: data.termsText,
          image_consent_text: data.imageConsentText,
        })
        .eq("organization_id", ctx.org.id)
        .select("organization_id");
      if (branding.error) return fromDb(branding.error);
      if (branding.data.length === 0) return fail("NOT_FOUND");

      return ok(null);
    },
  );
}
