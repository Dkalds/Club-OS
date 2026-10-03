import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";

/**
 * Fila navegable para una card `flush` (design/components/ListRow): la agenda semanal,
 * las secciones de The Way, los menús de gestión.
 *
 * La fila entera es un único enlace y, por tanto, el área táctil (56px como mínimo). El
 * título y el subtítulo se truncan en vez de desbordar; `lead` es lo primero de la fila
 * (un `DateChip`, un número, un `Avatar`) y `trail` un dato corto a la derecha, antes del
 * chevron. El separador es el borde superior, salvo en la primera fila de la card. El foco
 * va por dentro: la card recorta lo que sobresale.
 *
 * Pulsada, la fila pasa a `surface-3`, y `ink-3` no va sobre `surface-3` (design/README.md,
 * Color): mientras dura la pulsación, lo que va en `ink-3` (subtítulo, trail y el día de la
 * semana del `DateChip`) sube a `ink-2`. La fila es el `group` que se lo dice.
 */
export function ListRow({
  href,
  lead,
  title,
  subtitle,
  trail,
}: {
  href: string;
  lead: ReactNode;
  title: string;
  subtitle?: string;
  trail?: ReactNode;
}) {
  return (
    <Link
      href={href}
      // Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión.
      prefetch={false}
      className="group flex min-h-14 items-center gap-(--space-3) border-t border-line px-(--space-4) py-(--space-2) text-ink first:border-t-0 active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
    >
      <span className="flex w-11 shrink-0 items-center justify-center text-brand-accent">{lead}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-strong">{title}</span>
        {subtitle ? (
          <span className="block truncate text-body-s text-ink-3 group-active:text-ink-2">
            {subtitle}
          </span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-(--space-2) text-body-s text-ink-3 tabular-nums group-active:text-ink-2">
        {trail}
        <ChevronRightIcon size={16} />
      </span>
    </Link>
  );
}

/**
 * El día de la semana sobre el número del día, de cifras tabulares: el `lead` de una fila de
 * agenda. Las medidas del número (24px) y del interletrado salen de design/components/bundle.css.
 */
export function DateChip({ dow, day }: { dow: string; day: string }) {
  return (
    <span className="block w-11 shrink-0 text-center">
      <span className="block text-caption font-semibold tracking-[0.08em] text-ink-3 uppercase group-active:text-ink-2">
        {dow}
      </span>
      <span className="block font-display text-[24px] leading-6 font-bold text-ink tabular-nums">
        {day}
      </span>
    </span>
  );
}
