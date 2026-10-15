import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChangeLine, RecentChange } from "@/modules/schedule/changes";
import { ChangeLog, editorsLine, RecentChanges } from "./event-changes";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function recent(n: number, overrides: Partial<RecentChange> = {}): RecentChange {
  return {
    eventId: uuid(n),
    href: `/c/club-a/train/${uuid(n)}`,
    label: "Cambio de hora",
    title: `Sesión ${n}`,
    subtitle: `Martes 13 oct · 19:00–20:15 · Sesión ${n}`,
    cancelled: false,
    ...overrides,
  };
}

const MOVED = recent(1);
const CANCELLED = recent(2, {
  href: `/c/club-a/games/${uuid(2)}`,
  label: "Cancelado",
  title: "vs CB Rival",
  subtitle: "Sábado 17 oct · 10:30–12:00 · Equipo A · vs CB Rival",
  cancelled: true,
});

/** El dibujo del icono de una fila: lo que distingue un icono de otro sin mirar el color. */
const iconOf = (row: HTMLElement) => row.querySelector("svg path")?.getAttribute("d");

describe("RecentChanges", () => {
  it("sin elementos no pinta nada: ni el título", () => {
    const { container } = render(<RecentChanges items={[]} more={0} moreHref="/c/club-a/agenda" />);

    expect(container).toBeEmptyDOMElement();
  });

  it("sin elementos no pinta nada aunque diga que quedan más fuera", () => {
    const { container } = render(<RecentChanges items={[]} more={4} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("es un apartado «Cambios recientes» con una lista, una fila por evento y en su orden", () => {
    render(<RecentChanges items={[MOVED, CANCELLED]} more={0} />);

    expect(screen.getByRole("heading", { level: 2, name: "Cambios recientes" })).toBeInTheDocument();
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByRole("link").getAttribute("href"))).toEqual([
      `/c/club-a/train/${uuid(1)}`,
      `/c/club-a/games/${uuid(2)}`,
    ]);
  });

  it("cada fila es un enlace a su evento que dice qué le ha pasado y, debajo, cuándo es ahora y qué es", () => {
    render(<RecentChanges items={[MOVED, CANCELLED]} more={0} />);

    const [moved, cancelled] = screen.getAllByRole("link");
    expect(moved).toHaveAttribute("href", `/c/club-a/train/${uuid(1)}`);
    expect(within(moved as HTMLElement).getByText("Cambio de hora")).toBeInTheDocument();
    expect(within(moved as HTMLElement).getByText("Martes 13 oct · 19:00–20:15 · Sesión 1")).toBeInTheDocument();
    expect(within(cancelled as HTMLElement).getByText("Cancelado")).toBeInTheDocument();
    expect(
      within(cancelled as HTMLElement).getByText("Sábado 17 oct · 10:30–12:00 · Equipo A · vs CB Rival"),
    ).toBeInTheDocument();
  });

  // El subtítulo ya trae el día y la hora delante (la fila trunca el final) y el título detrás.
  it("el subtítulo se pinta tal cual llega: no se le antepone el título", () => {
    render(<RecentChanges items={[recent(1, { title: "Otro título", subtitle: "Martes 13 oct · 19:00–20:15" })]} more={0} />);

    const row = screen.getByRole("link");
    expect(within(row).getByText("Martes 13 oct · 19:00–20:15")).toBeInTheDocument();
    expect(row).not.toHaveTextContent("Otro título");
    expect(within(row).getByText("Martes 13 oct · 19:00–20:15")).toHaveClass("truncate");
  });

  it("el cancelado lleva un icono distinto del de un cambio: no se distingue solo por el color", () => {
    render(<RecentChanges items={[MOVED, CANCELLED, recent(3, { label: "Cambio de lugar" })]} more={0} />);

    const [moved, cancelled, relocated] = screen.getAllByRole("listitem");
    expect(iconOf(moved as HTMLElement)).toBeTruthy();
    expect(iconOf(cancelled as HTMLElement)).toBeTruthy();
    expect(iconOf(cancelled as HTMLElement)).not.toBe(iconOf(moved as HTMLElement));
    expect(iconOf(relocated as HTMLElement)).toBe(iconOf(moved as HTMLElement));
  });

  it("los iconos son decorativos: lo que ha pasado lo dice el texto", () => {
    render(<RecentChanges items={[MOVED, CANCELLED]} more={0} />);

    for (const row of screen.getAllByRole("listitem")) {
      for (const icon of row.querySelectorAll("svg")) expect(icon).toHaveAttribute("aria-hidden", "true");
    }
    expect(screen.getByRole("link", { name: /^Cancelado/ })).toBeInTheDocument();
  });

  describe("cuando no caben todos", () => {
    it("con `moreHref`, «Ver N más» lleva a donde están todos", () => {
      render(<RecentChanges items={[MOVED]} more={4} moreHref="/c/club-a/agenda" />);

      expect(screen.getByRole("link", { name: "Ver 4 más" })).toHaveAttribute("href", "/c/club-a/agenda");
      expect(screen.queryByText(/más adelante en el calendario/)).not.toBeInTheDocument();
    });

    it("sin `moreHref`, lo dice en texto y sin enlace", () => {
      render(<RecentChanges items={[MOVED]} more={4} />);

      expect(screen.getByText("Y 4 más, más adelante en el calendario.")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Ver 4 más/ })).not.toBeInTheDocument();
      // El único enlace es el de la fila.
      expect(screen.getAllByRole("link")).toHaveLength(1);
    });

    it("si caben todos, ni enlace ni texto, con o sin `moreHref`", () => {
      const { rerender } = render(<RecentChanges items={[MOVED]} more={0} moreHref="/c/club-a/agenda" />);
      expect(screen.queryByRole("link", { name: /^Ver/ })).not.toBeInTheDocument();

      rerender(<RecentChanges items={[MOVED]} more={0} />);
      expect(screen.queryByText(/más adelante en el calendario/)).not.toBeInTheDocument();
      expect(screen.getAllByRole("link")).toHaveLength(1);
    });

    // Fijado tal como está: el texto no distingue el singular («Y 1 más»).
    it("con uno solo fuera dice «1 más»", () => {
      const { rerender } = render(<RecentChanges items={[MOVED]} more={1} moreHref="/c/club-a/agenda" />);
      expect(screen.getByRole("link", { name: "Ver 1 más" })).toBeInTheDocument();

      rerender(<RecentChanges items={[MOVED]} more={1} />);
      expect(screen.getByText("Y 1 más, más adelante en el calendario.")).toBeInTheDocument();
    });
  });
});

describe("ChangeLog", () => {
  const EDITORS = "Lo pueden cambiar o cancelar el cuerpo técnico de Equipo A y la dirección.";
  const LINES: ChangeLine[] = [
    { id: "c-2", title: "Sesión cancelada", detail: "Era: Martes 6 oct · 18:00–19:15", when: "Lunes 5 oct" },
    { id: "c-1", title: "Cambio de lugar", detail: "Antes no tenía lugar", when: "Sábado 3 oct" },
  ];

  it("con cambios: el apartado «Cambios» y una línea por cambio, en el orden en que llegan", () => {
    render(<ChangeLog lines={LINES} editors={EDITORS} />);

    expect(screen.getByRole("heading", { level: 2, name: "Cambios" })).toBeInTheDocument();
    const lines = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(lines.map((line) => [...line.children].map((child) => child.textContent))).toEqual([
      ["Sesión cancelada", "Era: Martes 6 oct · 18:00–19:15", "Cambiado el lunes 5 oct"],
      ["Cambio de lugar", "Antes no tenía lugar", "Cambiado el sábado 3 oct"],
    ]);
  });

  it("el día del cambio va en mitad de la frase: sin la mayúscula con la que llega, y solo él", () => {
    render(
      <ChangeLog
        lines={[{ id: "c-1", title: "Cambio de hora", detail: "Antes: Miércoles 7 oct · 18:00–19:15", when: "Miércoles 7 Oct" }]}
        editors={EDITORS}
      />,
    );

    expect(screen.getByText("Cambiado el miércoles 7 Oct")).toBeInTheDocument();
    // Lo que había antes empieza su propia frase tras los dos puntos: se queda como llega.
    expect(screen.getByText("Antes: Miércoles 7 oct · 18:00–19:15")).toBeInTheDocument();
  });

  it("los cambios se leen, no se pulsan: ni enlaces ni botones", () => {
    render(<ChangeLog lines={LINES} editors={EDITORS} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("dice quién lo puede cambiar, después de los cambios", () => {
    render(<ChangeLog lines={LINES} editors={EDITORS} />);

    const editors = screen.getByText(EDITORS);
    expect(screen.getByRole("list").compareDocumentPosition(editors) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sin cambios no hay título ni lista, pero quién lo puede cambiar sigue ahí", () => {
    render(<ChangeLog lines={[]} editors={EDITORS} />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText(EDITORS)).toBeInTheDocument();
  });

  it("sin `editors` (el evento ya no se puede cambiar) enseña los cambios y no esa línea", () => {
    render(<ChangeLog lines={[LINES[0]]} />);

    expect(screen.getByRole("heading", { name: "Cambios" })).toBeInTheDocument();
    expect(screen.queryByText(EDITORS)).not.toBeInTheDocument();
  });

  it("sin cambios ni `editors` no pinta nada", () => {
    const { container } = render(<ChangeLog lines={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("editorsLine", () => {
  it("nombra al cuerpo técnico del equipo y a la dirección", () => {
    expect(editorsLine("Equipo A")).toBe("Lo pueden cambiar o cancelar el cuerpo técnico de Equipo A y la dirección.");
  });

  it("usa el nombre del equipo tal cual, sea el que sea", () => {
    expect(editorsLine("Equipo B")).toContain("el cuerpo técnico de Equipo B y");
  });
});
