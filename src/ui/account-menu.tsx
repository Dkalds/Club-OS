"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "./avatar";

// Los elementos del menú son enlaces y un botón: llegan a `target-min` de alto y el foco
// va por dentro del panel, que recorta sus esquinas.
const ITEM =
  "flex min-h-(--target-min) w-full cursor-pointer items-center px-(--space-4) text-left text-body-strong text-ink " +
  "hover:bg-surface-3 active:bg-surface-3 " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";

/**
 * El menú de la persona que ha entrado, en la cabecera: su avatar abre «Gestión» (solo si
 * `adminHref`, que decide quien lo monta) y «Salir».
 *
 * Es un botón que muestra y oculta un panel (`aria-expanded`), no un `role="menu"`: lo que
 * hay dentro es un enlace y un botón normales, que se recorren con Tab. Se cierra con
 * Escape, devolviendo el foco al botón; al pulsar fuera, sin tocar el foco; y si el foco
 * sale con el teclado. El nombre accesible del botón es siempre el mismo; el nombre de la
 * persona es el del avatar.
 *
 * «Salir» es un `<form method="post">`: cerrar sesión es un POST. No funciona sin JavaScript
 * porque no se llega a él: el panel solo se pinta tras abrirlo, un cambio de estado en el
 * cliente. El panel no tiene vista previa en `design/`: usa los tokens de una card elevada
 * (`surface-2`, borde `line`, `radius-lg`), sin sombra.
 */
export function AccountMenu({ name, adminHref }: { name: string; adminHref: string | null }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const isOutside = (target: EventTarget | null) =>
      target instanceof Node && !root.current?.contains(target);
    const onPointerDown = (event: PointerEvent) => {
      if (isOutside(event.target)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isOutside(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={toggle}
        type="button"
        aria-label="Abrir menú de cuenta"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="flex size-(--target-min) cursor-pointer items-center justify-center rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <Avatar name={name} size="sm" />
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute top-full right-0 z-20 mt-(--space-1) min-w-44 overflow-hidden rounded-lg border border-line bg-surface-2 py-(--space-1)"
        >
          {adminHref ? (
            <Link href={adminHref} prefetch={false} className={ITEM}>
              Gestión
            </Link>
          ) : null}
          <form action="/auth/sign-out" method="post">
            <button type="submit" className={ITEM}>
              Salir
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
