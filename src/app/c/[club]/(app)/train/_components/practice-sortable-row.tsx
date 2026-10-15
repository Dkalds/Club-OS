"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, type ReactNode } from "react";
import { GripIcon } from "@/ui/icons";
import { PracticeItem, practiceItemName } from "@/ui/practice-item";
import type { Row } from "./practice-rows";

/**
 * Una fila de la lista del constructor: el `<li>` que dnd-kit mueve, con el asa de arrastre y,
 * dentro, `PracticeItem`. Va dentro de un `SortableContext`.
 *
 * Solo el asa arrastra: lleva los oyentes y los atributos de dnd-kit, y `touch-action: none`,
 * así que un dedo sobre ella mueve la fila y sobre el resto de la fila desplaza la página. Es
 * un botón de verdad: se llega con el tabulador y, con Espacio, coge la fila. Mide `target-min`
 * de lado aunque su hueco en la fila es de 32px: el margen negativo quita del ancho los 12px
 * que sobran, que invaden el hueco de al lado, que no es táctil (por la izquierda no puede: la
 * card recorta lo que sobresale). El icono va centrado en los 32px del hueco, y el anillo de
 * foco por dentro, por lo mismo.
 *
 * Con `focusTitle`, al montarse lleva el foco a su «Título» y se deja a la vista por encima de
 * la barra de guardado (el margen de desplazamiento del `<li>` es lo que miden la barra y la
 * navegación): es el bloque que se acaba de añadir, y se escribe sin tocar nada más.
 */
export function SortableRow({
  row,
  index,
  count,
  expanded,
  focusTitle,
  onToggle,
  onMinutes,
  onMove,
  onRemove,
  children,
}: {
  row: Row;
  index: number;
  count: number;
  expanded: boolean;
  focusTitle: boolean;
  onToggle: () => void;
  onMinutes: (delta: 5 | -5) => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, node, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.key, attributes: { roleDescription: "botón de ordenar" } });

  useEffect(() => {
    if (!focusTitle) return;
    node.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    node.current?.scrollIntoView({ block: "nearest" });
  }, [focusTitle, node]);

  return (
    <li
      ref={setNodeRef}
      data-row={row.key}
      // Solo se traslada: con filas de distinto alto (una abierta), escalar las deformaría.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`scroll-mb-[calc(var(--nav-height)+env(safe-area-inset-bottom)+var(--target-min)+var(--space-8))] ${
        isDragging ? "relative z-10" : ""
      }`}
    >
      <PracticeItem
        index={index}
        title={row.title}
        phase={row.phase}
        hint={row.hint}
        minutes={row.minutes}
        isFirst={index === 0}
        isLast={index === count - 1}
        expanded={expanded}
        dragging={isDragging}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            aria-label={`Mover ${practiceItemName(row.title)}`}
            className="relative -mr-(--space-3) flex size-(--target-min) shrink-0 cursor-grab touch-none items-center select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <span className="flex w-8 justify-center">
              <GripIcon />
            </span>
          </button>
        }
        onToggle={onToggle}
        onMinutes={onMinutes}
        onMove={onMove}
        onRemove={onRemove}
      >
        {children}
      </PracticeItem>
    </li>
  );
}
