"use client";

import { useState, type ReactNode } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import type { Failure } from "@/lib/use-action";
import { BottomSheet } from "@/ui/bottom-sheet";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert } from "@/ui/form-field";

/**
 * Una hoja con un formulario corto (un objetivo, una nota). Cerrarla con cambios sin guardar
 * pregunta antes («¿Descartar los cambios?»): en el móvil, un toque fuera de la hoja es la forma
 * más fácil de perder lo escrito. Mientras guarda no se deja cerrar: el resultado llegaría a una
 * pantalla sin hoja. El fallo general va arriba; los de cada campo, en su campo.
 */
export function FormSheet({
  open,
  onClose,
  title,
  dirty,
  pending,
  failure,
  submitLabel,
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  dirty: boolean;
  pending: boolean;
  failure: Failure | null;
  submitLabel: string;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  function requestClose() {
    if (pending) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  const fieldsFailed = failure !== null && Object.keys(failure.fieldErrors).length > 0;

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={(next) => (next ? undefined : requestClose())}
        title={title}
        footer={
          <div className="flex flex-col gap-(--space-2)">
            <CTAButton variant="primary" block type="submit" form="form-sheet" disabled={pending}>
              {submitLabel}
            </CTAButton>
            <CTAButton variant="secondary" block type="button" onClick={requestClose} disabled={pending}>
              Cancelar
            </CTAButton>
          </div>
        }
      >
        <form
          id="form-sheet"
          noValidate
          aria-busy={pending}
          className="flex flex-col gap-(--space-4) px-(--space-4) pb-(--space-4)"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {failure ? (
            <FormAlert message={ACTION_ERROR_COPY[failure.error]} focus={!fieldsFailed} />
          ) : null}
          {children}
        </form>
      </BottomSheet>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="¿Descartar los cambios?"
        body="Lo que has escrito se perderá."
        confirmLabel="Descartar"
        cancelLabel="Seguir editando"
        tone="danger"
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
