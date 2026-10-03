import Link from "next/link";

/**
 * Título de un bloque de la pantalla, con una acción opcional (design/components/SectionHeader).
 *
 * Es un `<h2>`: el `<h1>` de la pantalla es el `Hero` o su título. La separación con lo de
 * arriba (`space-6`) y con lo de abajo (`space-3`) la pone quien monta la pantalla.
 *
 * El enlace de acción mide `target-min` de alto, pero con margen negativo para que la cabecera
 * siga midiendo lo que su título: el área táctil sobresale por arriba y por abajo.
 */
export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex items-baseline justify-between gap-(--space-3)">
      <h2 className="min-w-0 font-display text-title wrap-break-word uppercase">{title}</h2>
      {action ? (
        <Link
          href={action.href}
          // Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión.
          prefetch={false}
          className="-my-(--space-4) -mr-(--space-2) inline-flex min-h-(--target-min) shrink-0 items-center rounded-sm px-(--space-2) text-body-s font-semibold text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
