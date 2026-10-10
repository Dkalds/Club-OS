import { adminPage } from "@/lib/guards";
import { getConsentTexts } from "@/modules/consents/queries";
import { ClubScreen } from "./club-screen";

/**
 * El nombre y la zona horaria del club, su marca, su terminología y los dos textos de
 * consentimiento, todo en una pantalla (`updateClub`, Fase 7 Task 10).
 */
export default adminPage(async (ctx) => {
  const texts = await getConsentTexts(ctx);

  return (
    <ClubScreen
      clubSlug={ctx.org.slug}
      org={ctx.org}
      branding={ctx.branding}
      termsText={texts.termsText}
      imageConsentText={texts.imageConsentText}
    />
  );
});
