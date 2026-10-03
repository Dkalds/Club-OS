import type { ReactNode } from "react";
import type { ContentStatus } from "@/modules/methodology/types";
import { CheckIcon, DraftIcon } from "@/ui/icons";

const BASE =
  "inline-flex shrink-0 items-center gap-(--space-1) rounded-pill px-(--space-2) py-(--space-1) text-label whitespace-nowrap uppercase";

const STATUS = {
  published: { label: "Publicado", icon: <CheckIcon size={16} />, tone: "bg-success-soft text-success" },
  draft: { label: "Borrador", icon: <DraftIcon size={16} />, tone: "bg-surface-2 text-ink-3" },
} satisfies Record<ContentStatus, { label: string; icon: ReactNode; tone: string }>;

/**
 * Si algo está publicado o es un borrador: la palabra, con su icono, en `success` o en
 * `ink-3`. Nunca solo color. Sirve a cualquier lista con estado (secciones, valores,
 * principios, Standards): no sabe de qué es el estado.
 */
export function StatusPill({ status }: { status: ContentStatus }) {
  const { label, icon, tone } = STATUS[status];

  return (
    <span className={`${BASE} ${tone}`}>
      {icon}
      {label}
    </span>
  );
}
