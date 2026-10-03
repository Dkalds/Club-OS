import { CTAButton } from "./cta-button";
import { ChevronLeftIcon } from "./icons";

/**
 * El enlace de vuelta de una pantalla de detalle: un chevron y el nombre de la pantalla a la
 * que se vuelve (en The Way, el nombre que el club da a su metodología).
 *
 * Es un `CTAButton` `ghost`, así que mide `target-min` de alto. Va a la izquierda y su texto
 * queda alineado con el margen de la pantalla: el relleno del botón (`space-2`) se compensa
 * con un margen negativo igual. El chevron es decorativo.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <CTAButton
      variant="ghost"
      href={href}
      icon={<ChevronLeftIcon size={16} />}
      className="-ml-(--space-2) self-start"
    >
      {label}
    </CTAButton>
  );
}
