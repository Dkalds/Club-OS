"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { CTAButton } from "./cta-button";

/**
 * Una hoja anclada abajo, sobre el resto de la pantalla (design/README.md: `radius-xl` en las
 * esquinas de arriba y `shadow-sheet`, la única sombra del sistema junto a la del Live Mode).
 * La usan los filtros de la biblioteca y las fases siguientes.
 *
 * Es un diálogo modal de Radix: el foco queda atrapado dentro, vuelve a quien la abrió al
 * cerrarla, y se cierra con Escape, pulsando el fondo o con «Cerrar». Quien la monta
 * controla `open` y recibe `onOpenChange`; `title` es su nombre accesible y también lo que se
 * ve arriba. No lleva descripción asociada: el contenido es la descripción. La versión de
 * Radix que fija el lockfile no avisa de ello por consola; si una futura lo hiciera, los tests
 * de este componente (que vigilan `console.error` y `console.warn`) lo cantarían.
 *
 * Nunca es más ancha que la columna de contenido de la app (`content-max`), respeta el área
 * segura inferior del dispositivo y no cubre nunca la pantalla entera: el contenido largo se
 * desplaza dentro y `footer` (una acción, por ejemplo) se queda abajo.
 *
 * Se pinta dentro del contenedor del club (`[data-club]`, el `<div>` de `c/[club]/layout.tsx`)
 * y no en `<body>`, que es lo que haría Radix por defecto: los colores del club
 * (`--brand-*`) los pone ese contenedor, no `<html>`, y una hoja fuera de él pintaría el
 * acento de plataforma en vez del del club. Fuera de un club, cae en `<body>`. La hoja no
 * dibuja nada hasta saber dónde va (un turno), para no montarse dos veces.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // `undefined`: aún no se ha mirado; `null`: se ha mirado y no hay club.
  const [container, setContainer] = useState<HTMLElement | null | undefined>(undefined);
  // Quien tenía el foco al abrirse: a él vuelve al cerrarse.
  const opener = useRef<HTMLElement | null>(null);
  const findContainer = useCallback((anchor: HTMLElement | null) => {
    if (anchor) setContainer(anchor.closest<HTMLElement>("[data-club]"));
  }, []);

  return (
    <>
      {/* Ancla invisible: desde su sitio en el árbol se encuentra el contenedor del club. */}
      <span ref={findContainer} hidden />
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        {container !== undefined ? (
          <Dialog.Portal container={container}>
            <Dialog.Overlay data-sheet-overlay className="fixed inset-0 z-40 bg-scrim" />
            <Dialog.Content
              onOpenAutoFocus={() => {
                opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                opener.current?.focus();
              }}
              className="fixed bottom-0 left-1/2 z-50 flex max-h-[calc(100dvh-var(--space-12))] w-full max-w-(--content-max) -translate-x-1/2 flex-col rounded-t-xl bg-surface-1 pb-[env(safe-area-inset-bottom)] shadow-sheet focus:outline-hidden"
            >
              <div className="flex shrink-0 items-center justify-between gap-(--space-3) pt-(--space-2) pr-(--space-2) pl-(--space-4)">
                <Dialog.Title className="min-w-0 font-display text-title wrap-break-word uppercase">
                  {title}
                </Dialog.Title>
                <Dialog.Close asChild>
                  <CTAButton variant="ghost" className="shrink-0">
                    Cerrar
                  </CTAButton>
                </Dialog.Close>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
              {footer ? (
                <div data-sheet-footer className="shrink-0 px-(--space-4) pt-(--space-3) pb-(--space-4)">
                  {footer}
                </div>
              ) : null}
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </Dialog.Root>
    </>
  );
}
