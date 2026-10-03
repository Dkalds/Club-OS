import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  listSectionsForAdmin: vi.fn(),
  listValuesForAdmin: vi.fn(),
  listPrinciplesForAdmin: vi.fn(),
  listStandardsForAdmin: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
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
import AdminPrinciplesPage from "./principles/page";
import AdminStandardsPage from "./standards/page";
import AdminValuesPage from "./values/page";
import AdminWayPage from "./way/page";

// Cada página de Gestión pide el contexto y la comprobación de dirección ella misma: un
// layout no protege a sus páginas. `pnpm check:guards` exige `requireAdmin(` en cada una;
// aquí se comprueba que además hace lo que promete.
const PARAMS = { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve({}) };

const PAGES: Array<[string, (props: typeof PARAMS) => Promise<unknown>]> = [
  ["/admin", AdminPage],
  ["/admin/way", AdminWayPage],
  ["/admin/values", AdminValuesPage],
  ["/admin/principles", AdminPrinciplesPage],
  ["/admin/standards", AdminStandardsPage],
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.listSectionsForAdmin.mockResolvedValue([]);
  mocks.listValuesForAdmin.mockResolvedValue([]);
  mocks.listPrinciplesForAdmin.mockResolvedValue([]);
  mocks.listStandardsForAdmin.mockResolvedValue([]);
});

describe("páginas de Gestión", () => {
  it.each(PAGES)("%s: un entrenador recibe el 404", async (_route, page) => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach"));

    await expect(page(PARAMS)).rejects.toThrow("NOT_FOUND");
  });

  it.each(PAGES)("%s: sin club recibe el mismo 404", async (_route, page) => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(page(PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
  });

  it("la raíz de Gestión lleva a la metodología", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));

    await expect(AdminPage(PARAMS)).rejects.toThrow("REDIRECT /c/club-a/admin/way");
  });

  it.each([
    [AdminWayPage, "The Way"],
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
