import type { MouseEvent } from "react";
import { CTAButton } from "./cta-button";
import { ChevronLeftIcon } from "./icons";

/**
 * El enlace de vuelta de una pantalla de detalle: un chevron y el nombre de la pantalla a la
 * que se vuelve (en The Way, el nombre que el club da a su metodología).
 *
 * Es un `CTAButton` `ghost`, así que mide `target-min` de alto. Va a la izquierda y su texto
 * queda alineado con el margen de la pantalla: el relleno del botón (`space-2`) se compensa
 * con un margen negativo igual. El chevron es decorativo.
 *
 * `onClick` es para una pantalla con cambios sin guardar: recibe el clic antes de navegar y
 * puede detenerlo (el `guard` de `useLeaveGuard`). Solo se le puede pasar desde un componente
 * de cliente.
 */
export function BackLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <CTAButton
      variant="ghost"
      href={href}
      icon={<ChevronLeftIcon size={16} />}
      className="-ml-(--space-2) self-start"
      onClick={onClick}
    >
      {label}
    </CTAButton>
  );
}
