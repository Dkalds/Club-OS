import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgendaList } from "./agenda-list";
import { agendaHref } from "./href";
import type { Agenda, AgendaFilters, AgendaItem } from "./types";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const PRACTICE: AgendaItem = {
  eventId: "e-1",
  kind: "practice",
  href: "/c/club-a/train/e-1",
  chip: { label: "Jue", day: "8" },
  title: "Salida de presión",
  subtitle: "Entrenamiento · 45 min · Pabellón 2",
  trail: { text: "18:00", tone: "plain" },
};
const GAME: AgendaItem = {
  eventId: "g-1",
  kind: "game",
  href: "/c/club-a/games/g-1",
  chip: { label: "Sáb", day: "10" },
  title: "vs Rival C",
  subtitle: "Partido · Local · Liga",
  trail: { text: "10:30", tone: "plain" },
};

const ADD = [
  { label: "Sesión de entrenamiento", href: "/c/club-a/train/new" },
  { label: "Partido", href: "/c/club-a/games/new" },
];

function agenda(overrides: Partial<Agenda> = {}): Agenda {
  return {
    weeks: [
      { key: "2026-10-04T22:00:00.000Z", label: "Esta semana", items: [PRACTICE, GAME] },
      { key: "2026-10-11T22:00:00.000Z", label: "Semana que viene", items: [{ ...PRACTICE, eventId: "e-2", href: "/c/club-a/train/e-2" }] },
    ],
    teamCount: 1,
    truncated: false,
    ...overrides,
  };
}

function renderList(
  data: Agenda = agenda(),
  filters: AgendaFilters = { scope: "upcoming", kind: "all" },
  options: { addOptions?: typeof ADD; role?: "coach" | "admin" | "player" } = {},
) {
  return render(
    // El contenedor del club: la hoja de «Añadir» se pinta dentro de él.
    <div data-club="club-a">
      <AgendaList
        clubSlug="club-a"
        filters={filters}
        agenda={data}
        addOptions={options.addOptions ?? ADD}
        role={options.role ?? "coach"}
      />
    </div>,
  );
}

const nav = (name: string) => screen.getByRole("navigation", { name });
const hrefs = (name: string) =>
  within(nav(name))
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")]);

describe("agendaHref", () => {
  it("los valores por defecto no van en la URL", () => {
    expect(agendaHref("club-a", { scope: "upcoming", kind: "all" })).toBe("/c/club-a/agenda");
  });

  it("lo que no es por defecto, sí", () => {
    expect(agendaHref("club-a", { scope: "past", kind: "all" })).toBe("/c/club-a/agenda?scope=past");
    expect(agendaHref("club-a", { scope: "upcoming", kind: "game" })).toBe("/c/club-a/agenda?kind=game");
    expect(agendaHref("club-a", { scope: "past", kind: "practice" })).toBe("/c/club-a/agenda?scope=past&kind=practice");
  });
});

describe("AgendaList · semanas y filas", () => {
  it("cada semana es una sección con su título y su lista", () => {
    renderList();

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Esta semana", "Semana que viene"]);
    expect(screen.getAllByRole("list")).toHaveLength(2);
  });

  it("cada fila lleva a la pantalla de su evento y dice su título, su subtítulo y su hora", () => {
    renderList();

    const [practice, game] = within(screen.getAllByRole("list")[0] as HTMLElement).getAllByRole("link");
    expect(practice).toHaveAttribute("href", "/c/club-a/train/e-1");
    expect(practice).toHaveTextContent("Salida de presión");
    expect(practice).toHaveTextContent("Entrenamiento · 45 min · Pabellón 2");
    expect(practice).toHaveTextContent("18:00");
    expect(practice).toHaveTextContent("Jue");
    expect(game).toHaveAttribute("href", "/c/club-a/games/g-1");
    expect(game).toHaveTextContent("vs Rival C");
  });

  it("«Hecho» lleva su palabra, no solo el color", () => {
    const done: AgendaItem = { ...PRACTICE, chip: { label: "oct", day: "5" }, trail: { text: "Hecho", tone: "done" } };
    renderList(agenda({ weeks: [{ key: "w", label: "Esta semana", items: [done] }] }), { scope: "past", kind: "all" });

    const row = screen.getByRole("link", { name: /Salida de presión/ });
    expect(within(row).getByText("Hecho").closest(".text-success")).not.toBeNull();
    expect(row).toHaveTextContent("oct");
  });

  it("un marcador se ve con raya y se lee con «a»", () => {
    const played: AgendaItem = { ...GAME, trail: { text: "61–58", spoken: "61 a 58", tone: "plain" } };
    renderList(agenda({ weeks: [{ key: "w", label: "Semana pasada", items: [played] }] }), { scope: "past", kind: "game" });

    const row = screen.getByRole("link", { name: /vs Rival C/ });
    expect(within(row).getByText("61–58")).toHaveAttribute("aria-hidden", "true");
    expect(within(row).getByText("61 a 58")).toHaveClass("sr-only");
  });

  it("si hay más de los que se enseñan, lo dice", () => {
    renderList(agenda({ truncated: true }));
    expect(screen.getByText("Mostrando los 50 más próximos")).toBeInTheDocument();
  });

  it("en lo anterior, lo dice de los más recientes", () => {
    renderList(agenda({ truncated: true }), { scope: "past", kind: "all" });
    expect(screen.getByText("Mostrando los 50 más recientes")).toBeInTheDocument();
  });
});

describe("AgendaList · pestañas y filtros", () => {
  it("«Próximos» y «Anteriores», con la abierta marcada", () => {
    renderList();

    expect(hrefs("Agenda")).toEqual([
      ["Próximos", "/c/club-a/agenda"],
      ["Anteriores", "/c/club-a/agenda?scope=past"],
    ]);
    expect(within(nav("Agenda")).getByRole("link", { name: "Próximos" })).toHaveAttribute("aria-current", "page");
    expect(within(nav("Agenda")).getByRole("link", { name: "Anteriores" })).not.toHaveAttribute("aria-current");
  });

  it("los filtros de tipo, con el puesto marcado", () => {
    renderList(agenda(), { scope: "upcoming", kind: "game" });

    expect(hrefs("Tipo")).toEqual([
      ["Todo", "/c/club-a/agenda"],
      ["Entrenos", "/c/club-a/agenda?kind=practice"],
      ["Partidos", "/c/club-a/agenda?kind=game"],
    ]);
    expect(within(nav("Tipo")).getByRole("link", { name: "Partidos" })).toHaveAttribute("aria-current", "true");
    expect(within(nav("Tipo")).getByRole("link", { name: "Todo" })).not.toHaveAttribute("aria-current");
  });

  it("las pestañas conservan el filtro de tipo y los filtros conservan la pestaña", () => {
    renderList(agenda(), { scope: "past", kind: "practice" });

    expect(hrefs("Agenda")).toEqual([
      ["Próximos", "/c/club-a/agenda?kind=practice"],
      ["Anteriores", "/c/club-a/agenda?scope=past&kind=practice"],
    ]);
    expect(hrefs("Tipo")).toEqual([
      ["Todo", "/c/club-a/agenda?scope=past"],
      ["Entrenos", "/c/club-a/agenda?scope=past&kind=practice"],
      ["Partidos", "/c/club-a/agenda?scope=past&kind=game"],
    ]);
  });
});

describe("AgendaList · añadir", () => {
  it("«Añadir» abre una hoja con lo que se puede añadir", async () => {
    renderList();

    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));
    const sheet = await screen.findByRole("dialog", { name: "Añadir" });

    const links = within(sheet).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Sesión de entrenamiento", "/c/club-a/train/new"],
      ["Partido", "/c/club-a/games/new"],
    ]);
  });

  it("es el único botón principal de la pantalla", () => {
    renderList();

    const primary = [...document.querySelectorAll("a, button")].filter((element) =>
      element.className.includes("bg-brand-accent "),
    );
    expect(primary.map((element) => element.textContent)).toEqual(["Añadir"]);
  });

  it("con una sola cosa que añadir, el botón lleva directamente a ella", () => {
    renderList(agenda(), undefined, { addOptions: [ADD[1] as (typeof ADD)[number]] });

    expect(screen.getByRole("link", { name: "Partido" })).toHaveAttribute("href", "/c/club-a/games/new");
    expect(screen.queryByRole("button", { name: "Añadir" })).not.toBeInTheDocument();
  });

  it("quien no puede añadir nada no ve el botón", () => {
    renderList(agenda(), undefined, { addOptions: [], role: "player" });

    expect(screen.queryByRole("button", { name: "Añadir" })).not.toBeInTheDocument();
  });
});

describe("AgendaList · vacíos", () => {
  const EMPTY = agenda({ weeks: [] });

  it("sin nada próximo lo dice y ofrece ver lo anterior", () => {
    renderList(EMPTY);

    expect(screen.getByRole("heading", { level: 2, name: "No hay nada programado" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver anteriores" })).toHaveAttribute("href", "/c/club-a/agenda?scope=past");
  });

  it("sin nada anterior lo dice y ofrece ver lo próximo", () => {
    renderList(EMPTY, { scope: "past", kind: "all" });

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay nada anterior" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver próximos" })).toHaveAttribute("href", "/c/club-a/agenda");
  });

  it("con un filtro de tipo puesto, lo nombra y ofrece quitarlo", () => {
    renderList(EMPTY, { scope: "upcoming", kind: "game" });

    expect(screen.getByRole("heading", { level: 2, name: "No hay partidos programados" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver todo" })).toHaveAttribute("href", "/c/club-a/agenda");
  });

  it("vacía sigue teniendo pestañas y filtros", () => {
    renderList(EMPTY);

    expect(nav("Agenda")).toBeInTheDocument();
    expect(nav("Tipo")).toBeInTheDocument();
  });

  it("sin equipos, quien entrena lee que aún no está en ninguno, sin pestañas ni botón", () => {
    renderList(agenda({ weeks: [], teamCount: 0 }));

    expect(screen.getByRole("heading", { level: 2, name: "Aún no estás en ningún equipo" })).toBeInTheDocument();
    expect(screen.getByText("Cuando dirección te asigne un equipo, aquí verás su agenda.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir" })).not.toBeInTheDocument();
  });

  it("sin equipos, dirección lee que faltan por dar de alta", () => {
    renderList(agenda({ weeks: [], teamCount: 0 }), undefined, { role: "admin" });

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay equipos esta temporada" })).toBeInTheDocument();
  });
});
