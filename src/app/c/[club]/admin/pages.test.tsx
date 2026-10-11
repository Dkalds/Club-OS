import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  listSectionsForAdmin: vi.fn(),
  listValuesForAdmin: vi.fn(),
  listPrinciplesForAdmin: vi.fn(),
  listStandardsForAdmin: vi.fn(),
  listSeasons: vi.fn(),
  getSeason: vi.fn(),
  listCategories: vi.fn(),
  getAdminTeam: vi.fn(),
  listPeople: vi.fn(),
  getPerson: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
// La estructura del club (temporada, categorías, equipos y personas): sus lecturas, de pega. Lo
// que pinta cada página se prueba en el `pages.test.tsx` de su carpeta.
vi.mock("@/modules/structure/queries", () => ({
  PEOPLE_LIMIT: 1000,
  defaultSeason: () => null,
  listSeasons: mocks.listSeasons,
  getSeason: mocks.getSeason,
  listCategories: mocks.listCategories,
  getAdminTeam: mocks.getAdminTeam,
  listPeople: mocks.listPeople,
  getPerson: mocks.getPerson,
}));
vi.mock("@/modules/structure/actions", () => ({
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
  setCurrentSeason: vi.fn(),
  deleteSeason: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  deleteTeam: vi.fn(),
  addStaff: vi.fn(),
  setStaffRole: vi.fn(),
  removeStaff: vi.fn(),
  addPlayer: vi.fn(),
  addNewPlayer: vi.fn(),
  updatePlayer: vi.fn(),
  removePlayer: vi.fn(),
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  setPersonArchived: vi.fn(),
}));
vi.mock("@/modules/methodology/admin-queries", () => ({
  listSectionsForAdmin: mocks.listSectionsForAdmin,
  listValuesForAdmin: mocks.listValuesForAdmin,
  listPrinciplesForAdmin: mocks.listPrinciplesForAdmin,
  listStandardsForAdmin: mocks.listStandardsForAdmin,
}));
// Las listas de Gestión llevan formularios que llaman a estas acciones; aquí solo se pintan.
// El contenido de cada lista se prueba en el `pages.test.tsx` de su carpeta.
vi.mock("@/modules/methodology/actions", () => ({
  createWaySection: vi.fn(),
  createValue: vi.fn(),
  updateValue: vi.fn(),
  createPrinciple: vi.fn(),
  savePrinciple: vi.fn(),
  createStandard: vi.fn(),
  updateStandard: vi.fn(),
  moveMethodologyItem: vi.fn(),
  setMethodologyStatus: vi.fn(),
}));
// Como los de verdad: `notFound()` y `redirect()` cortan el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (destination: string) => {
    throw new Error(`REDIRECT ${destination}`);
  },
  useRouter: () => ({ push: vi.fn() }),
}));

import AdminPage from "./page";
import AdminPersonPage from "./people/[personId]/page";
import AdminPeoplePage from "./people/page";
import AdminPrinciplesPage from "./principles/page";
import AdminSeasonByIdPage from "./season/[seasonId]/page";
import AdminCategoriesPage from "./season/categories/page";
import AdminSeasonPage from "./season/page";
import AdminStandardsPage from "./standards/page";
import AdminTeamPage from "./teams/[teamId]/page";
import AdminValuesPage from "./values/page";
import AdminWayPage from "./way/page";

// Cada página de Gestión pide el contexto y la comprobación de dirección ella misma: un
// layout no protege a sus páginas. `pnpm check:guards` exige que cada una se exporte con
// `adminPage(`; aquí se comprueba que además hace lo que promete.
const PARAMS = { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve({}) };

/** Un id con forma de uuid para las rutas que lo llevan. */
const ID = "00000000-0000-4000-8000-000000000001";

const PAGES: Array<[string, () => Promise<unknown>]> = [
  ["/admin", () => AdminPage(PARAMS)],
  ["/admin/season", () => AdminSeasonPage(PARAMS)],
  [
    "/admin/season/[seasonId]",
    () => AdminSeasonByIdPage({ params: Promise.resolve({ club: "club-a", seasonId: ID }) }),
  ],
  ["/admin/season/categories", () => AdminCategoriesPage(PARAMS)],
  ["/admin/teams/[teamId]", () => AdminTeamPage({ params: Promise.resolve({ club: "club-a", teamId: ID }) })],
  ["/admin/people", () => AdminPeoplePage(PARAMS)],
  [
    "/admin/people/[personId]",
    () => AdminPersonPage({ params: Promise.resolve({ club: "club-a", personId: ID }) }),
  ],
  ["/admin/way", () => AdminWayPage(PARAMS)],
  ["/admin/values", () => AdminValuesPage(PARAMS)],
  ["/admin/principles", () => AdminPrinciplesPage(PARAMS)],
  ["/admin/standards", () => AdminStandardsPage(PARAMS)],
];

/** Las páginas de la estructura que llevan un id en la URL. */
const BY_ID = PAGES.filter(([route]) => route.endsWith("]"));

/** Todas las lecturas de Gestión: ninguna debe correr antes de comprobar quién entra. */
const READS = [
  "listSectionsForAdmin",
  "listValuesForAdmin",
  "listPrinciplesForAdmin",
  "listStandardsForAdmin",
  "listSeasons",
  "getSeason",
  "listCategories",
  "getAdminTeam",
  "listPeople",
  "getPerson",
] as const;

function expectNothingRead() {
  for (const read of READS) expect(mocks[read], read).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listSectionsForAdmin.mockResolvedValue([]);
  mocks.listValuesForAdmin.mockResolvedValue([]);
  mocks.listPrinciplesForAdmin.mockResolvedValue([]);
  mocks.listStandardsForAdmin.mockResolvedValue([]);
  mocks.listSeasons.mockResolvedValue([]);
  mocks.getSeason.mockResolvedValue(null);
  mocks.listCategories.mockResolvedValue([]);
  mocks.getAdminTeam.mockResolvedValue(null);
  mocks.listPeople.mockResolvedValue([]);
  mocks.getPerson.mockResolvedValue(null);
});

describe("páginas de Gestión", () => {
  it("son todas las páginas de Gestión: las de la estructura del club y las de la metodología", () => {
    expect(PAGES).toHaveLength(11);
  });

  it.each(PAGES)("%s: un entrenador recibe el 404, sin que se lea nada", async (_route, page) => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach"));

    await expect(page()).rejects.toThrow("NOT_FOUND");
    expectNothingRead();
  });

  it.each(PAGES)("%s: sin club recibe el mismo 404, sin que se lea nada", async (_route, page) => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(page()).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expectNothingRead();
  });

  it("la raíz de Gestión lleva a su primer apartado, la temporada", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));

    await expect(AdminPage(PARAMS)).rejects.toThrow("REDIRECT /c/club-a/admin/season");
    expectNothingRead();
  });

  it("la raíz no redirige a quien no dirige el club: recibe el 404, no una pista de la ruta", async () => {
    for (const role of ["coach", "player", "guardian"] as const) {
      mocks.getClubContext.mockResolvedValue(clubContext(role));

      await expect(AdminPage(PARAMS)).rejects.toThrow("NOT_FOUND");
    }
  });

  it.each([
    [AdminSeasonPage, "Temporada"],
    [AdminCategoriesPage, "Categorías"],
    [AdminPeoplePage, "Personas"],
  ] as const)("dirección ve la cabecera de cada apartado de la estructura: «%#»", async (page, title) => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));

    render(await page(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it.each(BY_ID)("%s: lo que no existe en el club es el 404 también para la dirección", async (_route, page) => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));

    await expect(page()).rejects.toThrow("NOT_FOUND");
  });

  it.each([
    [AdminWayPage, "Identidad"],
    [AdminValuesPage, "Valores"],
    [AdminPrinciplesPage, "Principios"],
    [AdminStandardsPage, "Standards"],
  ] as const)("dirección ve la cabecera de cada apartado: «%#»", async (page, title) => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));

    render(await page(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
  });

  it("la cabecera de la metodología y la de los Standards usan los nombres del club", async () => {
    mocks.getClubContext.mockResolvedValue(
      clubContext("admin", { way: "Nuestra forma", standards: "Normas" }),
    );

    render(await AdminWayPage(PARAMS));
    expect(screen.getByRole("heading", { level: 1, name: "Nuestra forma" })).toBeInTheDocument();

    render(await AdminStandardsPage(PARAMS));
    expect(screen.getByRole("heading", { level: 1, name: "Normas" })).toBeInTheDocument();
  });
});
