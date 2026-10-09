import Link from "next/link";
import { Avatar } from "./avatar";
import { ChevronRightIcon } from "./icons";

/**
 * Un jugador en la plantilla de un equipo (design/components/PlayerCard). Es un `<li>`: va
 * dentro de `<Card variant="flush" as="ul">`, como `ListRow`, y toda la fila es un único enlace
 * a su ficha.
 *
 * El dorsal va primero, en el acento y alineado a la derecha para que la columna se lea de un
 * vistazo; después las iniciales (nunca una foto: un menor solo sale en foto con consentimiento
 * de imagen registrado), el nombre y la posición. Nunca la fecha ni el año de nacimiento, ni
 * contacto, ni notas. El avatar no se anuncia: el nombre ya se lee al lado.
 */
export function PlayerCard({
  href,
  firstName,
  lastName,
  jerseyNumber,
  position,
}: {
  href: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  position: string | null;
}) {
  const name = `${firstName} ${lastName}`;

  return (
    <li className="border-t border-line first:border-t-0">
      <Link
        href={href}
        // Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión.
        prefetch={false}
        className="group flex min-h-15 items-center gap-(--space-3) px-(--space-4) py-(--space-2) text-ink active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
      >
        <span className="w-9 shrink-0 text-right font-display text-[24px] leading-[24px] font-bold text-brand-accent tabular-nums">
          {jerseyNumber === null ? (
            <span className="sr-only">Sin dorsal</span>
          ) : (
            <>
              <span aria-hidden="true">{jerseyNumber}</span>
              <span className="sr-only">{`Dorsal ${jerseyNumber}`}</span>
            </>
          )}
        </span>{" "}
        <Avatar name={name} decorative />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-strong">{name}</span>
          {position ? (
            <>
              {" "}
              <span className="block truncate text-body-s text-ink-3 group-active:text-ink-2">{position}</span>
            </>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center text-ink-3 group-active:text-ink-2">
          <ChevronRightIcon size={16} />
        </span>
      </Link>
    </li>
  );
}
