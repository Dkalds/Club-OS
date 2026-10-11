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

/** Flecha hacia abajo: lo que abre una lista o una hoja de opciones. */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

/** Flecha hacia arriba: subir un elemento de una lista ordenada. */
export function ChevronUpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 15 6-6 6 6" />
    </Icon>
  );
}

/** Lupa: el campo de búsqueda. */
export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </Icon>
  );
}

/** Aspa: borrar un texto, o marcar lo cancelado. Va siempre junto a un nombre o una palabra. */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

/** Más: sumar minutos, o añadir algo a una lista. */
export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** Menos: restar minutos. */
export function MinusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14" />
    </Icon>
  );
}

/** Asa de arrastre: seis puntos, para lo que se reordena arrastrando. */
export function GripIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="6" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="18" r="1" />
    </Icon>
  );
}

/** Papelera: quitar algo de una lista. Va siempre junto a la palabra que lo dice. */
export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="m6 7 1 12.2a1 1 0 0 0 1 .8h8a1 1 0 0 0 1-.8L18 7" />
      <path d="M9 7V4.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V7" />
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

/** Biblioteca: un libro abierto. */
export function LibraryIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 6.5C10.2 5.2 7.6 4.5 4 4.5v13c3.6 0 6.2.7 8 2 1.8-1.3 4.4-2 8-2v-13c-3.6 0-6.2.7-8 2z" />
      <path d="M12 6.5v13" />
    </Icon>
  );
}

/** Pausa: dos barras. */
export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 5v14M15 5v14" />
    </Icon>
  );
}

/** Reanudar o reproducir: un triángulo. */
export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 3l14 9-14 9z" />
    </Icon>
  );
}

/** Ejercicio anterior: triángulo a la izquierda contra una barra. */
export function PreviousIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m18 5-9 7 9 7z" />
      <path d="M6 5v14" />
    </Icon>
  );
}

/** Ejercicio siguiente: triángulo a la derecha contra una barra. */
export function NextIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 5 9 7-9 7z" />
      <path d="M18 5v14" />
    </Icon>
  );
}

/** Reiniciar: una flecha que da la vuelta. */
export function RestartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4v5h5" />
      <path d="M4.6 9A8 8 0 1 1 4 12" />
    </Icon>
  );
}

/** Vídeo: una pantalla con su triángulo, siempre junto a la palabra «Vídeo». */
export function VideoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m10 9 5 3-5 3z" />
    </Icon>
  );
}
