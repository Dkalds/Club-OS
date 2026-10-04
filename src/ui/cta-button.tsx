import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type CTAButtonVariant = "primary" | "secondary" | "ghost" | "on-spotlight" | "danger";
export type CTAButtonSize = "md" | "live";

type OwnProps = {
  variant: CTAButtonVariant;
  size?: CTAButtonSize;
  /** Ancho completo: el caso por defecto en móvil para la acción principal. */
  block?: boolean;
  /** Icono a la izquierda de la etiqueta (decorativo: `aria-hidden`). */
  icon?: ReactNode;
  children: ReactNode;
};

type AsLink = OwnProps & { href: string } & Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    keyof OwnProps | "href"
  >;

type AsButton = OwnProps & { href?: undefined } & Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    keyof OwnProps
  >;

/** Con `href` es un enlace (`<a>`); sin él, un `<button>` con los atributos de un botón. */
export type CTAButtonProps = AsLink | AsButton;

// El color, el borde y el padding van en la variante y no aquí: dos utilidades del mismo
// grupo en un elemento las gana la que Tailwind escriba la última, no la que va después en
// `className`. Las de `disabled:` llevan más especificidad y ganan siempre.
const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-(--space-2) border font-display font-bold " +
  "tracking-[0.04em] uppercase focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "disabled:cursor-default disabled:border-transparent disabled:bg-surface-2 disabled:text-ink-3";

const FOCUS_RING = "focus-visible:outline-focus-ring";

const VARIANT_CLASS: Record<CTAButtonVariant, string> = {
  primary: `border-transparent bg-brand-accent px-(--space-5) text-brand-on-accent not-disabled:active:bg-brand-accent-pressed ${FOCUS_RING}`,
  secondary: `border-line-strong bg-transparent px-(--space-5) text-ink not-disabled:active:bg-surface-3 ${FOCUS_RING}`,
  ghost: `border-transparent bg-transparent px-(--space-2) text-brand-accent ${FOCUS_RING}`,
  // El acento sobre `spotlight` no llega a contraste (1.9:1): el botón es oscuro y el
  // acento va en el texto. El anillo de foco por defecto (`ink`) se confunde con el fondo
  // claro de la card destacada, así que aquí es `on-spotlight`.
  "on-spotlight":
    "border-transparent bg-on-spotlight px-(--space-5) text-brand-accent focus-visible:outline-on-spotlight",
  // Lo destructivo (quitar, salir sin guardar): como `secondary`, pero con el borde y el texto
  // en `danger`, que es de plataforma y no cambia con el club. Nunca relleno: el único relleno
  // de una pantalla es el acento del CTA principal. Pulsado se tinta con `danger-soft`.
  danger: `border-danger bg-transparent px-(--space-5) text-danger not-disabled:active:bg-danger-soft ${FOCUS_RING}`,
};

// `20px` del botón `live`: design/components/bundle.css; no hay estilo de texto con esa medida.
const SIZE_CLASS: Record<CTAButtonSize, string> = {
  md: "min-h-(--target-min) rounded-md text-body-l",
  live: "min-h-(--target-live) rounded-lg text-[20px]",
};

/**
 * La acción principal de una pantalla y sus variantes (design/components/CTAButton).
 *
 * Con `href` es un enlace, porque navega; sin él es un botón y, salvo que se diga lo
 * contrario, `type="button"` para que no envíe formularios por accidente.
 *
 * Los enlaces no precargan: sus destinos son rutas dinámicas detrás del proxy de sesión
 * (mismo motivo que `BottomNavigation`).
 */
export function CTAButton(props: CTAButtonProps) {
  const { variant, size = "md", block = false, icon, children, className, ...rest } = props;
  const classes = [BASE, VARIANT_CLASS[variant], SIZE_CLASS[size], block ? "w-full" : null, className]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {icon}
      {children}
    </>
  );

  if (rest.href !== undefined) {
    const { href, ...anchorProps } = rest;
    return (
      <Link {...anchorProps} href={href} prefetch={false} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button {...rest} type={rest.type ?? "button"} className={classes}>
      {content}
    </button>
  );
}
