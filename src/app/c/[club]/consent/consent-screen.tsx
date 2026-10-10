"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { acceptTerms, grantImageConsent } from "@/modules/consents/actions";
import type { PendingGuardianship } from "@/modules/consents/types";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert } from "@/ui/form-field";

/**
 * Términos (obligatorio, [D7]) y, si hay tutelas, imagen por cada hijo o hija (opcional,
 * [D8]), en la misma pantalla de primer login. Dar o no el consentimiento de imagen no
 * bloquea nada: «Ahora no» solo la quita de esta lista, sin llamar a ninguna acción.
 */
export function ConsentScreen({
  clubSlug,
  needsTerms,
  termsText,
  imageConsentText,
  pendingGuardianships,
}: {
  clubSlug: string;
  needsTerms: boolean;
  termsText: string;
  imageConsentText: string;
  pendingGuardianships: PendingGuardianship[];
}) {
  const router = useRouter();
  const terms = useAction();
  const image = useAction();
  const [termsAccepted, setTermsAccepted] = useState(!needsTerms);
  const [pending, setPending] = useState(pendingGuardianships);

  function skip(personId: string) {
    setPending((rows) => rows.filter((row) => row.personId !== personId));
  }

  function grant(personId: string) {
    image.run(() => grantImageConsent(clubSlug, { personId }), () => skip(personId));
  }

  return (
    <main className="mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-(--space-6) px-(--space-4) py-(--space-12)">
      <div className="flex flex-col gap-(--space-2)">
        <p className="font-display text-title uppercase text-ink-2">CLUB OS</p>
        <h1 className="font-display text-display-l uppercase">Antes de entrar</h1>
      </div>

      {!termsAccepted && (
        <Card className="gap-(--space-4)">
          <h2 className="font-display text-display-s uppercase">Condiciones de uso</h2>
          <p className="whitespace-pre-wrap text-body text-ink-2">{termsText}</p>
          {terms.failure && <FormAlert message={ACTION_ERROR_COPY[terms.failure.error]} />}
          <CTAButton
            variant="primary"
            block
            disabled={terms.pending}
            onClick={() => terms.run(() => acceptTerms(clubSlug), () => setTermsAccepted(true))}
          >
            Aceptar
          </CTAButton>
        </Card>
      )}

      {termsAccepted &&
        pending.map((ward) => (
          <Card key={ward.personId} className="gap-(--space-4)">
            <h2 className="font-display text-display-s uppercase">
              Imagen de {ward.firstName} {ward.lastName}
            </h2>
            <p className="whitespace-pre-wrap text-body text-ink-2">{imageConsentText}</p>
            {image.failure && <FormAlert message={ACTION_ERROR_COPY[image.failure.error]} />}
            <div className="flex gap-(--space-3)">
              <CTAButton variant="secondary" disabled={image.pending} onClick={() => skip(ward.personId)}>
                Ahora no
              </CTAButton>
              <CTAButton variant="primary" disabled={image.pending} onClick={() => grant(ward.personId)}>
                Dar consentimiento
              </CTAButton>
            </div>
          </Card>
        ))}

      {termsAccepted && pending.length === 0 && (
        <CTAButton variant="primary" block onClick={() => router.push(`/c/${clubSlug}`)}>
          Continuar
        </CTAButton>
      )}
    </main>
  );
}
