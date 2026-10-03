import { AccountMenu } from "./account-menu";

/**
 * Cabecera de inicio de sección: la marca del club a la izquierda y, a la derecha, el menú
 * de cuenta cuando se le pasa `account`.
 *
 * El nombre y el subtítulo vienen de `organization_branding`, nunca del código. Mientras
 * el club no tenga logo, la marca es su nombre en `font-display`. `account.adminHref` es el
 * enlace a Gestión, o `null` si quien entra no administra (ver `AccountMenu`).
 *
 * Se queda arriba al desplazar la página; `top-nav-line` (globals.css) le pone entonces
 * la línea inferior. Mide como mínimo `header-height` más el área segura, y lo que se
 * enlaza con un ancla deja ese mismo margen para que la cabecera no lo tape
 * (`anchor-below-header`). Las medidas de la marca (24px, 11px y sus interletrados) son las
 * de `design/components/bundle.css`: no hay estilo de texto en los tokens para ellas.
 *
 * Un nombre o un subtítulo que no caben se truncan con puntos suspensivos, cada uno en su
 * línea: la cabecera nunca ensancha la pantalla. `truncate` oculta lo que sobresale de la
 * caja y, con interlínea 1, el acento de una mayúscula sobresale; por eso cada línea lleva
 * un relleno vertical que le hace sitio y un margen negativo igual que lo compensa.
 */
export function TopNavigation({
  brand,
  account,
}: {
  brand: { displayName: string; wordmarkSub: string | null };
  account?: { name: string; adminHref: string | null };
}) {
  const sub = brand.wordmarkSub?.trim();

  return (
    <header className="top-nav-line sticky top-0 z-10 flex min-h-[calc(var(--header-height)+env(safe-area-inset-top))] items-center justify-between bg-bg pt-[env(safe-area-inset-top)] pr-(--space-2) pl-(--space-4)">
      <p className="flex min-w-0 flex-col gap-0.5 font-display uppercase">
        <span className="-my-(--space-1) truncate py-(--space-1) text-[24px] leading-none font-bold tracking-[0.02em]">
          {brand.displayName}
        </span>
        {sub ? (
          <span className="-my-(--space-1) truncate py-(--space-1) text-caption leading-none font-semibold tracking-[0.32em] text-ink-2">
            {sub}
          </span>
        ) : null}
      </p>
      {account ? <AccountMenu name={account.name} adminHref={account.adminHref} /> : null}
    </header>
  );
}
