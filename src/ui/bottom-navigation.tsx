"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { activeNavKey, type NavItem, type NavKey } from "@/modules/tenancy/navigation";
import { GamesIcon, HomeIcon, TeamIcon, TrainIcon, WayIcon, type IconProps } from "./icons";

const ICONS: Record<NavKey, ComponentType<IconProps>> = {
  home: HomeIcon,
  way: WayIcon,
  train: TrainIcon,
  games: GamesIcon,
  team: TeamIcon,
};

// Icono y etiqueta se colocan desde arriba, no centrados: así los cinco iconos quedan a
// la misma altura aunque una etiqueta larga ocupe dos líneas.
// El foco va por dentro: la barra está pegada al borde de la pantalla.
const itemClass =
  "flex min-h-(--target-min) min-w-(--target-min) flex-col items-center justify-start " +
  "gap-(--space-1) pt-(--space-3) text-caption " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";

/**
 * Navegación principal del club: cinco pestañas con icono y texto, fija abajo.
 *
 * Las etiquetas llegan ya resueltas con la terminología del club (`navItems`). La pestaña
 * activa sale de la ruta: va en el acento del club, con el trazo más grueso y
 * `aria-current="page"`.
 */
export function BottomNavigation({ items, clubSlug }: { items: NavItem[]; clubSlug: string }) {
  const active = activeNavKey(usePathname(), clubSlug);

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface-1 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto grid h-(--nav-height) w-full max-w-(--content-max) grid-cols-5">
        {items.map((item) => {
          const isActive = item.key === active;
          const TabIcon = ICONS[item.key];

          return (
            <Link
              key={item.key}
              href={item.href}
              // Sin prefetch: estas rutas son dinámicas y no hay nada que adelantar, pero
              // cada intento pasaría por el proxy y su comprobación de sesión.
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className={`${itemClass} ${isActive ? "font-semibold text-brand-accent" : "text-ink-3"}`}
            >
              <TabIcon strokeWidth={isActive ? 2.25 : 1.75} />
              <span className="line-clamp-2 max-w-full text-center wrap-anywhere">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
