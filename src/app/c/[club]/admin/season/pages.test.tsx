import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Category, SeasonDetail, SeasonSummary } from "@/modules/structure/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  listSeasons: vi.fn(),
  getSeason: vi.fn(),
  listCategories: vi.fn(),
}));

vi.mock("@/modules/consents/queries", () => ({
  getConsentStatus: async () => ({ needsTerms: false, pendingGuardianships: [] }),
}));
vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
// Las lecturas son de pega; `defaultSeason` (qué temporada toca) es la de verdad.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/modules/structure/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/structure/queries")>()),
  listSeasons: mocks.listSeasons,
  getSeason: mocks.getSeason,
  listCategories: mocks.listCategories,
}));
// Los formularios llaman a estas acciones; aquí solo se pintan.
vi.mock("@/modules/structure/actions", () => ({
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
  setCurrentSeason: vi.fn(),
  deleteSeason: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  deleteTeam: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
}));
// Como los de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
}));

import AdminSeasonByIdPage from "./[seasonId]/page";
import AdminCategoriesPage from "./categories/page";
import AdminSeasonPage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
// Cada página de Gestión pide el contexto y la comprobación de dirección ella misma: un layout
// no protege a sus páginas. Aquí se comprueba eso, y qué pinta cada una.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const S_CURRENT = uuid(1);
const S_LAST = uuid(2);
const S_NEXT = uuid(3);
const C_SMALL = uuid(10);
const C_BIG = uuid(20);

const PARAMS = { params: Promise.resolve({ club: "club-a" }) };
const seasonParams = (seasonId: string) => ({ params: Promise.resolve({ club: "club-a", seasonId }) });

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
  { id: C_BIG, name: "Mayores", ageBand: "U16", sort: 20, inUse: false },
];

function detail(season: SeasonSummary): SeasonDetail {
  return {
    ...season,
    teams: [
      {
        id: uuid(101),
        name: "Pequeños A",
        categoryId: C_SMALL,
        categoryName: "Pequeños",
        categorySort: 10,
        players: 12,
        staff: 2,
      },
    ],
  };
}

const BY_ID: Record<string, SeasonSummary> = { [S_CURRENT]: CURRENT, [S_LAST]: LAST, [S_NEXT]: NEXT };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("admin"));
  mocks.listSeasons.mockResolvedValue(SEASONS);
  mocks.listCategories.mockResolvedValue(CATEGORIES);
  // Como la de verdad: la temporada del club con ese id, o null.
  mocks.getSeason.mockImplementation(async (_ctx: unknown, id: string) => (BY_ID[id] ? detail(BY_ID[id]) : null));
});

const PAGES: Array<[string, () => Promise<unknown>]> = [
  ["/admin/season", () => AdminSeasonPage(PARAMS)],
  ["/admin/season/[seasonId]", () => AdminSeasonByIdPage(seasonParams(S_LAST))],
  ["/admin/season/categories", () => AdminCategoriesPage(PARAMS)],
];

function expectNothingRead() {
  expect(mocks.listSeasons).not.toHaveBeenCalled();
  expect(mocks.getSeason).not.toHaveBeenCalled();
  expect(mocks.listCategories).not.toHaveBeenCalled();
}

describe("quién entra", () => {
  it.each(PAGES)("%s: quien no dirige el club recibe el 404 y no se lee nada", async (_route, page) => {
    for (const role of ["coach", "player", "guardian"] as const) {
      mocks.getClubContext.mockResolvedValue(clubContext(role));

      await expect(page()).rejects.toThrow("NOT_FOUND");
    }
    expectNothingRead();
  });

  it.each(PAGES)("%s: sin club recibe el mismo 404 y no se lee nada", async (_route, page) => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expectNothingRead();
  });
});

describe("/admin/season", () => {
  it("enseña la temporada actual del club, aunque no sea la más reciente", async () => {
    render(await AdminSeasonPage(PARAMS));

    expect(mocks.getSeason).toHaveBeenCalledTimes(1);
    expect(mocks.getSeason.mock.calls[0][1]).toBe(S_CURRENT);
    expect(screen.getByRole("region", { name: "Temporada 2026/27" })).toBeInTheDocument();
    expect(screen.getByText("1 sep 2026 – 30 jun 2027")).toBeInTheDocument();
  });

  it("lee con el contexto del club de quien administra", async () => {
    render(await AdminSeasonPage(PARAMS));

    for (const read of [mocks.listSeasons, mocks.getSeason, mocks.listCategories]) {
      expect(read.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" }, membership: { role: "admin" } });
    }
  });

  it("sin ninguna temporada actual, enseña la más reciente", async () => {
    mocks.listSeasons.mockResolvedValue([NEXT, LAST]);

    render(await AdminSeasonPage(PARAMS));

    expect(mocks.getSeason.mock.calls[0][1]).toBe(S_NEXT);
    expect(screen.getByRole("region", { name: "Temporada 2027/28" })).toBeInTheDocument();
  });

  it("pinta la vista de la temporada: sus pestañas, sus equipos y las altas", async () => {
    render(await AdminSeasonPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Temporada" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const nav = screen.getByRole("navigation", { name: "Temporadas" });
    expect(within(nav).getByRole("link", { name: /2026\/27/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Pequeños A/ })).toHaveAttribute(
      "href",
      `/c/club-a/admin/teams/${uuid(101)}`,
    );
    expect(screen.getByText("12 jugadores · 2 técnicos")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Nuevo equipo" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Nueva temporada" })).toBeInTheDocument();
    expect(screen.queryByText("Aún no hay temporadas")).not.toBeInTheDocument();
  });

  it("un club sin temporadas ve el alta de la primera, y no se lee nada más", async () => {
    mocks.listSeasons.mockResolvedValue([]);

    render(await AdminSeasonPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Temporada" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay temporadas" })).toBeInTheDocument();
    expect(screen.getByText("Crea la primera: será la temporada actual de tu club.")).toBeInTheDocument();
    const form = screen.getByRole("form", { name: "Nueva temporada" });
    expect(within(form).getByRole("button", { name: "Crear temporada" })).toHaveClass("bg-brand-accent");
    // No hay de dónde copiar equipos, ni temporada que enseñar.
    expect(within(form).queryByLabelText("Copiar equipos de")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Temporadas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Equipos" })).not.toBeInTheDocument();
    expect(mocks.getSeason).not.toHaveBeenCalled();
    expect(mocks.listCategories).not.toHaveBeenCalled();
  });

  it("si la temporada desaparece entre una lectura y la otra, es el 404", async () => {
    mocks.getSeason.mockResolvedValue(null);

    await expect(AdminSeasonPage(PARAMS)).rejects.toThrow("NOT_FOUND");
  });

  it("sin categorías, el alta de equipo se cambia por la invitación a crear la primera", async () => {
    mocks.listCategories.mockResolvedValue([]);

    render(await AdminSeasonPage(PARAMS));

    expect(screen.getByRole("link", { name: "Crear una categoría" })).toHaveAttribute(
      "href",
      "/c/club-a/admin/season/categories",
    );
    expect(screen.queryByRole("form", { name: "Nuevo equipo" })).not.toBeInTheDocument();
  });
});

describe("/admin/season/[seasonId]", () => {
  it("enseña la temporada de la URL, sea o no la actual", async () => {
    render(await AdminSeasonByIdPage(seasonParams(S_LAST)));

    expect(mocks.getSeason).toHaveBeenCalledTimes(1);
    expect(mocks.getSeason.mock.calls[0][1]).toBe(S_LAST);
    expect(mocks.getSeason.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
    const section = screen.getByRole("region", { name: "Temporada 2025/26" });
    expect(within(section).getByText("1 sep 2025 – 30 jun 2026")).toBeInTheDocument();
    expect(within(section).queryByText("Actual")).not.toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Marcar como actual" })).toBeInTheDocument();
  });

  it("en las pestañas, aria-current va con la temporada de la URL y «Actual» con la actual", async () => {
    render(await AdminSeasonByIdPage(seasonParams(S_LAST)));

    const nav = screen.getByRole("navigation", { name: "Temporadas" });
    expect(within(nav).getByRole("link", { name: "2025/26" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /2026\/27/ })).not.toHaveAttribute("aria-current");
  });

  it("la actual, por su URL, se ve igual que en /admin/season", async () => {
    render(await AdminSeasonByIdPage(seasonParams(S_CURRENT)));

    const section = screen.getByRole("region", { name: "Temporada 2026/27" });
    expect(within(section).getByText("Actual")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Marcar como actual" })).not.toBeInTheDocument();
  });

  it.each([
    ["que no existe", uuid(77)],
    ["cuyo id no tiene forma de uuid", "no-es-un-id"],
    ["que se llama como otra ruta", "nueva"],
  ])("una temporada %s es el 404", async (_case, seasonId) => {
    await expect(AdminSeasonByIdPage(seasonParams(seasonId))).rejects.toThrow("NOT_FOUND");
    expect(mocks.getSeason.mock.calls[0][1]).toBe(seasonId);
  });

  it("la de otro club es el mismo 404: la lectura va acotada al club de la URL", async () => {
    // `getSeason` devuelve null para lo que no es de este club (su test lo comprueba).
    mocks.getSeason.mockResolvedValue(null);

    await expect(AdminSeasonByIdPage(seasonParams(S_LAST))).rejects.toThrow("NOT_FOUND");
  });
});

describe("/admin/season/categories", () => {
  /** Las cards de la lista: un `<li>` por categoría. */
  const cards = () => screen.getAllByRole("listitem");

  it("lee las categorías del club de quien administra", async () => {
    render(await AdminCategoriesPage(PARAMS));

    expect(mocks.listCategories).toHaveBeenCalledTimes(1);
    expect(mocks.listCategories.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
    expect(mocks.listSeasons).not.toHaveBeenCalled();
  });

  it("«Categorías» es el único <h1>, vuelve a Temporada y dice de quién son", async () => {
    render(await AdminCategoriesPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Categorías" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Temporada" })).toHaveAttribute("href", "/c/club-a/admin/season");
    expect(screen.getByText("Las comparten los equipos de todas las temporadas.")).toBeInTheDocument();
  });

  it("una card por categoría, en su orden, con su nombre, su edad y su editor", async () => {
    render(await AdminCategoriesPage(PARAMS));

    const [first, second] = cards();
    expect(cards()).toHaveLength(2);
    expect(within(first).getByRole("heading", { level: 2, name: "Pequeños" })).toBeInTheDocument();
    expect(within(first).getByText("Sub 12")).toBeInTheDocument();
    expect(within(first).getByLabelText("Nombre")).toHaveValue("Pequeños");
    expect(within(first).getByLabelText("Edad (sub)")).toHaveValue(12);
    expect(within(first).getByLabelText("Orden")).toHaveValue(10);

    expect(within(second).getByRole("heading", { level: 2, name: "Mayores" })).toBeInTheDocument();
    expect(within(second).getByText("Sub 16")).toBeInTheDocument();
    for (const card of [first, second]) {
      expect(within(card).getByRole("button", { name: "Guardar" })).toHaveClass("border-line-strong");
    }
  });

  it("solo se ofrece borrar la que ningún equipo lleva", async () => {
    render(await AdminCategoriesPage(PARAMS));

    const [inUse, free] = cards();
    expect(within(inUse).queryByRole("button", { name: "Borrar categoría" })).not.toBeInTheDocument();
    expect(within(inUse).getByText("La lleva algún equipo: no se puede borrar.")).toBeInTheDocument();
    expect(within(free).getByRole("button", { name: "Borrar categoría" })).toBeInTheDocument();
  });

  it("después de las cards, el alta con el único botón principal, que propone el orden siguiente", async () => {
    render(await AdminCategoriesPage(PARAMS));

    const form = screen.getByRole("form", { name: "Nueva categoría" });
    const create = within(form).getByRole("button", { name: "Crear categoría" });
    const lastCard = cards()[cards().length - 1];
    expect(lastCard.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(lastCard).queryByRole("button", { name: "Crear categoría" })).not.toBeInTheDocument();
    // El mayor orden que hay (20) más un hueco para intercalar.
    expect(within(form).getByLabelText("Orden")).toHaveValue(30);

    const primaries = screen
      .getAllByRole("button")
      .filter((button) => button.classList.contains("bg-brand-accent"));
    expect(primaries).toEqual([create]);
  });

  it("el orden siguiente sale del mayor, no del último de la lista", async () => {
    mocks.listCategories.mockResolvedValue([
      { ...CATEGORIES[0], sort: 40 },
      { ...CATEGORIES[1], sort: 5 },
    ]);

    render(await AdminCategoriesPage(PARAMS));

    expect(within(screen.getByRole("form", { name: "Nueva categoría" })).getByLabelText("Orden")).toHaveValue(50);
  });

  it("sin categorías: el aviso, sin cards, y el alta sigue ahí proponiendo el primer orden", async () => {
    mocks.listCategories.mockResolvedValue([]);

    render(await AdminCategoriesPage(PARAMS));

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay categorías" })).toBeInTheDocument();
    expect(screen.getByText("Crea la primera para poder crear equipos.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    const form = screen.getByRole("form", { name: "Nueva categoría" });
    expect(within(form).getByLabelText("Orden")).toHaveValue(10);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("con categorías no sale el aviso de lista vacía", async () => {
    render(await AdminCategoriesPage(PARAMS));

    expect(screen.queryByText("Aún no hay categorías")).not.toBeInTheDocument();
  });

  it("un nombre muy largo no desborda la card", async () => {
    mocks.listCategories.mockResolvedValue([{ ...CATEGORIES[0], name: "X".repeat(60) }]);

    render(await AdminCategoriesPage(PARAMS));

    expect(screen.getByRole("heading", { level: 2, name: "X".repeat(60) })).toHaveClass("wrap-break-word");
  });
});
