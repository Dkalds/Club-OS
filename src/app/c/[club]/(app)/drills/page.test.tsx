import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEARCH_LIMIT } from "@/modules/drills/map-rows";
import type { DrillSummary, FocusArea } from "@/modules/drills/types";
import type { GamePrinciple } from "@/modules/methodology/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  searchDrills: vi.fn(),
  getFocusAreas: vi.fn(),
  getPrinciples: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/drills/queries", () => ({
  searchDrills: mocks.searchDrills,
  getFocusAreas: mocks.getFocusAreas,
}));
vi.mock("@/modules/methodology/queries", () => ({ getPrinciples: mocks.getPrinciples }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
// La barra es de cliente y tiene su propio test: aquí solo importa qué recibe.
vi.mock("./filters-bar", () => ({
  DrillFiltersBar: (props: unknown) => <div data-testid="bar" data-props={JSON.stringify(props)} />,
}));

import DrillsPage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
type SearchParams = Record<string, string | string[] | undefined>;

function props(searchParams: SearchParams = {}) {
  return { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve(searchParams) };
}

function drill(overrides: Partial<DrillSummary> = {}): DrillSummary {
  return {
    id: "d-1",
    title: "Un ejercicio",
    status: "published",
    createdBy: null,
    minAge: 12,
    maxAge: null,
    minPlayers: 6,
    maxPlayers: 12,
    minMinutes: 10,
    maxMinutes: 15,
    focus: [{ slug: "rebote", name: "Rebote" }],
    ...overrides,
  };
}

const FOCUS_AREAS: FocusArea[] = [{ id: "f-1", slug: "rebote", name: "Rebote" }];

const PRINCIPLES: GamePrinciple[] = [
  { id: "p-1", slug: "salida", title: "Salida de balón", summary: null, status: "published", points: [] },
  { id: "p-2", slug: "cierre", title: "Cierre", summary: null, status: "published", points: [] },
];

/** Lo que la página le pasó a la barra de filtros. */
function barProps() {
  return JSON.parse(screen.getByTestId("bar").getAttribute("data-props") ?? "{}");
}

async function renderPage(searchParams: SearchParams = {}) {
  return render(await DrillsPage(props(searchParams)));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.searchDrills.mockResolvedValue([drill()]);
  mocks.getFocusAreas.mockResolvedValue(FOCUS_AREAS);
  mocks.getPrinciples.mockResolvedValue(PRINCIPLES);
});

describe("quién entra", () => {
  it("sin club recibe el 404 y no lee nada", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(DrillsPage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.searchDrills).not.toHaveBeenCalled();
    expect(mocks.getFocusAreas).not.toHaveBeenCalled();
    expect(mocks.getPrinciples).not.toHaveBeenCalled();
  });

  it("un fallo de lectura sube hasta error.tsx, no se traga", async () => {
    mocks.searchDrills.mockRejectedValue(new Error("drills.search: boom"));

    await expect(DrillsPage(props())).rejects.toThrow("drills.search: boom");
  });

  it.each(["player", "guardian"] as const)("%s: RLS no le da ejercicios y ve el estado vacío, sin crear", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));
    mocks.searchDrills.mockResolvedValue([]);

    await renderPage();

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay ejercicios" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nuevo ejercicio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nuevo" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Inicio" })).toHaveAttribute("href", "/c/club-a");
  });
});

describe("la cabecera", () => {
  it("es la de detalle «Biblioteca», lo primero del contenido, y vuelve a Entrenar", async () => {
    const { container } = await renderPage();

    const header = container.firstElementChild;
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(within(header as HTMLElement).getByText("Biblioteca")).toBeInTheDocument();
    expect(within(header as HTMLElement).getByRole("link", { name: "Volver" })).toHaveAttribute(
      "href",
      "/c/club-a/train",
    );
  });

  it.each(["admin", "coach"] as const)("%s: «Nuevo» lleva a /drills/new", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));

    await renderPage();

    expect(screen.getByRole("link", { name: "Nuevo" })).toHaveAttribute("href", "/c/club-a/drills/new");
  });

  it.each(["player", "guardian"] as const)("%s: sin «Nuevo»", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));

    await renderPage();

    expect(screen.queryByRole("link", { name: "Nuevo" })).not.toBeInTheDocument();
  });

  it("la pantalla tiene un único <h1>, y no es el título de la cabecera", async () => {
    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Biblioteca de ejercicios");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });
});

describe("los filtros de la URL", () => {
  it("se leen con parseDrillFilters: lo que no vale se ignora y un parámetro repetido vale el primero", async () => {
    await renderPage({ q: "  salida ", focus: ["rebote", "tiro"], age: "13", players: "muchos", minutes: "15", x: "1" });

    expect(mocks.searchDrills).toHaveBeenCalledTimes(1);
    expect(mocks.searchDrills).toHaveBeenCalledWith(expect.anything(), {
      q: "salida",
      focus: "rebote",
      age: 13,
      minutes: 15,
    });
    expect(barProps().filters).toEqual({ q: "salida", focus: "rebote", age: 13, minutes: 15 });
  });

  it("busca en el club del contexto", async () => {
    const ctx = clubContext("coach");
    mocks.getClubContext.mockResolvedValue(ctx);

    await renderPage();

    expect(mocks.searchDrills).toHaveBeenCalledWith(
      expect.objectContaining({ org: expect.objectContaining({ id: ctx.org.id }) }),
      {},
    );
    expect(mocks.getFocusAreas).toHaveBeenCalledWith(expect.objectContaining({ org: expect.anything() }));
  });

  it("la barra recibe los objetivos del club", async () => {
    await renderPage();

    expect(barProps().focusAreas).toEqual(FOCUS_AREAS);
  });

  it("sin principio no se leen los principios y la barra no recibe título", async () => {
    await renderPage({ focus: "rebote" });

    expect(mocks.getPrinciples).not.toHaveBeenCalled();
    expect(barProps().principleTitle).toBeNull();
  });

  it("con principio publicado, la barra recibe su título", async () => {
    await renderPage({ principle: "cierre" });

    expect(mocks.getPrinciples).toHaveBeenCalledTimes(1);
    expect(barProps().principleTitle).toBe("Cierre");
    expect(mocks.searchDrills).toHaveBeenCalledWith(expect.anything(), { principle: "cierre" });
  });

  it("con un principio desconocido o sin publicar, la barra recibe null (y la lista se pide igual)", async () => {
    await renderPage({ principle: "no-existe" });

    expect(barProps().principleTitle).toBeNull();
    expect(barProps().filters).toEqual({ principle: "no-existe" });
    expect(mocks.searchDrills).toHaveBeenCalledWith(expect.anything(), { principle: "no-existe" });
  });
});

describe("la lista", () => {
  it("una fila por ejercicio, en el orden recibido, con su enlace a la ficha", async () => {
    mocks.searchDrills.mockResolvedValue([
      drill({ id: "d-1", title: "Primero" }),
      drill({ id: "d-2", title: "Segundo", status: "draft" }),
    ]);

    await renderPage();

    const links = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.match(/\/drills\/d-/));
    expect(links.map((link) => [link.getAttribute("href"), link.textContent])).toEqual([
      ["/c/club-a/drills/d-1", expect.stringContaining("Primero")],
      ["/c/club-a/drills/d-2", expect.stringContaining("Segundo")],
    ]);
    expect(links[1]).toHaveTextContent("Borrador");
  });

  it("dice cuántos ejercicios hay", async () => {
    mocks.searchDrills.mockResolvedValue([drill({ id: "d-1" }), drill({ id: "d-2" }), drill({ id: "d-3" })]);

    await renderPage();

    expect(screen.getByText("3 ejercicios")).toBeInTheDocument();
  });

  it("en singular con uno", async () => {
    await renderPage();

    expect(screen.getByText("1 ejercicio")).toBeInTheDocument();
    expect(screen.queryByText("1 ejercicios")).not.toBeInTheDocument();
  });

  it("el recuento es un aviso para lectores de pantalla", async () => {
    await renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("1 ejercicio");
  });

  it("con el tope de la búsqueda, no presenta el número como el total", async () => {
    mocks.searchDrills.mockResolvedValue(
      Array.from({ length: SEARCH_LIMIT }, (_, index) => drill({ id: `d-${index}`, title: `Ejercicio ${index}` })),
    );

    await renderPage();

    expect(screen.getByText(`Mostrando los primeros ${SEARCH_LIMIT} ejercicios`)).toBeInTheDocument();
    expect(screen.queryByText(`${SEARCH_LIMIT} ejercicios`)).not.toBeInTheDocument();
  });

  it("un ejercicio menos que el tope sí es el total", async () => {
    mocks.searchDrills.mockResolvedValue(
      Array.from({ length: SEARCH_LIMIT - 1 }, (_, index) => drill({ id: `d-${index}` })),
    );

    await renderPage();

    expect(screen.getByText(`${SEARCH_LIMIT - 1} ejercicios`)).toBeInTheDocument();
    expect(screen.queryByText(/Mostrando los primeros/)).not.toBeInTheDocument();
  });

  it("con ejercicios no hay estado vacío", async () => {
    await renderPage();

    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });
});

describe("el estado vacío", () => {
  beforeEach(() => {
    mocks.searchDrills.mockResolvedValue([]);
  });

  it.each([
    ["una búsqueda", { q: "nada" }],
    ["un objetivo", { focus: "rebote" }],
    ["un principio", { principle: "salida" }],
    ["la edad", { age: "10" }],
    ["los jugadores", { players: "8" }],
    ["la duración", { minutes: "15" }],
  ] as const)("con %s: «No hay ejercicios con estos filtros» y «Quitar filtros»", async (_name, searchParams) => {
    await renderPage(searchParams);

    expect(screen.getByRole("heading", { level: 2, name: "No hay ejercicios con estos filtros" })).toBeInTheDocument();
    expect(screen.getByText("Prueba con otra búsqueda o con menos filtros.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Quitar filtros" })).toHaveAttribute("href", "/c/club-a/drills");
    expect(screen.queryByText("Aún no hay ejercicios")).not.toBeInTheDocument();
  });

  it("filtros que la URL trae pero no valen no cuentan como filtros", async () => {
    await renderPage({ age: "99", focus: "NO VALE" });

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay ejercicios" })).toBeInTheDocument();
  });

  it("sin filtros, a quien puede crear: «Aún no hay ejercicios» y «Nuevo ejercicio»", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay ejercicios" })).toBeInTheDocument();
    expect(screen.getByText("Crea el primero para empezar la biblioteca del club.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nuevo ejercicio" })).toHaveAttribute("href", "/c/club-a/drills/new");
    expect(screen.queryByRole("link", { name: "Quitar filtros" })).not.toBeInTheDocument();
  });

  it("sin filtros, a quien no puede crear: no le ofrece crear ni le promete lo que RLS no le da", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("player"));

    await renderPage();

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay ejercicios" })).toBeInTheDocument();
    expect(screen.queryByText("Crea el primero para empezar la biblioteca del club.")).not.toBeInTheDocument();
    expect(screen.getByText("Los ejercicios del club los gestiona el cuerpo técnico.")).toBeInTheDocument();
  });

  it("no hay recuento visible y el aviso dice 0", async () => {
    await renderPage();

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("0 ejercicios");
    expect(status).toHaveClass("sr-only");
  });

  it("la barra de filtros sigue ahí para cambiar la búsqueda", async () => {
    await renderPage({ q: "nada" });

    expect(screen.getByTestId("bar")).toBeInTheDocument();
  });
});
