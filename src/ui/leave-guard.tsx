"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Lo que hace falta para montar `LeaveGuardDialog`: es el valor `dialog` de `useLeaveGuard`.
 */
type LeaveGuardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/**
 * Protege lo escrito y sin guardar de una pantalla con un formulario: mientras `dirty`, ni
 * cerrar o recargar la pestaña ni pulsar un enlace de la propia app lo pierden sin avisar.
 *
 * - Pestaña: con `dirty` pone un `beforeunload`, y el navegador pregunta con su propio texto.
 *   Cada uso tiene su manejador: dos pantallas con el gancho no se quitan el aviso una a otra.
 * - Enlaces: `guard` va en el `onClick` de cada enlace que saca de la pantalla. Sin cambios
 *   no hace nada y el enlace navega. Con cambios lo detiene y abre el diálogo
 *   (`LeaveGuardDialog`, con `dialog`); confirmar navega con `router.push` al `href` del
 *   enlace. Lee el atributo `href` tal como está escrito (la propiedad del navegador lo
 *   completa con el origen). Un clic con Ctrl, Cmd o Mayús, o con el botón central, abre otra
 *   pestaña y esta se queda como está: lo deja pasar.
 * - `release` quita el aviso de `beforeunload` al momento, aunque siga habiendo cambios. Es
 *   para quien va a recargar la página a propósito («Recargar» tras una copia obsoleta): ya
 *   ha decidido tirar lo suyo y el navegador no debe preguntarle justo por eso.
 *
 * No intercepta los botones «atrás» y «adelante» del navegador ni los cambios de ruta que no
 * pasan por un enlace de esta pantalla: App Router no tiene gancho para bloquearlos.
 */
export function useLeaveGuard(dirty: boolean): {
  guard: (event: MouseEvent<HTMLAnchorElement>) => void;
  dialog: LeaveGuardDialogProps;
  release: () => void;
} {
  const router = useRouter();
  // El destino del enlace pulsado mientras espera la respuesta del diálogo; `null`, cerrado.
  const [destination, setDestination] = useState<string | null>(null);

  // Los navegadores antiguos solo preguntan si se asigna `returnValue`. Un manejador por uso:
  // con uno compartido, quitar el de una pantalla quitaría también el de otra.
  const warnBeforeUnload = useCallback((event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = "";
  }, []);

  useEffect(() => {
    if (!dirty) return;
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty, warnBeforeUnload]);

  function guard(event: MouseEvent<HTMLAnchorElement>) {
    if (!dirty) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    const href = event.currentTarget.getAttribute("href");
    if (href === null) return;

    event.preventDefault();
    setDestination(href);
  }

  function release() {
    window.removeEventListener("beforeunload", warnBeforeUnload);
  }

  function confirm() {
    const href = destination;
    setDestination(null);
    if (href !== null) router.push(href);
  }

  return {
    guard,
    dialog: {
      open: destination !== null,
      onOpenChange: (open) => {
        if (!open) setDestination(null);
      },
      onConfirm: confirm,
    },
    release,
  };
}

/**
 * La pregunta de `useLeaveGuard`: se monta con `<LeaveGuardDialog {...dialog} />` en la misma
 * pantalla que el gancho, también dentro de un `<form>`: sus botones son de tipo `button`, no
 * lo envían. La salida se marca como peligrosa: pierde lo escrito.
 */
export function LeaveGuardDialog({ open, onOpenChange, onConfirm }: LeaveGuardDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="¿Salir sin guardar?"
      body="Tienes cambios sin guardar. Si sales, se pierden."
      confirmLabel="Salir sin guardar"
      cancelLabel="Seguir editando"
      tone="danger"
      onConfirm={onConfirm}
    />
  );
}
