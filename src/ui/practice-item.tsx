import Link from "next/link";
import type { ReactNode } from "react";
import { builderMinutes, itemNumber } from "@/modules/practice/format";
import { CTAButton } from "./cta-button";
import { ChevronDownIcon, ChevronRightIcon, ChevronUpIcon, MinusIcon, PlusIcon, TrashIcon } from "./icons";

// Sin `"use client"`, como `states.tsx`: el archivo no usa hooks. `PracticeItemView` y
// `PracticeTotal` son piezas de servidor (el detalle de una sesión), y solo `PracticeItem` lleva
// manejadores, que le llegan de un componente de cliente (el constructor). Desde un componente
// de servidor no se le pueden pasar funciones.
//
// Medidas de design/components/bundle.css (`.cos-pi*`): la fila mide 72px (`min-h-18`), el asa
// 32px de ancho (`w-8`), el número 36px (`w-9`) y cada botón de minutos 36px (`size-9`). Los
// 20px de los minutos no tienen estilo de texto.

/** El título que se lee y se anuncia cuando un bloque libre aún no tiene (recién añadido). */
const UNTITLED = "Sin título";

const NUMBER = "w-9 shrink-0 font-display text-numeral text-brand-accent tabular-nums";
const MINUTES = "w-10 shrink-0 text-center font-display text-[20px] font-bold tabular-nums";

/** «15 minutos» para quien escucha; «15'» solo se ve (un lector diría «15 apóstrofo»). */
function spokenMinutes(minutes: number): string {
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

/** La duración de un ítem: «15'» a la vista y «15 minutos» para los lectores de pantalla. */
function Minutes({ minutes, className }: { minutes: number; className: string }) {
  return (
    <span className={className}>
      <span aria-hidden="true">{builderMinutes(minutes)}</span>
      <span className="sr-only">{spokenMinutes(minutes)}</span>
    </span>
  );
}

/**
 * La fase en `label` y debajo el título del ítem. Cada uno es un bloque; el espacio entre los
 * dos es para quien lo escucha («Técnica 3 calles»): entre bloques no ocupa sitio. Un título
 * largo pasa a otra línea en vez de cortarse: es lo que distingue un ítem de otro.
 */
function PhaseAndTitle({ phase, title }: { phase: string | null; title: string }) {
  return (
    <>
      {phase ? (
        <>
          <span className="block text-label text-ink-2 uppercase">{phase}</span>{" "}
        </>
      ) : null}
      <span className="block text-body-strong wrap-break-word">{title.trim() || UNTITLED}</span>
    </>
  );
}

// Los botones de la fila miden `target-min` y se ven de 36px: el botón es el área y la píldora
// de dentro, lo que se ve (como los chips de `Filter`). `-mx-1` quita del ancho de la fila los
// 4px que sobran a cada lado, para que ocupe lo mismo que en la vista previa; el área táctil
// sigue siendo de 44px y solo invade el hueco de al lado, que no es táctil. El anillo de foco va
// por dentro de la píldora: la card recorta lo que sobresale.
const MINUTES_BUTTON =
  "group -mx-1 inline-flex min-h-(--target-min) min-w-(--target-min) shrink-0 cursor-pointer items-center justify-center focus-visible:outline-hidden";
const MINUTES_PILL =
  "inline-flex size-9 items-center justify-center rounded-pill bg-surface-2 text-ink-2 group-active:bg-surface-3 " +
  "group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-focus-ring";

function MinutesButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={MINUTES_BUTTON}>
      <span className={MINUTES_PILL}>{children}</span>
    </button>
  );
}

/**
 * Un ítem de una sesión en el Practice Builder (design/components/PracticeItem): asa, número,
 * fase y título, y sus minutos con los botones de −5 y +5. Fila de 72px.
 *
 * Solo pinta: ni arrastra ni guarda. `handle` es el hueco del asa (el constructor pone ahí su
 * botón de arrastre, que ocupa todo el hueco: 32px por 44px); sin él, el hueco queda vacío
 * y la fila conserva su sitio. Con `dragging` la fila pasa a `surface-3` con `shadow-sheet`, y
 * el asa sube a `ink-2` (`ink-3` no va sobre `surface-3`).
 *
 * La fase y el título son un solo botón que abre y cierra la fila (`aria-expanded`;
 * `expanded` lo manda quien lo monta). Abierta, pinta `children` (el editor de la fila) y las
 * acciones «Subir», «Bajar» y «Quitar». Los botones solo con icono llevan el título en su
 * nombre («Más minutos, 3 calles»): en una lista de ítems, sin él no se sabría de cuál se habla.
 * «Subir» y «Bajar» se desactivan en los extremos (`isFirst`, `isLast`) y son la alternativa
 * a arrastrar.
 *
 * No es un `<li>`: quien la monta en una lista pone el suyo, y con él lo que necesite, como
 * la referencia y la transformación de dnd-kit. Cada fila lleva su separador, un borde arriba
 * de `line`, y no lo lleva la que va en el primer `<li>` de la lista.
 */
export function PracticeItem({
  index,
  title,
  phase,
  minutes,
  isFirst,
  isLast,
  expanded,
  dragging = false,
  handle,
  onToggle,
  onMinutes,
  onMove,
  onRemove,
  children,
}: {
  index: number;
  title: string;
  phase: string | null;
  minutes: number;
  isFirst: boolean;
  isLast: boolean;
  expanded: boolean;
  dragging?: boolean;
  handle?: ReactNode;
  onToggle: () => void;
  onMinutes: (delta: 5 | -5) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const name = title.trim() || UNTITLED;

  return (
    <div
      className={`border-t border-line [li:first-child>&]:border-t-0 ${
        dragging ? "bg-surface-3 shadow-sheet" : "bg-surface-1"
      }`}
    >
      <div className="flex min-h-18 items-center gap-(--space-2) py-(--space-2) pr-(--space-2)">
        <div
          className={`flex h-(--target-min) w-8 shrink-0 items-center justify-center ${
            dragging ? "text-ink-2" : "text-ink-3"
          }`}
        >
          {handle}
        </div>
        <span className={NUMBER}>{itemNumber(index)}</span>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="min-h-(--target-min) min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
        >
          <PhaseAndTitle phase={phase} title={title} />
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <MinutesButton label={`Menos minutos, ${name}`} onClick={() => onMinutes(-5)}>
            <MinusIcon size={16} />
          </MinutesButton>
          <Minutes minutes={minutes} className={MINUTES} />
          <MinutesButton label={`Más minutos, ${name}`} onClick={() => onMinutes(5)}>
            <PlusIcon size={16} />
          </MinutesButton>
        </div>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-(--space-3) px-(--space-4) pt-(--space-1) pb-(--space-4)">
          {children}
          <div className="flex items-center gap-(--space-2)">
            <CTAButton
              variant="secondary"
              aria-label={`Subir ${name}`}
              disabled={isFirst}
              onClick={() => onMove("up")}
            >
              <ChevronUpIcon size={16} />
            </CTAButton>
            <CTAButton
              variant="secondary"
              aria-label={`Bajar ${name}`}
              disabled={isLast}
              onClick={() => onMove("down")}
            >
              <ChevronDownIcon size={16} />
            </CTAButton>
            <CTAButton
              variant="danger"
              aria-label={`Quitar ${name}`}
              icon={<TrashIcon size={16} />}
              className="ml-auto"
              onClick={onRemove}
            >
              Quitar
            </CTAButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Un ítem de una sesión ya hecha o solo para leer: su número, la fase y el título, y los
 * minutos a la derecha. Es un `<li>`: va como hijo directo de una lista, por ejemplo
 * `<Card variant="flush" as="ul">`, que es la que la anuncia como lista.
 *
 * Con `href` la fila entera es un único enlace (área táctil de 72px) con su chevron, como
 * `ListRow`, y sin precarga: el destino es una ruta dinámica detrás del proxy de sesión. Sin
 * `href`, es texto. El separador es el borde superior del `<li>`, salvo en la primera fila.
 * Pulsada, la fila pasa a `surface-3`.
 */
export function PracticeItemView({
  index,
  title,
  phase,
  minutes,
  href,
}: {
  index: number;
  title: string;
  phase: string | null;
  minutes: number;
  href?: string;
}) {
  const row = "flex min-h-18 items-center gap-(--space-2) px-(--space-4) py-(--space-2) text-ink";
  const content = (
    <>
      <span className={NUMBER}>{itemNumber(index)}</span>
      <span className="min-w-0 flex-1">
        <PhaseAndTitle phase={phase} title={title} />
      </span>
      <Minutes minutes={minutes} className={MINUTES} />
      {href !== undefined ? <ChevronRightIcon size={16} className="text-ink-3 group-active:text-ink-2" /> : null}
    </>
  );

  return (
    <li className="border-t border-line first:border-t-0">
      {href !== undefined ? (
        <Link
          href={href}
          // Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión.
          prefetch={false}
          className={`group ${row} active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring`}
        >
          {content}
        </Link>
      ) : (
        <div className={row}>{content}</div>
      )}
    </li>
  );
}

/**
 * La fila del total de una sesión, al final de la lista: «Total» y la suma de los minutos de
 * sus ítems (`builderMinutes`). La suma no se guarda, se calcula. Una raya `line-strong` la
 * separa de las filas.
 */
export function PracticeTotal({ minutes }: { minutes: number }) {
  return (
    <div className="flex items-center justify-between border-t border-line-strong px-(--space-4) py-(--space-3)">
      <span className="font-display text-title uppercase">Total</span>
      <Minutes minutes={minutes} className="font-display text-numeral tabular-nums" />
    </div>
  );
}
