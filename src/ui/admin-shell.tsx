import type { ReactNode } from "react";
import type { AdminNavItem } from "@/modules/tenancy/navigation";
import { AdminNav } from "./admin-nav";
import { CTAButton } from "./cta-button";

/**
 * El marco de Gestión, el área de dirección: cabecera con el nombre del club, el kicker
 * «Gestión» y la salida «Volver a la app»; la navegación de apartados y el contenido en
 * `<main>`. Sin navegación inferior: Gestión no es una pestaña de la app móvil.
 *
 * Debajo de `lg` (1024px) las pestañas van encima del contenido y todo ocupa el ancho; desde
 * `lg`, columna de `admin-nav` a la izquierda y contenido hasta `admin-content-max`, el
 * conjunto centrado. `<main>` no pone margen superior: cada página decide su cabecera.
 */
export function AdminShell({
  brandName,
  clubSlug,
  items,
  children,
}: {
  brandName: string;
  clubSlug: string;
  items: AdminNavItem[];
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full flex-1 flex-col lg:max-w-[calc(var(--admin-nav)+var(--admin-content-max))]">
      <header className="flex items-center justify-between gap-(--space-4) pt-[calc(var(--space-2)+env(safe-area-inset-top))] pr-(--space-2) pb-(--space-2) pl-(--space-4)">
        <div className="flex min-w-0 flex-col">
          <p className="text-label text-brand-accent uppercase">Gestión</p>
          <p className="truncate font-display text-title uppercase">{brandName}</p>
        </div>
        <CTAButton variant="ghost" href={`/c/${clubSlug}`} className="shrink-0">
          Volver a la app
        </CTAButton>
      </header>
      <div className="flex flex-1 flex-col lg:flex-row">
        <AdminNav items={items} />
        <main className="flex min-w-0 flex-1 flex-col gap-(--space-6) px-(--space-4) pt-(--space-6) pb-(--space-12) lg:max-w-(--admin-content-max) lg:px-(--space-8)">
          {children}
        </main>
      </div>
    </div>
  );
}
