import type { ReactNode } from "react";
import { Card } from "./card";
import { CTAButton } from "./cta-button";
import { AlertIcon } from "./icons";

// Sin `"use client"`: el archivo no usa hooks y solo `ErrorState` lleva un manejador
// (`onRetry`). Así los tres siguen siendo componentes de servidor (`EmptyState` y
// `LoadingState` no mandan JavaScript) y `ErrorState` funciona donde se le pasa una función,
// dentro de un componente de cliente como `error.tsx`. Desde un componente de servidor no
// se le puede pasar `onRetry`: sin él no pinta botón.

// design/components/bundle.css: `.cos-state` (padding space-12/space-6) y su texto a 280px.
const STATE_CARD = "items-center px-(--space-6) py-(--space-12) text-center";
const STATE_TEXT = "max-w-[280px]";
const ICON_CIRCLE = "flex size-14 items-center justify-center rounded-pill";

/**
 * Lo que se ve cuando una lista o pantalla aún no tiene contenido (design/components/EmptyState).
 *
 * Siempre con una salida: `action` es un enlace (crear, quitar filtros, volver). Sin `icon` no
 * hay círculo. El título es un `<h2>`: la pantalla pone su `<h1>`.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: { label: string; href: string };
}) {
  return (
    <Card className={STATE_CARD}>
      {icon ? (
        <span aria-hidden="true" className={`${ICON_CIRCLE} bg-surface-2 text-ink-2`}>
          {icon}
        </span>
      ) : null}
      <h2 className={`${STATE_TEXT} font-display text-title uppercase`}>{title}</h2>
      <p className={`${STATE_TEXT} text-ink-2`}>{body}</p>
      {action ? (
        <CTAButton variant="primary" href={action.href}>
          {action.label}
        </CTAButton>
      ) : null}
    </Card>
  );
}

/**
 * Esqueleto con la forma de una lista que va a llegar (design/components/LoadingState).
 *
 * Nunca un spinner ni texto visible: el contenedor está ocupado (`aria-busy`) y se llama
 * «Cargando» para quien usa un lector de pantalla; los bloques son decorativos. El pulso solo
 * corre si la persona no ha pedido menos movimiento.
 */
export function LoadingState({ rows = 3 }: { rows?: number }) {
  const block = "rounded-sm bg-surface-2 motion-safe:animate-pulse";

  return (
    <div role="status" aria-busy="true" aria-label="Cargando">
      <Card variant="flush">
        <ul aria-hidden="true" className="divide-y divide-line">
          {Array.from({ length: rows }, (_, index) => (
            <li
              key={index}
              className="flex items-center gap-(--space-3) px-(--space-4) py-(--space-3)"
            >
              <span className={`${block} h-15 w-20 shrink-0`} />
              <span className="flex min-w-0 flex-1 flex-col gap-(--space-2)">
                <span className={`${block} h-[18px] w-[70%]`} />
                <span className={`${block} h-3 w-1/2`} />
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/**
 * Un fallo que impide mostrar el contenido (design/components/ErrorState).
 *
 * `role="alert"`, y el icono va en `danger` pero con texto: el color no basta. Nada de códigos
 * técnicos en el mensaje. «Reintentar» solo sale si hay algo que reintentar (`onRetry`).
 */
export function ErrorState({
  title,
  body,
  onRetry,
}: {
  title: string;
  body: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert">
      <Card className={STATE_CARD}>
        <span aria-hidden="true" className={`${ICON_CIRCLE} bg-danger-soft text-danger`}>
          <AlertIcon size={28} />
        </span>
        <h2 className={`${STATE_TEXT} font-display text-title uppercase`}>{title}</h2>
        <p className={`${STATE_TEXT} text-ink-2`}>{body}</p>
        {onRetry ? (
          <CTAButton variant="secondary" onClick={onRetry}>
            Reintentar
          </CTAButton>
        ) : null}
      </Card>
    </div>
  );
}
