"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BottomSheet } from "./bottom-sheet";
import { CheckIcon, ChevronDownIcon } from "./icons";

// El archivo es de cliente por los chips que reaccionan al toque (`Filter`, `FilterSheetChip`).
// `FilterTag`, la etiqueta sin comportamiento de las cards, vive en `./filter-tag`, que no es de
// cliente: un componente de servidor (`DrillCard`) la importa de allí y no arrastra este
// archivo, la hoja inferior ni Radix. Aquí se re-exporta para quien use todo el filtro.
export { FilterTag } from "./filter-tag";

export type FilterOption = { value: string; label: string };

/** Lo que pide quien monta un filtro: las opciones, la selección actual y el aviso de cambio. */
export type FilterProps = {
  /** El nombre del filtro («Objetivo», «Edad»): el de su grupo y el del chip si no hay valor. */
  label: string;
  /** Vienen de la taxonomía del club (`focus_areas`…), nunca fijas en código. */
  options: FilterOption[];
  /** El `value` de la opción elegida, o `null` si no hay filtro. */
  value: string | null;
  onChange: (value: string | null) => void;
};

// El chip mide 36px (`.cos-chip` de design/components/bundle.css) pero su área táctil, 44px:
// el botón es el área (`target-min`) y la píldora de dentro es lo que se ve. El estado sale
// de `aria-pressed` del botón, que es el `group` de la píldora. El anillo de foco va por
// dentro de la píldora: la fila se desplaza en horizontal, y eso recorta lo que sobresale.
const CHIP_BUTTON =
  "group inline-flex min-h-(--target-min) shrink-0 cursor-pointer items-center focus-visible:outline-hidden";
const CHIP_PILL =
  "inline-flex h-9 items-center gap-(--space-1) rounded-pill border border-line bg-surface-2 px-(--space-3) " +
  "text-body-s font-semibold whitespace-nowrap text-ink-2 " +
  "group-aria-pressed:border-brand-accent group-aria-pressed:bg-brand-accent-soft group-aria-pressed:text-brand-accent " +
  "group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-focus-ring";

// Fila de chips: desplazamiento horizontal sin barra (nunca dos filas de chips).
const CHIP_ROW =
  "flex gap-(--space-2) overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * Desplaza `row` en horizontal lo justo para que `chips` se vean enteros, sin tocar nada más:
 * `scrollTo` de la propia fila, nunca `scrollIntoView` (que también mueve la página y puede
 * llevarse el foco por delante). Si ya se ven, no hace nada. Si los chips no caben juntos se
 * enseña el primero, y uno más ancho que la fila se alinea por su principio. Es instantáneo: no
 * hay animación que respetar ni salto que se vea correr.
 */
function revealChips(row: HTMLElement, chips: HTMLElement[]) {
  const origin = row.getBoundingClientRect().left;
  const spans = chips.map((chip) => {
    const { left, right } = chip.getBoundingClientRect();
    return { start: left - origin, end: right - origin };
  });

  let start = Math.min(...spans.map((span) => span.start));
  let end = Math.max(...spans.map((span) => span.end));
  if (end - start > row.clientWidth) ({ start, end } = spans[0]);

  // Los textos miden con decimales y el desplazamiento se redondea: se pide siempre un poco de
  // más (hacia fuera), o quedaría una rendija de menos de un píxel sin ver.
  if (start < 0) {
    row.scrollTo({ left: row.scrollLeft + Math.floor(start), behavior: "instant" });
  } else if (end > row.clientWidth) {
    const missing = Math.min(Math.ceil(end - row.clientWidth), Math.floor(start));
    row.scrollTo({ left: row.scrollLeft + missing, behavior: "instant" });
  }
}

/**
 * Una fila de chips con su nombre, la misma que usa `Filter`: se desplaza en horizontal sin
 * barra y no pasa a una segunda línea. Para quien monta, junto a un `Filter`, chips sueltos
 * (los de `FilterSheetChip` o un `Chip`) y no quiere repetir las clases de la fila.
 *
 * Lleva a la vista el chip que se acaba de pulsar (`aria-pressed`): al cargar la fila con un
 * filtro puesto (un enlace, una recarga, Atrás, que la montan desde el principio) el chip activo
 * puede quedar fuera, y entonces ni «Todos» ni ningún otro se verían pulsados. Solo mira los
 * chips que ACABAN de pulsarse (los que no lo estaban en el render anterior; al montar, todos): lo
 * que la persona desplaza a mano no se deshace en el siguiente render, y tocar un chip que ya se
 * ve no mueve la fila. Antes de pintar, para que no se vea la fila en su sitio y luego saltar.
 */
export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const alreadyPressed = useRef<Set<Element>>(new Set());

  useLayoutEffect(() => {
    const element = row.current;
    if (!element) return;

    // Solo los botones de la fila: una hoja abierta cuelga de otro sitio, no de ella.
    const pressed = Array.from(element.children).filter(
      (child): child is HTMLElement => child.getAttribute("aria-pressed") === "true",
    );
    const fresh = pressed.filter((chip) => !alreadyPressed.current.has(chip));
    alreadyPressed.current = new Set(pressed);

    if (fresh.length > 0) revealChips(element, fresh);
  });

  return (
    <div ref={row} role="group" aria-label={label} className={CHIP_ROW}>
      {children}
    </div>
  );
}

/**
 * Un chip suelto, con la forma de los de `Filter` y `FilterSheetChip`: botón de 44px con la
 * píldora de 36px dentro, `aria-pressed` según `pressed`. `label` es su nombre accesible
 * cuando el texto que se ve no basta para decir qué hace («Principio: Rebote» no dice que
 * pulsarlo lo quita).
 */
export function Chip({
  pressed,
  onClick,
  popup,
  label,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  popup?: boolean;
  label?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-haspopup={popup ? "dialog" : undefined}
      aria-label={label}
      onClick={onClick}
      className={CHIP_BUTTON}
    >
      <span className={CHIP_PILL}>{children}</span>
    </button>
  );
}

/**
 * Chips de selección única para filtrar una lista (design/components/Filter): «Todos» primero
 * y una opción por chip. El chip activo lleva `aria-pressed` y se pinta con
 * `brand-accent-soft`, borde y texto `brand-accent`; nunca con el acento relleno, que es del
 * CTA principal.
 *
 * Quien lo monta da las opciones (son datos del club) y recibe `onChange` con el `value` de la
 * opción pulsada, o `null` con «Todos». Es un grupo con el nombre de `label`. Para una lista
 * larga de valores, o para un filtro que no cabe en la fila, `FilterSheetChip`.
 */
export function Filter({ label, options, value, onChange }: FilterProps) {
  return (
    <FilterRow label={label}>
      <Chip pressed={value === null} onClick={() => onChange(null)}>
        Todos
      </Chip>
      {options.map((option) => (
        <Chip key={option.value} pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </Chip>
      ))}
    </FilterRow>
  );
}

// Cada opción de la hoja es un botón de ancho completo y `target-min` de alto. La elegida va en
// el acento del club y lleva una marca: no solo se distingue por el color.
const SHEET_OPTION =
  "flex min-h-(--target-min) w-full cursor-pointer items-center justify-between gap-(--space-3) border-t border-line " +
  "px-(--space-4) py-(--space-2) text-left text-body text-ink first:border-t-0 active:bg-surface-3 " +
  "aria-pressed:font-semibold aria-pressed:text-brand-accent " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";

/**
 * Un filtro que se elige en una hoja inferior (design/components/Filter, «fila de
 * desplegables»): edad, jugadores, duración.
 *
 * Sin valor, el chip muestra `label`. Con valor, muestra la opción elegida y queda activo
 * (`aria-pressed`) mientras el filtro lo tenga. La hoja, con `title` como título, ofrece
 * «Cualquiera» (`onChange(null)`) y las opciones; elegir una cierra la hoja. Cerrarla sin
 * elegir no cambia nada. Si `value` es algo que ya no está entre las opciones, el chip sigue
 * activo con su etiqueta: el filtro existe aunque no se sepa nombrarlo.
 */
export function FilterSheetChip({
  label,
  title,
  options,
  value,
  onChange,
}: FilterProps & { title: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  function choose(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <>
      <Chip pressed={value !== null} popup onClick={() => setOpen(true)}>
        {selected?.label ?? label}
        <ChevronDownIcon size={16} />
      </Chip>
      <BottomSheet open={open} onOpenChange={setOpen} title={title}>
        <SheetOption pressed={value === null} onClick={() => choose(null)}>
          Cualquiera
        </SheetOption>
        {options.map((option) => (
          <SheetOption
            key={option.value}
            pressed={value === option.value}
            onClick={() => choose(option.value)}
          >
            {option.label}
          </SheetOption>
        ))}
      </BottomSheet>
    </>
  );
}

function SheetOption({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={SHEET_OPTION}>
      {children}
      {pressed ? <CheckIcon size={16} /> : null}
    </button>
  );
}
