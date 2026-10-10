import Link from "next/link";
import { AccountMenu, type AccountLink } from "./account-menu";
import { CTAButton } from "./cta-button";
import { ChevronLeftIcon } from "./icons";
import { TeamSwitcher, type TeamSwitcherTeam } from "./team-switcher";

// Lo que comparten las dos variantes: la barra se queda arriba al desplazar la página;
// `top-nav-line` (globals.css) le pone entonces la línea inferior. Mide como mínimo
// `header-height` más el área segura, y lo que se enlaza con un ancla deja ese mismo margen
// para que la cabecera no lo tape (`anchor-below-header`).
const BAR =
  "top-nav-line sticky top-0 z-10 flex min-h-[calc(var(--header-height)+env(safe-area-inset-top))] items-center bg-bg pt-[env(safe-area-inset-top)]";

type HomeProps = {
  variant?: "home";
  brand: { displayName: string; wordmarkSub: string | null };
  account?: { name: string; links: AccountLink[] };
  /** «Mis equipos» y el que se está viendo: con más de uno, el selector de equipo activo. */
  team?: { clubSlug: string; teams: TeamSwitcherTeam[]; activeId: string | null };
};

type DetailProps = {
  variant: "detail";
  title: string;
  backHref: string;
  action?: { label: string; href: string };
};

/**
 * Cabecera de pantalla en dos variantes (design/components/TopNavigation): `home`, el inicio
 * de una sección, y `detail`, una pantalla a la que se llega desde otra. Sin `variant` es
 * `home`, como siempre.
 *
 * Una pantalla de detalle muestra la cabecera `detail` EN VEZ de la de inicio, pero el marco
 * de la app (`AppShell`, a través de `(app)/layout.tsx`) pinta siempre la de inicio. Sin
 * reestructurar rutas, se resuelve así: cada variante se marca (`data-topnav="home"` o
 * `"detail"`); la página que quiere la de detalle la monta como lo primero de su contenido,
 * dentro de `<main>`; y la de inicio se oculta sola mientras la pantalla contenga una de
 * detalle, con `:has()` (el marco es el grupo `shell`, ver `AppShell`). jsdom no evalúa
 * `:has()`: en los tests se comprueban las clases, y el e2e de la biblioteca prueba el efecto.
 *
 * El `loading.tsx` y el `error.tsx` de una ruta de detalle tienen que pintar esa misma
 * `<TopNavigation variant="detail" …>` (el mismo título y el mismo `backHref`): mientras
 * cargan, o si fallan, no hay página que la ponga, y sin ella se vería la cabecera de inicio
 * y luego, al llegar la página, el cambio a la de detalle.
 */
export function TopNavigation(props: HomeProps | DetailProps) {
  return props.variant === "detail" ? <DetailNavigation {...props} /> : <HomeNavigation {...props} />;
}

/**
 * Cabecera de inicio de sección: la marca del club a la izquierda y, a la derecha, el menú
 * de cuenta cuando se le pasa `account`.
 *
 * El nombre y el subtítulo vienen de `organization_branding`, nunca del código. Mientras
 * el club no tenga logo, la marca es su nombre en `font-display`. `account.links` son los
 * enlaces del menú de cuenta, que decide quien lo monta según el rol (ver `AccountMenu`). Las medidas de
 * la marca (24px, 11px y sus interletrados) son las de `design/components/bundle.css`: no hay
 * estilo de texto en los tokens para ellas.
 *
 * Un nombre o un subtítulo que no caben se truncan con puntos suspensivos, cada uno en su
 * línea: la cabecera nunca ensancha la pantalla. `truncate` oculta lo que sobresale de la
 * caja y, con interlínea 1, el acento de una mayúscula sobresale; por eso cada línea lleva
 * un relleno vertical que le hace sitio y un margen negativo igual que lo compensa.
 *
 * Con `team` y más de un equipo, entre la marca y el avatar va el selector del equipo activo
 * (`TeamSwitcher`). Con uno solo no hay nada que elegir y no se pinta. La marca es la que cede
 * el sitio: se trunca antes de que el selector o el avatar se salgan.
 *
 * Se oculta cuando la pantalla trae una cabecera de detalle (ver `TopNavigation`).
 */
function HomeNavigation({ brand, account, team }: Omit<HomeProps, "variant">) {
  const sub = brand.wordmarkSub?.trim();

  return (
    <header
      data-topnav="home"
      className={`${BAR} group-has-[[data-topnav=detail]]/shell:hidden justify-between pr-(--space-2) pl-(--space-4)`}
    >
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
      <div className="flex min-w-0 shrink-0 items-center gap-(--space-1) pl-(--space-2)">
        {team && team.teams.length > 1 ? (
          <TeamSwitcher clubSlug={team.clubSlug} teams={team.teams} activeId={team.activeId} />
        ) : null}
        {account ? <AccountMenu name={account.name} links={account.links} /> : null}
      </div>
    </header>
  );
}

/**
 * Cabecera de una pantalla de detalle: volver (44×44) a la izquierda, el título centrado en
 * mayúsculas y, a la derecha, una acción con texto si se le pasa `action`. Sin acción deja un
 * hueco del tamaño de «volver» para que el título siga centrado.
 *
 * El título NOMBRA la pantalla («Biblioteca», «Ejercicio») y es un `<p>`, no un encabezado: la
 * página monta su propio `<h1>`, como las de The Way, y una pantalla debe tener uno solo. Si
 * la página quiere que se vea el mismo texto, lo repite en su `<h1>`; si no, su `<h1>` dice
 * lo que la cabecera no (el nombre del ejercicio). Un título que no cabe se trunca con puntos
 * suspensivos en vez de ensanchar la pantalla.
 *
 * No es un `banner` (un `<header>` dentro de `<main>` no lo es): mientras está, la de inicio
 * se oculta con `display: none` y sale del árbol de accesibilidad.
 */
function DetailNavigation({ title, backHref, action }: Omit<DetailProps, "variant">) {
  return (
    <header data-topnav="detail" className={`${BAR} gap-(--space-1) px-(--space-2)`}>
      <Link
        href={backHref}
        prefetch={false}
        aria-label="Volver"
        className="flex size-(--target-min) shrink-0 items-center justify-center rounded-pill text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <ChevronLeftIcon />
      </Link>
      <p className="min-w-0 flex-1 truncate text-center font-display text-title uppercase">{title}</p>
      {action ? (
        <CTAButton variant="ghost" href={action.href} className="shrink-0">
          {action.label}
        </CTAButton>
      ) : (
        <span aria-hidden="true" className="w-(--target-min) shrink-0" />
      )}
    </header>
  );
}
