"use client";

import Link from "next/link";
import { useState } from "react";
import { BottomSheet } from "@/ui/bottom-sheet";
import { CTAButton } from "@/ui/cta-button";
import { ChevronRightIcon, PlusIcon } from "@/ui/icons";

export type AddOption = { label: string; href: string };

// Cada opción es una fila de `target-min` de alto, como las del selector de equipo. El foco
// va por dentro: la hoja recorta sus esquinas.
const OPTION =
  "flex min-h-(--target-min) w-full items-center justify-between gap-(--space-3) px-(--space-4) " +
  "text-body-strong text-ink hover:bg-surface-3 active:bg-surface-3 " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";

/**
 * «Añadir», el único botón principal de la Agenda: abre una hoja con lo que se puede añadir al
 * calendario (una sesión de entrenamiento, un partido). Quien lo monta decide las opciones
 * según lo que puede gestionar quien mira; sin ninguna, no se pinta.
 *
 * Con una sola opción no hay nada que elegir: el botón lleva directamente a ella y lo dice.
 */
export function AddMenu({ options }: { options: AddOption[] }) {
  const [open, setOpen] = useState(false);
  const [only] = options;

  if (!only) return null;

  if (options.length === 1) {
    return (
      <CTAButton variant="primary" block href={only.href} icon={<PlusIcon size={20} />}>
        {only.label}
      </CTAButton>
    );
  }

  return (
    <>
      <CTAButton
        variant="primary"
        block
        icon={<PlusIcon size={20} />}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        Añadir
      </CTAButton>
      <BottomSheet open={open} onOpenChange={setOpen} title="Añadir">
        <ul role="list" className="pb-(--space-2)">
          {options.map((option) => (
            <li key={option.href} className="border-t border-line first:border-t-0">
              {/* Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión. */}
              <Link href={option.href} prefetch={false} className={OPTION}>
                <span className="min-w-0 wrap-break-word">{option.label}</span>
                <ChevronRightIcon size={16} className="text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
