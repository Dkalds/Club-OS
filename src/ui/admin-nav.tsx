"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminNavItem } from "@/modules/tenancy/navigation";

/** `href` es la ruta o un ancestro suyo, por segmentos enteros (`/way` no es `/waylon`). */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Debajo de `lg` son pestañas con una línea inferior; desde `lg`, una columna con la línea
// a la izquierda y el fondo tintado. El foco va por dentro: la lista queda pegada al borde.
const LINK =
  "flex min-h-(--target-min) items-center border-b-2 px-(--space-4) font-display text-title whitespace-nowrap uppercase " +
  "lg:border-b-0 lg:border-l-2 " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";
const LINK_ACTIVE = "border-brand-accent bg-brand-accent-soft text-brand-accent";
const LINK_IDLE = "border-transparent text-ink-2 hover:text-ink";

/**
 * Navegación de Gestión: un enlace por apartado, el de la ruta actual con `aria-current`.
 *
 * Debajo de `lg` (1024px) son pestañas que se desplazan en horizontal, encima del contenido;
 * desde `lg`, una columna de `admin-nav` de ancho a su izquierda. Las etiquetas llegan ya
 * resueltas con la terminología del club (`adminNavItems`).
 *
 * Los enlaces no precargan: sus destinos son rutas dinámicas detrás del proxy de sesión
 * (mismo motivo que `BottomNavigation`).
 */
export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Gestión"
      className="overflow-x-auto border-b border-line lg:w-(--admin-nav) lg:shrink-0 lg:overflow-visible lg:border-b-0 lg:pt-(--space-6)"
    >
      <ul className="flex px-(--space-2) lg:flex-col lg:px-(--space-4)">
        {items.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={`${LINK} ${active ? LINK_ACTIVE : LINK_IDLE}`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
