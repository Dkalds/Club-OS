import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollToHash } from "./scroll-to-hash";

// jsdom no implementa `scrollIntoView`: se instala un doble en el prototipo y cada test mira a
// qué elemento se le ha pedido y con qué opciones. Datos neutros: ningún club.

const scrollIntoView = vi.fn();
let original: typeof Element.prototype.scrollIntoView | undefined;

/** Pone la URL de la página con ese fragmento, sin navegar. */
function setHash(hash: string) {
  window.history.replaceState(null, "", `/ruta${hash}`);
}

/** Dónde está la página desplazada: jsdom no desplaza, así que se fija a mano. */
function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { value, configurable: true, writable: true });
}

function addElement(id: string): HTMLElement {
  const element = document.createElement("section");
  element.id = id;
  document.body.append(element);
  return element;
}

beforeEach(() => {
  original = Element.prototype.scrollIntoView;
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
  setScrollY(0);
});

afterEach(() => {
  Element.prototype.scrollIntoView = original as typeof Element.prototype.scrollIntoView;
  setScrollY(0);
  window.history.replaceState(null, "", "/");
  document.body.replaceChildren();
});

describe("ScrollToHash", () => {
  it("lleva la página al elemento que nombra el fragmento de la URL", () => {
    const target = addElement("principle-ataque");
    setHash("#principle-ataque");

    render(<ScrollToHash />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(target);
  });

  it("sin animación y alineado arriba: el margen de scroll del destino lo deja bajo la cabecera", () => {
    addElement("standard-03");
    setHash("#standard-03");

    render(<ScrollToHash />);

    // `scrollIntoView` respeta `scroll-margin-top` (`anchor-below-header`), así que la
    // cabecera fija no tapa el destino. `instant` por encima de un `scroll-behavior: smooth`.
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
  });

  it("no pinta nada", () => {
    addElement("principle-ataque");
    setHash("#principle-ataque");

    const { container } = render(<ScrollToHash />);

    expect(container).toBeEmptyDOMElement();
  });

  it("sin fragmento no hace nada", () => {
    addElement("principle-ataque");
    setHash("");

    render(<ScrollToHash />);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("con un fragmento vacío («#») tampoco", () => {
    addElement("principle-ataque");
    setHash("#");

    render(<ScrollToHash />);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("si no hay ningún elemento con ese id no hace nada", () => {
    addElement("principle-ataque");
    setHash("#principle-no-existe");

    render(<ScrollToHash />);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("un fragmento mal codificado no lanza ni se lleva a ningún sitio", () => {
    addElement("principle-ataque");
    setHash("#principle-%E0%A4%A");

    expect(() => render(<ScrollToHash />)).not.toThrow();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("decodifica el fragmento: «#principio-%C3%A9tica» es el id «principio-ética»", () => {
    const target = addElement("principio-ética");
    setHash("#principio-%C3%A9tica");

    render(<ScrollToHash />);

    expect(scrollIntoView.mock.contexts[0]).toBe(target);
  });

  it("prueba el fragmento tal cual antes de decodificarlo", () => {
    // Un id que contiene «%41» literal y no «A».
    const target = addElement("ancla-%41");
    addElement("ancla-A");
    setHash("#ancla-%41");

    render(<ScrollToHash />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(target);
  });

  it("busca por id, sin construir un selector: lo que no sería un selector válido funciona", () => {
    // `#1abc` y `#a.b` no son selectores válidos / buscan otra cosa; `getElementById` los
    // encuentra sin problema.
    const numeric = addElement("1abc");
    const dotted = addElement("a.b");

    setHash("#1abc");
    const first = render(<ScrollToHash />);
    first.unmount();
    setHash("#a.b");
    render(<ScrollToHash />);

    expect(scrollIntoView.mock.contexts).toEqual([numeric, dotted]);
  });

  it("un fragmento con comillas o corchetes no lanza", () => {
    addElement("principle-ataque");
    setHash('#principle-ataque"]%20,%20[id');

    expect(() => render(<ScrollToHash />)).not.toThrow();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("una sola vez: ni al volver a pintarse ni al cambiar el fragmento después", () => {
    addElement("principle-ataque");
    addElement("principle-defensa");
    setHash("#principle-ataque");

    const view = render(<ScrollToHash />);
    view.rerender(<ScrollToHash />);
    setHash("#principle-defensa");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    view.rerender(<ScrollToHash />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("no tira de la persona hacia atrás: si la página ya no está arriba, la deja donde está", () => {
    // El navegador (o Next) ya ha saltado al destino, o la persona ha seguido leyendo antes de
    // que este componente se hidratara. Volver al ancla sería un tirón.
    addElement("principle-ataque");
    setHash("#principle-ataque");
    setScrollY(480);

    render(<ScrollToHash />);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("no mueve el foco", () => {
    const target = addElement("principle-ataque");
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    setHash("#principle-ataque");

    render(<ScrollToHash />);

    expect(document.activeElement).toBe(other);
    expect(target).not.toHaveFocus();
  });
});
