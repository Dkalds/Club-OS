"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useCallback, useRef, useState } from "react";
import { CTAButton } from "./cta-button";

/**
 * Una pregunta que hay que contestar antes de seguir: quitar algo, salir sin guardar. Sale
 * centrada, sobre el velo de plataforma (`scrim`), en un panel `surface-1` con `radius-xl` y
 * `shadow-sheet`.
 *
 * Es un `AlertDialog` de Radix (`role="alertdialog"`), no un `Dialog` como `BottomSheet`: pide
 * una decisión, así que el fondo no lo cierra, y al abrirse el foco cae en «cancelar», la
 * salida que no pierde nada. El foco queda atrapado dentro y, al cerrarse, vuelve a quien lo
 * tenía. `title` es su nombre accesible y `body` su descripción.
 *
 * Quien lo monta controla `open` y recibe `onOpenChange`. «Cancelar» y Escape llaman a
 * `onOpenChange(false)`. Confirmar llama a `onConfirm` y NO cierra por su cuenta: quien lo
 * monta decide cuándo (al terminar la acción, no antes), porque confirmar puede tardar. Por
 * eso el botón es uno normal y no `AlertDialog.Action`, que cierra siempre. Mientras `pending`
 * (la acción confirmada sigue en marcha) los dos botones se desactivan y Escape no hace nada:
 * no se deja a medias lo que ya empezó ni se lanza dos veces.
 *
 * `tone="danger"` pinta la confirmación con la variante `danger`; sin él es `primary`. La
 * cancelación es siempre `secondary`.
 *
 * Se pinta dentro del contenedor del club (`[data-club]`) y no en `<body>`, por el mismo
 * motivo que `BottomSheet`: el acento del botón principal lo pone ese contenedor, no
 * `<html>`. Fuera de un club, cae en `<body>`. No dibuja nada hasta saber dónde va (un turno),
 * para no montarse dos veces.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "default",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "default" | "danger";
  pending?: boolean;
  onConfirm: () => void;
}) {
  // `undefined`: aún no se ha mirado; `null`: se ha mirado y no hay club.
  const [container, setContainer] = useState<HTMLElement | null | undefined>(undefined);
  // Quien tenía el foco al abrirse: a él vuelve al cerrarse. Radix lo devolvería al
  // `Trigger`, y aquí no hay: el diálogo lo abre quien lo controla.
  const opener = useRef<HTMLElement | null>(null);
  const findContainer = useCallback((anchor: HTMLElement | null) => {
    if (anchor) setContainer(anchor.closest<HTMLElement>("[data-club]"));
  }, []);

  return (
    <>
      {/* Ancla invisible: desde su sitio en el árbol se encuentra el contenedor del club. */}
      <span ref={findContainer} hidden />
      <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
        {container !== undefined ? (
          <AlertDialog.Portal container={container}>
            <AlertDialog.Overlay data-dialog-overlay className="fixed inset-0 z-40 bg-scrim" />
            <AlertDialog.Content
              onOpenAutoFocus={() => {
                opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                opener.current?.focus();
              }}
              onEscapeKeyDown={(event) => {
                if (pending) event.preventDefault();
              }}
              className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-var(--space-8))] max-w-(--content-max) -translate-x-1/2 -translate-y-1/2 flex-col gap-(--space-4) rounded-xl border border-line bg-surface-1 p-(--space-4) shadow-sheet focus:outline-hidden"
            >
              <div className="flex flex-col gap-(--space-2)">
                <AlertDialog.Title className="font-display text-title wrap-break-word uppercase">
                  {title}
                </AlertDialog.Title>
                <AlertDialog.Description className="text-body text-ink-2">{body}</AlertDialog.Description>
              </div>
              <div className="flex flex-col gap-(--space-3)">
                <AlertDialog.Cancel asChild>
                  <CTAButton variant="secondary" block disabled={pending}>
                    {cancelLabel}
                  </CTAButton>
                </AlertDialog.Cancel>
                <CTAButton
                  variant={tone === "danger" ? "danger" : "primary"}
                  block
                  disabled={pending}
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </CTAButton>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        ) : null}
      </AlertDialog.Root>
    </>
  );
}
