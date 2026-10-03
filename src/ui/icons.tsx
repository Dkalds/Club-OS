import type { ReactNode } from "react";

/**
 * Iconos de línea del design system (design/README.md, «Iconografía»): trazo de 1.75px,
 * extremos redondeados, 20px, en `currentColor`. Son decorativos: van siempre junto a un
 * texto, o dentro de un control que ya tiene nombre accesible.
 */
export type IconProps = {
  /** Lado en píxeles: 20 por defecto; 16 y 28 son las variantes del sistema. */
  size?: number;
  /** 1.75 por defecto; la pestaña activa usa 2.25. */
  strokeWidth?: number;
  className?: string;
};

function Icon({
  size = 20,
  strokeWidth = 1.75,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `shrink-0 ${className}` : "shrink-0"}
    >
      {children}
    </svg>
  );
}

/** Inicio: casa. */
export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </Icon>
  );
}

/** Metodología del club: brújula. */
export function WayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5z" />
    </Icon>
  );
}

/** Entrenar: cronómetro. */
export function TrainIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6M12 2v3" />
    </Icon>
  );
}

/** Partidos: calendario. */
export function GamesIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Icon>
  );
}

/** Equipo: personas. */
export function TeamIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.3-6 6.5-6s5.9 2.4 6.5 6" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2 .8 3.2 2.9 3.5 6" />
    </Icon>
  );
}

/** Flecha a la derecha: lo que se abre al tocar una fila o un botón de avance. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

/** Flecha a la izquierda: volver a la pantalla de la que se viene. */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m15 6-6 6 6 6" />
    </Icon>
  );
}

/** Aviso: triángulo con exclamación, para un fallo que impide mostrar el contenido. */
export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17v.5" />
    </Icon>
  );
}

/** Hecho o guardado: una marca de verificación, siempre junto a la palabra que lo dice. */
export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

/** Borrador: un lápiz sobre su línea, para lo que aún se está escribiendo. */
export function DraftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
      <path d="m14.5 6.5 3 3" />
    </Icon>
  );
}
