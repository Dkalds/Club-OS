import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PracticeItem, PracticeItemView, PracticeTotal, practiceItemName } from "./practice-item";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TITLE = "Movilidad + rueda de pases";

function renderItem(overrides: Partial<Parameters<typeof PracticeItem>[0]> = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onMinutes: vi.fn(),
    onMove: vi.fn(),
    onRemove: vi.fn(),
  };
  const view = render(
    <PracticeItem
      index={0}
      title={TITLE}
      phase="Activación"
      minutes={15}
      isFirst={false}
      isLast={false}
      expanded={false}
      {...handlers}
      {...overrides}
    />,
  );

  return { ...handlers, ...view };
}

// El botón que abre y cierra la fila: su nombre es la fase y el título, tal como se leen.
const toggle = (name = `Activación ${TITLE}`) => screen.getByRole("button", { name });

describe("PracticeItem", () => {
  it("pinta el número en dos cifras, la fase, el título y los minutos", () => {
    renderItem({ index: 0 });

    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("Activación")).toBeInTheDocument();
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText("15'")).toBeInTheDocument();
  });

  it("el número se cuenta desde 1 y va en el acento del club", () => {
    renderItem({ index: 8 });

    expect(screen.getByText("09")).toHaveClass("font-display", "text-numeral", "text-brand-accent");
  });

  it("anuncia los minutos como minutos, no como «15 apóstrofo»", () => {
    renderItem({ minutes: 15 });

    expect(screen.getByText("15'")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("15 minutos")).toBeInTheDocument();
  });

  it("con un minuto lo dice en singular", () => {
    renderItem({ minutes: 1 });

    expect(screen.getByText("1 minuto")).toBeInTheDocument();
  });

  it("sin fase no pinta etiqueta, y la fila sigue teniendo su título", () => {
    renderItem({ phase: null });

    expect(screen.queryByText("Activación")).not.toBeInTheDocument();
    expect(toggle(TITLE)).toHaveTextContent(TITLE);
  });

  it("un título vacío (un bloque libre recién añadido) se nombra «Sin título»", () => {
    renderItem({ title: "   " });

    expect(toggle("Activación Sin título")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Más minutos, Sin título" })).toBeInTheDocument();
  });

  describe("la línea de por qué está ahí (`hint`)", () => {
    const HINT = "Transición · 2 puntos clave · 1 variante";

    it("sale bajo el título, dentro del botón que abre la fila", () => {
      renderItem({ hint: HINT });

      const line = screen.getByText(HINT);
      const button = screen.getByRole("button", { name: `Activación ${TITLE} ${HINT}` });
      expect(button).toHaveAttribute("data-control", "toggle");
      expect(button).toContainElement(line);
      // Debajo del título, y la última línea del botón: fase, título y por qué.
      expect(screen.getByText(TITLE).compareDocumentPosition(line)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(button.lastElementChild).toBe(line);
      expect(Array.from(button.children).map((child) => child.textContent)).toEqual(["Activación", TITLE, HINT]);
    });

    it("es una línea aparte, en body-s y en ink-2: el título sigue siendo lo que más pesa", () => {
      renderItem({ hint: HINT });

      expect(screen.getByText(HINT)).toHaveClass("block", "text-body-s", "text-ink-2", "wrap-break-word");
      expect(screen.getByText(TITLE)).toHaveClass("text-body-strong");
    });

    it("no cambia el nombre de los demás botones de la fila: siguen llevando solo el título", () => {
      renderItem({ hint: HINT, expanded: true });

      for (const name of [`Más minutos, ${TITLE}`, `Menos minutos, ${TITLE}`, `Subir ${TITLE}`, `Quitar ${TITLE}`]) {
        expect(screen.getByRole("button", { name }), name).toBeInTheDocument();
      }
    });

    it("pulsar la línea abre la fila, como pulsar el título", () => {
      const { onToggle } = renderItem({ hint: HINT });

      fireEvent.click(screen.getByText(HINT));

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("sin `hint`, o con uno vacío, no hay línea: el botón acaba en el título", () => {
      const { unmount } = renderItem();
      expect(toggle().lastElementChild).toBe(screen.getByText(TITLE));
      expect(toggle().children).toHaveLength(2);
      unmount();

      renderItem({ hint: "" });
      expect(toggle().lastElementChild).toBe(screen.getByText(TITLE));
      expect(toggle().children).toHaveLength(2);
    });
  });

  describe("minutos", () => {
    it("«Más minutos, {título}» llama a onMinutes(5)", () => {
      const { onMinutes } = renderItem();

      fireEvent.click(screen.getByRole("button", { name: `Más minutos, ${TITLE}` }));

      expect(onMinutes).toHaveBeenCalledTimes(1);
      expect(onMinutes).toHaveBeenCalledWith(5);
    });

    it("«Menos minutos, {título}» llama a onMinutes(-5)", () => {
      const { onMinutes } = renderItem();

      fireEvent.click(screen.getByRole("button", { name: `Menos minutos, ${TITLE}` }));

      expect(onMinutes).toHaveBeenCalledTimes(1);
      expect(onMinutes).toHaveBeenCalledWith(-5);
    });

    it("los dos botones miden 44 px de área aunque se vean de 36", () => {
      renderItem();

      for (const name of [`Más minutos, ${TITLE}`, `Menos minutos, ${TITLE}`]) {
        const button = screen.getByRole("button", { name });
        expect(button, name).toHaveAttribute("type", "button");
        expect(button, name).toHaveClass("min-h-(--target-min)", "min-w-(--target-min)");
        // Lo que se ve es la píldora de dentro.
        expect(button.firstElementChild, name).toHaveClass("size-9", "rounded-pill", "bg-surface-2");
      }
    });

    it("los minutos quedan entre los dos botones", () => {
      renderItem();

      const less = screen.getByRole("button", { name: `Menos minutos, ${TITLE}` });
      const more = screen.getByRole("button", { name: `Más minutos, ${TITLE}` });
      const minutes = screen.getByText("15'");
      expect(less.compareDocumentPosition(minutes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(minutes.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe("abrir y cerrar", () => {
    it("el título y la fase son un solo botón con aria-expanded", () => {
      renderItem();

      expect(toggle()).toHaveTextContent("Activación");
      expect(toggle()).toHaveTextContent(TITLE);
      expect(toggle()).toHaveAttribute("type", "button");
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(toggle()).toHaveClass("min-h-(--target-min)");
    });

    it("pulsarlo llama a onToggle", () => {
      const { onToggle } = renderItem();

      fireEvent.click(toggle());

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("el estado lo manda `expanded`: con true, aria-expanded es true", () => {
      renderItem({ expanded: true });

      expect(toggle()).toHaveAttribute("aria-expanded", "true");
    });

    it("el título cambia aria-expanded al abrir y cerrar la fila", () => {
      function Harness() {
        const [expanded, setExpanded] = useState(false);

        return (
          <PracticeItem
            index={0}
            title={TITLE}
            phase="Activación"
            minutes={15}
            isFirst={false}
            isLast={false}
            expanded={expanded}
            onToggle={() => setExpanded((open) => !open)}
            onMinutes={() => {}}
            onMove={() => {}}
            onRemove={() => {}}
          >
            <p>Editor de la fila</p>
          </PracticeItem>
        );
      }
      render(<Harness />);

      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Editor de la fila")).not.toBeInTheDocument();

      fireEvent.click(toggle());
      expect(toggle()).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Editor de la fila")).toBeInTheDocument();

      fireEvent.click(toggle());
      expect(toggle()).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText("Editor de la fila")).not.toBeInTheDocument();
    });

    it("cerrado no pinta lo de dentro ni «Subir», «Bajar» y «Quitar»", () => {
      renderItem({ children: <p>Editor de la fila</p> });

      expect(screen.queryByText("Editor de la fila")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Subir/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Bajar/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Quitar/ })).not.toBeInTheDocument();
    });

    it("abierto pinta lo de dentro y «Subir», «Bajar» y «Quitar» con el título", () => {
      renderItem({ expanded: true, children: <p>Editor de la fila</p> });

      expect(screen.getByText("Editor de la fila")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Subir ${TITLE}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Bajar ${TITLE}` })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: `Quitar ${TITLE}` })).toBeInTheDocument();
    });

    it("abierto, sigue habiendo un solo juego de minutos", () => {
      renderItem({ expanded: true });

      expect(screen.getAllByRole("button", { name: /^Más minutos/ })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: /^Menos minutos/ })).toHaveLength(1);
    });
  });

  describe("mover y quitar", () => {
    it("«Subir» llama a onMove('up'), «Bajar» a onMove('down') y «Quitar» a onRemove", () => {
      const { onMove, onRemove } = renderItem({ expanded: true });

      fireEvent.click(screen.getByRole("button", { name: `Subir ${TITLE}` }));
      expect(onMove).toHaveBeenLastCalledWith("up");
      fireEvent.click(screen.getByRole("button", { name: `Bajar ${TITLE}` }));
      expect(onMove).toHaveBeenLastCalledWith("down");
      expect(onMove).toHaveBeenCalledTimes(2);

      expect(onRemove).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: `Quitar ${TITLE}` }));
      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it("«Subir» está desactivado en la primera fila y «Bajar» sigue activo", () => {
      const { onMove } = renderItem({ expanded: true, isFirst: true });

      const up = screen.getByRole("button", { name: `Subir ${TITLE}` });
      expect(up).toBeDisabled();
      expect(screen.getByRole("button", { name: `Bajar ${TITLE}` })).toBeEnabled();

      fireEvent.click(up);
      expect(onMove).not.toHaveBeenCalled();
    });

    it("«Bajar» está desactivado en la última fila y «Subir» sigue activo", () => {
      const { onMove } = renderItem({ expanded: true, isLast: true });

      const down = screen.getByRole("button", { name: `Bajar ${TITLE}` });
      expect(down).toBeDisabled();
      expect(screen.getByRole("button", { name: `Subir ${TITLE}` })).toBeEnabled();

      fireEvent.click(down);
      expect(onMove).not.toHaveBeenCalled();
    });

    it("con una sola fila, no se puede subir ni bajar, pero sí quitar", () => {
      renderItem({ expanded: true, isFirst: true, isLast: true });

      expect(screen.getByRole("button", { name: `Subir ${TITLE}` })).toBeDisabled();
      expect(screen.getByRole("button", { name: `Bajar ${TITLE}` })).toBeDisabled();
      expect(screen.getByRole("button", { name: `Quitar ${TITLE}` })).toBeEnabled();
    });

    it("los tres botones son normales y miden 44 px como mínimo; «Quitar» es danger y dice su palabra", () => {
      renderItem({ expanded: true });

      const remove = screen.getByRole("button", { name: `Quitar ${TITLE}` });
      for (const name of [`Subir ${TITLE}`, `Bajar ${TITLE}`, `Quitar ${TITLE}`]) {
        const button = screen.getByRole("button", { name });
        expect(button, name).toHaveAttribute("type", "button");
        expect(button, name).toHaveClass("min-h-(--target-min)");
      }
      expect(remove).toHaveClass("border-danger", "text-danger");
      // Con la palabra a la vista, no solo con el icono.
      expect(remove).toHaveTextContent("Quitar");
    });
  });

  describe("asa", () => {
    it("pinta lo que el constructor le pasa en `handle`", () => {
      renderItem({ handle: <button type="button">Arrastrar</button> });

      expect(screen.getByRole("button", { name: "Arrastrar" })).toBeInTheDocument();
    });

    it("sin asa no pinta nada en su lugar, pero la fila conserva su sitio", () => {
      renderItem();

      const slot = screen.getByText("01").previousElementSibling;
      expect(slot).toBeEmptyDOMElement();
      expect(slot).toHaveClass("w-8", "shrink-0");
    });

    it("el hueco del asa mide 44 px de alto y 32 de ancho, en ink-3", () => {
      renderItem({ handle: <span>asa</span> });

      const slot = screen.getByText("asa").parentElement;
      expect(slot).toHaveClass("w-8", "h-(--target-min)", "text-ink-3");
    });
  });

  describe("arrastrando", () => {
    it("con `dragging` pasa a surface-3 con shadow-sheet", () => {
      const { container } = renderItem({ dragging: true });

      expect(container.firstElementChild).toHaveClass("bg-surface-3", "shadow-sheet");
      expect(container.firstElementChild).not.toHaveClass("bg-surface-1");
    });

    it("sin arrastrar es surface-1 y sin sombra", () => {
      const { container } = renderItem();

      expect(container.firstElementChild).toHaveClass("bg-surface-1");
      expect(container.firstElementChild).not.toHaveClass("shadow-sheet", "bg-surface-3");
    });

    it("arrastrando, el asa sube a ink-2: ink-3 no va sobre surface-3", () => {
      renderItem({ dragging: true, handle: <span>asa</span> });

      const slot = screen.getByText("asa").parentElement;
      expect(slot).toHaveClass("text-ink-2");
      expect(slot).not.toHaveClass("text-ink-3");
    });
  });

  it("la fila mide 72 px como mínimo", () => {
    const { container } = renderItem();

    expect(container.querySelector(".min-h-18")).not.toBeNull();
  });

  it("lleva su separador arriba, y no lo lleva la fila del primer <li> de la lista", () => {
    const { container } = renderItem();

    expect(container.firstElementChild).toHaveClass(
      "border-t",
      "border-line",
      "[li:first-child>&]:border-t-0",
    );
  });

  it("no es un <li>: quien la monta en una lista pone el suyo", () => {
    const { container } = renderItem();

    expect(container.querySelector("li")).toBeNull();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("marca sus controles, para que quien la monta pueda devolverles el foco", () => {
    renderItem({ expanded: true });

    expect(toggle()).toHaveAttribute("data-control", "toggle");
    expect(screen.getByRole("button", { name: `Subir ${TITLE}` })).toHaveAttribute("data-control", "up");
    expect(screen.getByRole("button", { name: `Bajar ${TITLE}` })).toHaveAttribute("data-control", "down");
    expect(screen.getByRole("button", { name: `Quitar ${TITLE}` })).toHaveAttribute("data-control", "remove");
  });
});

describe("practiceItemName", () => {
  it("es el título, sin espacios alrededor", () => {
    expect(practiceItemName("  3 calles ")).toBe("3 calles");
  });

  it("sin título, o en blanco, es «Sin título»: el mismo nombre que usan los botones de la fila", () => {
    expect(practiceItemName("")).toBe("Sin título");
    expect(practiceItemName("   ")).toBe("Sin título");
  });
});

describe("PracticeItemView", () => {
  function renderView(props: Partial<Parameters<typeof PracticeItemView>[0]> = {}) {
    return render(
      <ul>
        <PracticeItemView index={2} title={TITLE} phase="Técnica" minutes={20} {...props} />
      </ul>,
    );
  }

  it("es un elemento de lista con su número, la fase, el título y los minutos", () => {
    renderView();

    const item = screen.getByRole("listitem");
    expect(within(item).getByText("03")).toBeInTheDocument();
    expect(within(item).getByText("Técnica")).toBeInTheDocument();
    expect(within(item).getByText(TITLE)).toBeInTheDocument();
    expect(within(item).getByText("20'")).toBeInTheDocument();
    expect(within(item).getByText("20 minutos")).toBeInTheDocument();
  });

  it("con href, su contenido es un enlace dentro del elemento de lista", () => {
    renderView({ href: "/c/club-a/drills/d1" });

    const item = screen.getByRole("listitem");
    const link = within(item).getByRole("link", { name: /Movilidad \+ rueda de pases/ });
    expect(link).toHaveAttribute("href", "/c/club-a/drills/d1");
    expect(link).toHaveTextContent("Técnica");
    expect(link).toHaveTextContent("20'");
  });

  it("sin href es texto: no hay ningún enlace", () => {
    renderView();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent(TITLE);
  });

  it("sin fase no pinta etiqueta", () => {
    renderView({ phase: null });

    expect(screen.queryByText("Técnica")).not.toBeInTheDocument();
    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it("el enlace cubre toda la fila y mide 72 px como mínimo", () => {
    renderView({ href: "/c/club-a/drills/d1" });

    expect(screen.getByRole("link")).toHaveClass("min-h-18");
  });

  describe("la miniatura (`thumb`)", () => {
    // Un nodo cualquiera en el sitio de la miniatura: qué se pinta dentro es cosa de quien la pasa.
    const THUMB = <svg aria-hidden="true" data-testid="thumb" />;

    /** Lo que hay en la fila, en orden: la etiqueta o, si lo tiene, el `data-testid` de cada hijo. */
    function parts(row: Element): string[] {
      return Array.from(row.children).map((child) => child.getAttribute("data-testid") ?? child.tagName.toLowerCase());
    }

    it("sin href, va en la fila entre el número y el título", () => {
      renderView({ thumb: THUMB });

      const thumb = screen.getByTestId("thumb");
      const row = thumb.parentElement as HTMLElement;
      expect(screen.getByRole("listitem")).toContainElement(thumb);
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
      // Número, miniatura, fase y título, minutos.
      expect(parts(row)).toEqual(["span", "thumb", "span", "span"]);
      expect(thumb.previousElementSibling).toBe(screen.getByText("03"));
      expect(thumb.nextElementSibling).toContainElement(screen.getByText(TITLE));
    });

    it("con href, va dentro del enlace, entre el número y el título", () => {
      renderView({ href: "/c/club-a/drills/d1", thumb: THUMB });

      const link = screen.getByRole("link");
      const thumb = screen.getByTestId("thumb");
      // Hija directa del enlace: tocarla abre la ficha, como el resto de la fila.
      expect(thumb.parentElement).toBe(link);
      expect(thumb.previousElementSibling).toBe(within(link).getByText("03"));
      expect(thumb.nextElementSibling).toContainElement(within(link).getByText(TITLE));
      // Número, miniatura, fase y título, minutos y el chevron.
      expect(parts(link)).toEqual(["span", "thumb", "span", "span", "svg"]);
    });

    it("se pinta una sola vez", () => {
      renderView({ href: "/c/club-a/drills/d1", thumb: THUMB });

      expect(screen.getAllByTestId("thumb")).toHaveLength(1);
    });

    it("una miniatura decorativa no cambia el nombre del enlace", () => {
      const { unmount } = renderView({ href: "/c/club-a/drills/d1" });
      const name = screen.getByRole("link").textContent;
      unmount();

      renderView({ href: "/c/club-a/drills/d1", thumb: THUMB });

      expect(screen.getByRole("link").textContent).toBe(name);
      expect(screen.getByRole("link", { name: /Técnica Movilidad \+ rueda de pases/ })).toBeInTheDocument();
    });

    it("convive con el resultado de una sesión hecha: la miniatura, y bajo el título cómo acabó", () => {
      renderView({ thumb: THUMB, result: { completed: true, actualMinutes: 9 } });

      const thumb = screen.getByTestId("thumb");
      expect(thumb.nextElementSibling).toHaveTextContent("Hecho · 9 min");
      expect(thumb.nextElementSibling).toHaveTextContent(TITLE);
    });

    it("sin `thumb` la fila no cambia: número, fase y título, y minutos; con href, además el chevron", () => {
      const { unmount } = renderView();
      const row = screen.getByText("03").parentElement as HTMLElement;
      expect(parts(row)).toEqual(["span", "span", "span"]);
      expect(row.querySelector("svg")).toBeNull();
      unmount();

      renderView({ href: "/c/club-a/drills/d1" });
      expect(parts(screen.getByRole("link"))).toEqual(["span", "span", "span", "svg"]);
    });

    it("un `thumb` sin nada que pintar (undefined o null) es como no pasarlo", () => {
      const { unmount } = renderView({ thumb: undefined });
      expect(parts(screen.getByText("03").parentElement as HTMLElement)).toEqual(["span", "span", "span"]);
      unmount();

      renderView({ thumb: null });
      expect(parts(screen.getByText("03").parentElement as HTMLElement)).toEqual(["span", "span", "span"]);
    });
  });
});

describe("PracticeTotal", () => {
  it("dice «Total» y la suma en minutos", () => {
    render(<PracticeTotal minutes={75} />);

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("75'")).toBeInTheDocument();
    expect(screen.getByText("75 minutos")).toBeInTheDocument();
  });

  it("separa la fila de total con un borde line-strong", () => {
    const { container } = render(<PracticeTotal minutes={75} />);

    expect(container.firstElementChild).toHaveClass("border-t", "border-line-strong");
  });

  it("con `inline` es solo «Total» y la suma, sin borde ni relleno: para la barra de guardado", () => {
    const { container } = render(<PracticeTotal minutes={75} inline />);

    expect(screen.getByText("Total")).toHaveClass("font-display", "text-title");
    expect(screen.getByText("75'")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("75 minutos")).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass("border-t");
    expect(container.firstElementChild?.className).not.toMatch(/p[xy]-/);
  });
});
