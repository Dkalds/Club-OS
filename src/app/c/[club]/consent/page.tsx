import { requireClub } from "@/lib/guards";
import { getConsentStatus, getConsentTexts } from "@/modules/consents/queries";
import { ConsentScreen } from "./consent-screen";

// Depende de la sesión y de qué falte aceptar: nunca se prerenderiza ni se comparte.
export const dynamic = "force-dynamic";

/**
 * Términos (obligatorio, [D7]) y, si hay tutelas, imagen por cada hijo o hija (opcional,
 * [D8]). Adonde redirige el marco de cada área (`requireTerms`) mientras falten los
 * términos; aquí no se vuelve a redirigir (sería un bucle), solo se pide el contexto.
 *
 * Fuera de `(app)` y de `admin`: solo lleva la marca del club (`../layout.tsx`), sin su
 * navegación, porque quien llega aquí puede no tener terminada su propia alta.
 */
export default async function ConsentPage({ params }: PageProps<"/c/[club]/consent">) {
  const { club } = await params;
  const ctx = await requireClub(club);

  const [status, texts] = await Promise.all([getConsentStatus(ctx), getConsentTexts(ctx)]);

  return (
    <ConsentScreen
      clubSlug={ctx.org.slug}
      needsTerms={status.needsTerms}
      termsText={texts.termsText}
      imageConsentText={texts.imageConsentText}
      pendingGuardianships={status.pendingGuardianships}
    />
  );
}
