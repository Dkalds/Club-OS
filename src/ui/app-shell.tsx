import type { ReactNode } from "react";
import type { NavItem } from "@/modules/tenancy/navigation";
import { BottomNavigation } from "./bottom-navigation";

/**
 * El marco de toda pantalla móvil de un club: cabecera, contenido y navegación inferior.
 *
 * El contenido va en `<main>`, centrado hasta `content-max`. `<main>` no pone margen
 * lateral: cada bloque decide si va a sangre (la portada) o con `space-4`. Abajo deja el
 * hueco de la navegación fija y del área segura del dispositivo.
 *
 * El marco es el grupo `shell`: una pantalla de detalle monta su `TopNavigation` `detail`
 * dentro de `<main>` y la cabecera de inicio, la de `header`, se oculta sola al verlo
 * (`group-has-[…]/shell`, ver `TopNavigation`).
 */
export function AppShell({
  header,
  nav,
  clubSlug,
  children,
}: {
  header: ReactNode;
  nav: NavItem[];
  clubSlug: string;
  children: ReactNode;
}) {
  return (
    <div className="group/shell mx-auto flex w-full max-w-(--content-max) flex-1 flex-col">
      {header}
      <main className="flex flex-1 flex-col gap-(--space-6) pb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+var(--space-6))]">
        {children}
      </main>
      <BottomNavigation items={nav} clubSlug={clubSlug} />
    </div>
  );
}
