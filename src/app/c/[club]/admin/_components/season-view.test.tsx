import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, SeasonDetail, SeasonSummary, SeasonTeam } from "@/modules/structure/types";

// Los formularios de la vista llaman a estas acciones; aquí solo se pintan (cada uno tiene su test).
vi.mock("@/modules/structure/actions", () => ({
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
  setCurrentSeason: vi.fn(),
  deleteSeason: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  deleteTeam: vi.fn(),
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
}));

import { SeasonView } from "./season-view";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const S_CURRENT = uuid(1);
const S_LAST = uuid(2);
const S_NEXT = uuid(3);
const C_SMALL = uuid(10);
const C_BIG = uuid(20);

const CURRENT: SeasonSummary = {
  id: S_CURRENT,
  name: "2026/27",
  startsOn: "2026-09-01",
  endsOn: "2027-06-30",
  isCurrent: true,
};
const LAST: SeasonSummary = {
  id: S_LAST,
  name: "2025/26",
  startsOn: "2025-09-01",
  endsOn: "2026-06-30",
  isCurrent: false,
};
const NEXT: SeasonSummary = {
  id: S_NEXT,
  name: "2027/28",
  startsOn: "2027-09-01",
  endsOn: "2028-06-30",
  isCurrent: false,
};
/** Como las da `listSeasons`: de la más reciente a la más antigua. */
const SEASONS = [NEXT, CURRENT, LAST];

const CATEGORIES: Category[] = [
  { id: C_SMALL, name: "Pequeños", ageBand: "U12", sort: 10, inUse: true },
  { id: C_BIG, name: "Mayores", ageBand: "U16", sort: 20, inUse: true },
];

function team(n: number, name: string, category: Category, players = 0, staff = 0): SeasonTeam {
  return {
    id: uuid(100 + n),
    name,
    categoryId: category.id,
    categoryName: category.name,
    categorySort: category.sort,
    players,
    staff,
  };
}

/** Como los da `toSeasonTeams`: por categoría y, dentro, por nombre. */
const TEAMS = [
  team(1, "Pequeños A", CATEGORIES[0], 12, 2),
  team(2, "Pequeños B", CATEGORIES[0], 1, 1),
  team(3, "Mayores A", CATEGORIES[1], 0, 0),
];

function detail(season: SeasonSummary, teams: SeasonTeam[] = TEAMS): SeasonDetail {
  return { ...season, teams };
}

function renderView(props: Partial<Parameters<typeof SeasonView>[0]> = {}) {
  return render(
    <SeasonView clubSlug="club-a" season={detail(CURRENT)} seasons={SEASONS} categories={CATEGORIES} {...props} />,
  );
}

/** El bloque de una categoría: su encabezado y la lista de sus equipos. */
const group = (name: string) => screen.getByRole("heading", { level: 3, name }).parentElement as HTMLElement;
const teamLinks = (scope: HTMLElement) => within(scope).getAllByRole("link");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeasonView · la cabecera", () => {
  it("«Temporada» es el único <h1>, y recuerda qué ve el club", () => {
    renderView();

    expect(screen.getByRole("heading", { level: 1, name: "Temporada" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Lo que ve el club en la app es siempre la temporada actual.")).toBeInTheDocument();
  });
});

describe("SeasonView · las temporadas del club", () => {
  it("con una sola temporada no hay pestañas", () => {
    renderView({ seasons: [CURRENT] });

    expect(screen.queryByRole("navigation", { name: "Temporadas" })).not.toBeInTheDocument();
  });

  it("con más de una, una navegación «Temporadas» con un enlace por temporada, en su orden", () => {
    renderView();

    const nav = screen.getByRole("navigation", { name: "Temporadas" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      `/c/club-a/admin/season/${S_NEXT}`,
      `/c/club-a/admin/season/${S_CURRENT}`,
      `/c/club-a/admin/season/${S_LAST}`,
    ]);
    expect(links.map((link) => link.textContent)).toEqual(["2027/28", "2026/27Actual", "2025/26"]);
  });

  it("solo la temporada que se está viendo lleva aria-current", () => {
    renderView();

    const links = within(screen.getByRole("navigation", { name: "Temporadas" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, "page", null]);
  });

  it("viendo otra temporada, aria-current va con ella y «Actual» sigue en la actual: son dos cosas", () => {
    renderView({ season: detail(LAST) });

    const nav = screen.getByRole("navigation", { name: "Temporadas" });
    expect(within(nav).getByRole("link", { name: "2025/26" })).toHaveAttribute("aria-current", "page");
    const current = within(nav).getByRole("link", { name: /2026\/27/ });
    expect(current).not.toHaveAttribute("aria-current");
    expect(within(current).getByText("Actual")).toBeInTheDocument();
  });

  it("los enlaces llegan al área táctil mínima y llevan el id, no el nombre, en la URL", () => {
    renderView();

    for (const link of within(screen.getByRole("navigation", { name: "Temporadas" })).getAllByRole("link")) {
      expect(link.className).toContain("min-h-(--target-min)");
      expect(link.getAttribute("href")).toMatch(/\/season\/[0-9a-f-]{36}$/);
    }
  });
});

describe("SeasonView · la temporada", () => {
  it("dice su nombre, sus fechas y que es la actual", () => {
    renderView();

    const section = screen.getByRole("region", { name: "Temporada 2026/27" });
    expect(within(section).getByRole("heading", { level: 2, name: "2026/27" })).toBeInTheDocument();
    expect(within(section).getByText("1 sep 2026 – 30 jun 2027")).toBeInTheDocument();
    expect(within(section).getByText("Actual")).toBeInTheDocument();
  });

  it("la actual no ofrece ni marcarla ni borrarla", () => {
    renderView({ season: detail(CURRENT, []) });

    expect(screen.queryByRole("button", { name: "Marcar como actual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Borrar temporada" })).not.toBeInTheDocument();
  });

  it("otra temporada no lleva «Actual», y se puede marcar como actual", () => {
    renderView({ season: detail(LAST) });

    const section = screen.getByRole("region", { name: "Temporada 2025/26" });
    expect(within(section).queryByText("Actual")).not.toBeInTheDocument();
    expect(within(section).getByText("1 sep 2025 – 30 jun 2026")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Marcar como actual" })).toBeInTheDocument();
  });

  it("otra temporada con equipos no se puede borrar", () => {
    renderView({ season: detail(LAST) });

    expect(screen.queryByRole("button", { name: "Borrar temporada" })).not.toBeInTheDocument();
  });

  it("otra temporada sin equipos sí se puede borrar", () => {
    renderView({ season: detail(LAST, []) });

    expect(screen.getByRole("button", { name: "Borrar temporada" })).toBeInTheDocument();
  });
});

describe("SeasonView · los equipos", () => {
  it("el bloque «Equipos» lleva a las categorías del club", () => {
    renderView();

    const section = screen.getByRole("region", { name: "Equipos" });
    expect(within(section).getByRole("heading", { level: 2, name: "Equipos" })).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Categorías" })).toHaveAttribute(
      "href",
      "/c/club-a/admin/season/categories",
    );
  });

  it("agrupa los equipos por categoría, en el orden en que llegan", () => {
    renderView();

    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Pequeños",
      "Mayores",
    ]);
    expect(teamLinks(group("Pequeños")).map((link) => link.getAttribute("href"))).toEqual([
      `/c/club-a/admin/teams/${uuid(101)}`,
      `/c/club-a/admin/teams/${uuid(102)}`,
    ]);
    expect(teamLinks(group("Mayores")).map((link) => link.getAttribute("href"))).toEqual([
      `/c/club-a/admin/teams/${uuid(103)}`,
    ]);
  });

  it("cada categoría es una lista con una fila por equipo", () => {
    renderView();

    expect(within(within(group("Pequeños")).getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
    expect(within(within(group("Mayores")).getByRole("list")).getAllByRole("listitem")).toHaveLength(1);
  });

  it("cada equipo dice su nombre y cuánta gente tiene, en singular y en plural", () => {
    renderView();

    const [first, second] = teamLinks(group("Pequeños"));
    expect(within(first).getByText("Pequeños A")).toBeInTheDocument();
    expect(within(first).getByText("12 jugadores · 2 técnicos")).toBeInTheDocument();
    expect(within(second).getByText("1 jugador · 1 técnico")).toBeInTheDocument();
    expect(within(teamLinks(group("Mayores"))[0]).getByText("0 jugadores · 0 técnicos")).toBeInTheDocument();
  });

  it("una categoría sin equipos en esta temporada no sale", () => {
    renderView({ season: detail(CURRENT, [TEAMS[2]]) });

    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Mayores"]);
  });

  it("sin equipos lo dice, sin grupos ni listas de equipos", () => {
    renderView({ season: detail(CURRENT, []) });

    expect(screen.getByText("Esta temporada aún no tiene equipos.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3 })).not.toBeInTheDocument();
  });

  it("con equipos no sale el aviso de que no hay", () => {
    renderView();

    expect(screen.queryByText("Esta temporada aún no tiene equipos.")).not.toBeInTheDocument();
  });
});

describe("SeasonView · un equipo nuevo", () => {
  it("con categorías, ofrece el alta de un equipo, con ellas para elegir", () => {
    renderView();

    const form = screen.getByRole("form", { name: "Nuevo equipo" });
    expect(within(within(form).getByLabelText("Categoría")).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Pequeños",
      "Mayores",
    ]);
    expect(within(form).getByRole("button", { name: "Crear equipo" })).toBeInTheDocument();
    expect(screen.queryByText("Un equipo es de una categoría. Crea antes la primera.")).not.toBeInTheDocument();
  });

  it("sin categorías no hay equipo que crear: dice por qué y lleva a crear la primera", () => {
    renderView({ season: detail(CURRENT, []), categories: [] });

    expect(screen.getByRole("heading", { name: "Nuevo equipo" })).toBeInTheDocument();
    expect(screen.getByText("Un equipo es de una categoría. Crea antes la primera.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear una categoría" })).toHaveAttribute(
      "href",
      "/c/club-a/admin/season/categories",
    );
    expect(screen.queryByRole("form", { name: "Nuevo equipo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear equipo" })).not.toBeInTheDocument();
  });

  it("al cambiar de temporada, el alta a medias se vacía: no se crea en la que no es", () => {
    const { rerender } = renderView();
    const name = () => within(screen.getByRole("form", { name: "Nuevo equipo" })).getByLabelText("Nombre");

    fireEvent.change(name(), { target: { value: "Equipo a medias" } });
    rerender(<SeasonView clubSlug="club-a" season={detail(LAST)} seasons={SEASONS} categories={CATEGORIES} />);

    expect(name()).toHaveValue("");
  });
});

describe("SeasonView · editar la temporada y crear otra", () => {
  /** El formulario de «Datos de la temporada»: no es un punto de referencia, se busca por su card. */
  const editCard = () =>
    screen.getByRole("heading", { level: 2, name: "Datos de la temporada" }).parentElement as HTMLElement;

  it("los datos de la temporada que se ve, listos para editar", () => {
    renderView();

    expect(within(editCard()).getByLabelText("Nombre")).toHaveValue("2026/27");
    expect(within(editCard()).getByLabelText("Inicio")).toHaveValue("2026-09-01");
    expect(within(editCard()).getByLabelText("Fin")).toHaveValue("2027-06-30");
    expect(within(editCard()).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("al final, el alta de otra temporada, que puede copiar los equipos de cualquiera del club", () => {
    renderView();

    const form = screen.getByRole("form", { name: "Nueva temporada" });
    expect(within(form).getByLabelText("Nombre")).toHaveValue("");
    expect(
      within(within(form).getByLabelText("Copiar equipos de")).getAllByRole("option").map((o) => o.textContent),
    ).toEqual(["No copiar", "2027/28", "2026/27", "2025/26"]);
  });

  it("con una sola temporada también se puede copiar de ella", () => {
    renderView({ seasons: [CURRENT] });

    const form = screen.getByRole("form", { name: "Nueva temporada" });
    expect(
      within(within(form).getByLabelText("Copiar equipos de")).getAllByRole("option").map((o) => o.textContent),
    ).toEqual(["No copiar", "2026/27"]);
  });

  it("el alta va después de los datos, y es el último bloque de la página", () => {
    renderView();

    const edit = editCard();
    const create = screen.getByRole("form", { name: "Nueva temporada" });
    expect(edit.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByRole("form", { name: "Nuevo equipo" }).compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("al cambiar de temporada, los datos son los de la nueva y lo escrito a medias no se arrastra", () => {
    const { rerender } = renderView();

    fireEvent.change(within(editCard()).getByLabelText("Nombre"), { target: { value: "A medias" } });
    rerender(<SeasonView clubSlug="club-a" season={detail(LAST)} seasons={SEASONS} categories={CATEGORIES} />);

    expect(within(editCard()).getByLabelText("Nombre")).toHaveValue("2025/26");
    expect(within(editCard()).getByLabelText("Inicio")).toHaveValue("2025-09-01");
  });

  it("los únicos botones principales son los de las altas: «Crear equipo» y «Crear temporada»", () => {
    renderView({ season: detail(LAST, []) });

    const primaries = screen
      .getAllByRole("button")
      .filter((button) => button.classList.contains("bg-brand-accent"))
      .map((button) => button.textContent);
    expect(primaries).toEqual(["Crear equipo", "Crear temporada"]);
  });
});

describe("SeasonView · el club de la URL", () => {
  it("todas las rutas llevan el slug del club que le pasan", () => {
    renderView({ clubSlug: "club-b" });

    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^\/c\/club-b\/admin\//);
    }
  });
});
