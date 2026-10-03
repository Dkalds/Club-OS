import type { ReactNode } from "react";

export type CardVariant = "default" | "spotlight" | "flush";

const BASE = "flex flex-col border";

const VARIANT_CLASS: Record<CardVariant, string> = {
  default: "gap-(--space-3) rounded-lg border-line bg-surface-1 p-(--space-4)",
  // Lo único que el usuario necesita hoy: una por pantalla. El borde es transparente para
  // que mida lo mismo que una card normal.
  spotlight:
    "gap-(--space-3) rounded-xl border-transparent bg-spotlight p-(--space-4) text-on-spotlight",
  // Para listas de filas con separadores: sin padding y recortando lo que sobresale, de
  // modo que las filas deben llevar el foco por dentro.
  flush: "overflow-hidden rounded-lg border-line bg-surface-1",
};

/**
 * El contenedor base (design/components/Card): agrupa un tema en una superficie.
 *
 * Sin sombras ni bordes de color. `className` es para encajar la card en su sitio (como
 * alinear su contenido); los colores y los radios salen siempre de la variante.
 */
export function Card({
  variant = "default",
  className,
  children,
}: {
  variant?: CardVariant;
  className?: string;
  children: ReactNode;
}) {
  const classes = [BASE, VARIANT_CLASS[variant], className].filter(Boolean).join(" ");

  return <div className={classes}>{children}</div>;
}
