"use client";

import { useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useState, type MouseEvent } from "react";
import { ConfirmDialog } from "./confirm-dialog";

/**
 * Lo que hace falta para montar `LeaveGuardDialog`: es el valor `dialog` de `useLeaveGuard`.
 */
type LeaveGuardDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/** Un clic que abre otra pestaña o ventana (Ctrl, Cmd, Mayús, botón central): esta se queda como está. */
function opensElsewhere(event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; button: number }): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0;
}

/**
 * A dónde lleva dentro de la app un enlace pulsado, como ruta con su búsqueda y su ancla; `null`
 * si pulsarlo no saca de la pantalla: abre otra pestaña (`target` que no es `_self`), descarga
 * un fichero, va a otro sitio (otro origen, `mailto:`…) o es un ancla de esta misma página.
 *
 * Se compara con la dirección del documento, que es la de la página en pantalla.
 */
function internalDestination(anchor: HTMLAnchorElement): string | null {
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;

  // La propiedad `href` ya viene completa, resuelta contra la página.
  const url = new URL(anchor.href);
  const here = new URL(document.URL);
  if (url.origin !== here.origin) return null;

  const samePage = url.pathname === here.pathname && url.search === here.search;
  if (samePage && (url.hash !== "" || anchor.getAttribute("href")?.startsWith("#"))) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Protege lo escrito y sin guardar de una pantalla con un formulario: mientras `dirty`, ni
 * cerrar o recargar la pestaña ni pulsar un enlace de la app lo pierden sin avisar.
 *
 * - Pestaña: con `dirty` pone un `beforeunload`, y el navegador pregunta con su propio texto.
 *   Cada uso tiene su manejador: dos pantallas con el gancho no se quitan el aviso una a otra.
 * - Enlaces: con `dirty` escucha los clics en `document`, en la fase de captura (antes que
 *   React y que el propio enlace). Si el clic cae en un enlace que lleva a otra pantalla de la
 *   app, lo detiene y abre el diálogo (`LeaveGuardDialog`, con `dialog`); confirmar navega con
 *   `router.push` a su destino. Vale para cualquier enlace, también los que la pantalla no pinta
 *   ni conoce: la navegación inferior queda a un dedo del botón de guardar, y un toque fallido
 *   no puede tirar lo escrito. Deja pasar lo que no saca de la pantalla: un clic con Ctrl, Cmd o
 *   Mayús, o con el botón central (abre otra pestaña), un enlace con `target` distinto de
 *   `_self`, una descarga, un enlace a otro sitio y un ancla de la misma página. Si otro uso
 *   del gancho ya detuvo el clic, no pregunta otra vez.
 * - `guard` sigue valiendo en el `onClick` de un enlace, para quien ya lo usa: hace lo mismo
 *   con ese enlace (lee su atributo `href` tal como está escrito) y no hace nada si el clic ya
 *   llegó detenido, que es lo normal ahora.
 * - `release` quita los dos avisos al momento, aunque siga habiendo cambios. Es para quien va a
 *   recargar la página a propósito («Recargar» tras una copia obsoleta): ya ha decidido tirar
 *   lo suyo y no hay que preguntarle justo por eso.
 *
 * Lo que no cubre, y se acepta:
 * - Los botones «atrás» y «adelante» del navegador y el gesto de volver: App Router no tiene
 *   gancho para detener un cambio de ruta que no empieza en un clic, y fingirlo con el
 *   historial rompe el botón «atrás» para todo lo demás.
 * - «Salir», del menú de cuenta: no es un enlace sino un formulario que cierra la sesión, y
 *   quien lo pulsa sabe que se va.
 * - Los cambios de ruta que hace el código (`router.push`) sin pasar por un enlace.
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

  // Solo se detiene el clic (`preventDefault`), no se corta su camino: `next/link` no navega con
  // un clic detenido, y lo demás que lo escuche (un menú que se cierra al pulsar) sigue igual.
  const askBeforeLeaving = useCallback((event: globalThis.MouseEvent) => {
    if (event.defaultPrevented || opensElsewhere(event)) return;
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const href = internalDestination(anchor);
    if (href === null) return;

    event.preventDefault();
    setDestination(href);
  }, []);

  // Un efecto de layout y no uno pasivo: corre dentro de la misma pintura que cambia `dirty`.
  // `dirty` deja de serlo al llegar el resultado de guardar, que React pinta en una transición,
  // y los efectos pasivos de una transición corren en un turno posterior: durante ese rato la
  // pantalla diría «Cambios guardados.» y aún se preguntaría al cerrar la pestaña o al pulsar un
  // enlace. Añadir y quitar un oyente es instantáneo, no retrasa nada.
  useLayoutEffect(() => {
    if (!dirty) return;
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", askBeforeLeaving, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", askBeforeLeaving, true);
    };
  }, [dirty, warnBeforeUnload, askBeforeLeaving]);

  function guard(event: MouseEvent<HTMLAnchorElement>) {
    if (!dirty) return;
    // Ya lo detuvo el oyente de `document`, que va antes: su destino es el que vale.
    if (event.defaultPrevented) return;
    if (opensElsewhere(event)) return;
    const href = event.currentTarget.getAttribute("href");
    if (href === null) return;

    event.preventDefault();
    setDestination(href);
  }

  function release() {
    window.removeEventListener("beforeunload", warnBeforeUnload);
    document.removeEventListener("click", askBeforeLeaving, true);
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
