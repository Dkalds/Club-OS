import Link from "next/link";
import { formatStandardNumber } from "@/modules/methodology/format";

// Medidas de design/components/bundle.css (`.cos-std`): el chip mide `space-8` de alto, con
// `space-2` a la izquierda del número y `space-3` a la derecha del título.
const CHIP =
  "inline-flex max-w-full items-center gap-(--space-2) rounded-sm bg-brand-accent-soft " +
  "pr-(--space-3) pl-(--space-2) font-display text-body-strong tracking-[0.04em] text-ink uppercase";

/**
 * Un Standard del club como chip (design/components/StandardBadge): su número en el acento y
 * su título. Es la parte «por qué» de ejercicios, sesiones y objetivos.
 *
 * Con `href` es un enlace al Standard y, como área táctil, mide `target-min` de alto como
 * mínimo; sin él es solo una etiqueta de `space-8`. Un título que no cabe se trunca en vez de
 * desbordar el chip. Los enlaces no precargan: el destino es una ruta dinámica detrás del proxy
 * de sesión.
 */
export function StandardBadge({
  number,
  title,
  href,
}: {
  number: number;
  title: string;
  href?: string;
}) {
  // El espacio entre número y título es para quien lo escucha con un lector de pantalla
  // («03 Título»): entre elementos flex no ocupa sitio.
  const content = (
    <>
      <span className="font-bold text-brand-accent tabular-nums">
        {formatStandardNumber(number)}
      </span>{" "}
      <span className="min-w-0 truncate">{title}</span>
    </>
  );

  if (href !== undefined) {
    return (
      <Link
        href={href}
        prefetch={false}
        className={`${CHIP} min-h-(--target-min) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring`}
      >
        {content}
      </Link>
    );
  }

  return <span className={`${CHIP} h-(--space-8)`}>{content}</span>;
}
