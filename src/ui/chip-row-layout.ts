import { vi } from "vitest";

// Solo para tests: jsdom no calcula posiciones ni anchos (todo mide 0), así que lo que una fila
// de chips hace con su desplazamiento no se puede ver sin darle un diseño falso. Este es el
// más simple: cada fila (`role="group"`) mide `rowWidth`, cada botón de dentro mide `chipWidth`
// y van uno detrás de otro desde la izquierda, desplazados lo que la fila lleve scrolleado.
// Vive aquí y no en cada test porque lo usan el de `filter` y el de la barra de filtros.

type Layout = { rowWidth: number; chipWidth: number };

export type ChipRowLayout = {
  /** Cada llamada a `scrollTo` de una fila (`mock.contexts` dice cuál). */
  scrollTo: ReturnType<typeof vi.fn>;
  /** Lo que lleva desplazada una fila ahora mismo. */
  scrollLeftOf: (row: Element) => number;
  /** Mueve la fila como lo haría quien la arrastra con el dedo (sin llamar a `scrollTo`). */
  dragRow: (row: Element, left: number) => void;
  /** Deja jsdom como estaba. */
  restore: () => void;
};

type Patched = "clientWidth" | "scrollLeft" | "scrollTo";

export function installChipRowLayout({ rowWidth, chipWidth }: Layout): ChipRowLayout {
  const scrolled = new WeakMap<Element, number>();
  const isRow = (element: Element) => element.getAttribute("role") === "group";
  const scrollLeftOf = (row: Element) => scrolled.get(row) ?? 0;

  const scrollTo = vi.fn(function scrollToStub(this: HTMLElement, options?: ScrollToOptions) {
    scrolled.set(this, options?.left ?? 0);
  });

  const rect = (left: number, width: number): DOMRect => ({
    x: left,
    y: 0,
    left,
    top: 0,
    width,
    height: 36,
    right: left + width,
    bottom: 36,
    toJSON: () => ({}),
  });

  const measure = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (isRow(this)) return rect(0, rowWidth);

    const row = this.parentElement;
    if (!row || !isRow(row) || this.tagName !== "BUTTON") return rect(0, 0);

    const chips = Array.from(row.children).filter((child) => child.tagName === "BUTTON");
    return rect(chips.indexOf(this) * chipWidth - scrollLeftOf(row), chipWidth);
  });

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return isRow(this) ? rowWidth : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollLeft", {
    configurable: true,
    get(this: HTMLElement) {
      return scrollLeftOf(this);
    },
    set(this: HTMLElement, left: number) {
      scrolled.set(this, left);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    writable: true,
    value: scrollTo,
  });

  return {
    scrollTo,
    scrollLeftOf,
    dragRow: (row, left) => scrolled.set(row, left),
    restore: () => {
      measure.mockRestore();
      for (const name of ["clientWidth", "scrollLeft", "scrollTo"] satisfies Patched[]) {
        delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
      }
    },
  };
}
