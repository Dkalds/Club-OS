"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { deletePracticeTemplate } from "@/modules/practice/actions";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert } from "@/ui/form-field";

/**
 * «Borrar plantilla», en la pantalla que la usa. Pregunta antes con `ConfirmDialog`: borrar no se
 * deshace, aunque las sesiones creadas con ella no cambian. El diálogo se queda abierto, con sus
 * botones parados, hasta que la acción termina. Si ha ido bien, vuelve a «Plantillas»; si no, el
 * motivo queda en la página, donde se puede volver a intentar.
 */
export function TemplateDelete({ clubSlug, templateId }: { clubSlug: string; templateId: string }) {
  const router = useRouter();
  const { pending, failure, run } = useAction();
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);

  function confirm() {
    run(
      async () => {
        try {
          return await deletePracticeTemplate(clubSlug, { templateId });
        } finally {
          setConfirming(false);
        }
      },
      () => {
        setDeleted(true);
        router.push(`/c/${clubSlug}/train?scope=templates`);
      },
    );
  }

  return (
    <>
      <CTAButton variant="danger" block disabled={pending || deleted} onClick={() => setConfirming(true)}>
        Borrar plantilla
      </CTAButton>
      {failure ? <FormAlert message={ACTION_ERROR_COPY[failure.error]} /> : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="¿Borrar esta plantilla?"
        body="Las sesiones que creaste con ella no cambian. No se puede deshacer."
        confirmLabel="Borrar plantilla"
        cancelLabel="Volver"
        tone="danger"
        pending={pending}
        onConfirm={confirm}
      />
    </>
  );
}
