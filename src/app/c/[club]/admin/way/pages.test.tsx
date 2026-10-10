import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WaySection } from "@/modules/methodology/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  listSectionsForAdmin: vi.fn(),
  getSectionForAdmin: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/consents/queries", () => ({
  getConsentStatus: async () => ({ needsTerms: false, pendingGuardianships: [] }),
}));
vi.mock("@/modules/methodology/admin-queries", () => ({
  listSectionsForAdmin: mocks.listSectionsForAdmin,
  getSectionForAdmin: mocks.getSectionForAdmin,
}));
// Los formularios llaman a estas acciones; aquí solo se pintan.
vi.mock("@/modules/methodology/actions", () => ({
  createWaySection: vi.fn(),
  updateWaySection: vi.fn(),
  moveMethodologyItem: vi.fn(),
  setMethodologyStatus: vi.fn(),
}));
// Como los de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
}));

import AdminWayPage from "./page";
import AdminWaySectionPage from "./[sectionId]/page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
// Cada página de Gestión pide el contexto y la comprobación de dirección ella misma: un
// layout no protege a sus páginas. Aquí se comprueba eso, y qué pinta cada una.
const LIST_PARAMS = {
  params: Promise.resolve({ club: "club-a" }),
  searchParams: Promise.resolve({}),
};
const ID_1 = "00000000-0000-4000-8000-000000000001";
const ID_2 = "00000000-0000-4000-8000-000000000002";
const ID_3 = "00000000-0000-4000-8000-000000000003";
const SECTION_PARAMS = {
  params: Promise.resolve({ club: "club-a", sectionId: ID_2 }),
  searchParams: Promise.resolve({}),
};

function section(overrides: Partial<WaySection> = {}): WaySection {
  return {
    id: ID_1,
    number: 1,
    slug: "una-seccion",
    title: "Una sección",
    summary: "Su resumen.",
    bodyMd: "Su texto.",
    contentKind: "text",
    status: "published",
    updatedAt: "2026-10-03T10:00:00.123456+00:00",
    ...overrides,
  };
}

const SECTIONS: WaySection[] = [
  section({ id: ID_1, number: 1, title: "Primera", contentKind: "values", status: "published" }),
  section({ id: ID_2, number: 2, title: "Segunda", contentKind: "text", status: "draft" }),
  section({ id: ID_3, number: 3, title: "Tercera", contentKind: "standards", status: "published" }),
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("admin"));
  mocks.listSectionsForAdmin.mockResolvedValue(SECTIONS);
  mocks.getSectionForAdmin.mockResolvedValue(section({ id: ID_2, title: "Segunda" }));
});

/** Las filas de la lista: un `<li>` por sección dentro de `<main>`-contenido. */
function rows() {
  return screen.getAllByRole("listitem");
}

describe("/admin/way", () => {
  it("un entrenador recibe el 404 y no se lee ninguna sección", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach"));

    await expect(AdminWayPage(LIST_PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.listSectionsForAdmin).not.toHaveBeenCalled();
  });

  it("sin club recibe el mismo 404 y no se lee ninguna sección", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(AdminWayPage(LIST_PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.listSectionsForAdmin).not.toHaveBeenCalled();
  });

  it("lee las secciones del club de quien administra", async () => {
    render(await AdminWayPage(LIST_PARAMS));

    expect(mocks.listSectionsForAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.listSectionsForAdmin.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
  });

  it("el título es el nombre que el club da a su metodología, único <h1>, y explica la pantalla", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin", { way: "Nuestra forma" }));

    render(await AdminWayPage(LIST_PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Nuestra forma" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByText(
        "Ordena las secciones y publica las que estén listas. Los entrenadores solo ven lo publicado.",
      ),
    ).toBeInTheDocument();
  });

  it("una fila por sección, en su orden, con número, título, tipo y estado", async () => {
    render(await AdminWayPage(LIST_PARAMS));

    const [first, second, third] = rows();
    expect(first).toHaveTextContent("01");
    expect(first).toHaveTextContent("Primera");
    expect(first).toHaveTextContent("Valores");
    expect(within(first).getByText("Publicado")).toBeInTheDocument();

    expect(second).toHaveTextContent("02");
    expect(second).toHaveTextContent("Segunda");
    expect(second).toHaveTextContent("Texto");
    expect(within(second).getByText("Borrador")).toBeInTheDocument();

    expect(third).toHaveTextContent("03");
    expect(third).toHaveTextContent("Standards");
    expect(rows()).toHaveLength(3);
  });

  it("el número se pinta de dos cifras, tal cual está guardado: un hueco se queda", async () => {
    mocks.listSectionsForAdmin.mockResolvedValue([
      section({ id: ID_1, number: 5, title: "Quinta" }),
      section({ id: ID_2, number: 12, title: "Duodécima" }),
    ]);

    render(await AdminWayPage(LIST_PARAMS));

    expect(rows()[0]).toHaveTextContent("05");
    expect(rows()[1]).toHaveTextContent("12");
  });

  it("cada fila lleva «Editar», que abre su editor por id y no por título", async () => {
    render(await AdminWayPage(LIST_PARAMS));

    const [first, second] = rows();
    expect(within(first).getByRole("link", { name: "Editar Primera" })).toHaveAttribute(
      "href",
      `/c/club-a/admin/way/${ID_1}`,
    );
    expect(within(second).getByRole("link", { name: "Editar Segunda" })).toHaveAttribute(
      "href",
      `/c/club-a/admin/way/${ID_2}`,
    );
  });

  it("cada fila lleva sus controles: la primera no sube, la última no baja, y el estado manda", async () => {
    render(await AdminWayPage(LIST_PARAMS));

    const [first, second, third] = rows();
    expect(within(first).getByRole("button", { name: "Subir Primera" })).toBeDisabled();
    expect(within(first).getByRole("button", { name: "Bajar Primera" })).toBeEnabled();
    expect(within(first).getByRole("button", { name: "Pasar a borrador Primera" })).toBeEnabled();

    expect(within(second).getByRole("button", { name: "Subir Segunda" })).toBeEnabled();
    expect(within(second).getByRole("button", { name: "Bajar Segunda" })).toBeEnabled();
    expect(within(second).getByRole("button", { name: "Publicar Segunda" })).toBeEnabled();

    expect(within(third).getByRole("button", { name: "Bajar Tercera" })).toBeDisabled();
    expect(within(third).getByRole("button", { name: "Subir Tercera" })).toBeEnabled();
  });

  it("una lista de una sola sección no se puede mover", async () => {
    mocks.listSectionsForAdmin.mockResolvedValue([section({ id: ID_1, title: "Única" })]);

    render(await AdminWayPage(LIST_PARAMS));

    expect(screen.getByRole("button", { name: "Subir Única" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Única" })).toBeDisabled();
  });

  it("debajo de la lista, el formulario para crear una sección", async () => {
    render(await AdminWayPage(LIST_PARAMS));

    expect(screen.getByLabelText("Título")).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo")).toBeInTheDocument();
    const create = screen.getByRole("button", { name: "Crear sección" });
    // Después de las filas, no antes.
    const lastRow = rows()[rows().length - 1];
    expect(lastRow.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sin secciones: el aviso con su salida, sin filas, y el formulario sigue ahí", async () => {
    mocks.listSectionsForAdmin.mockResolvedValue([]);

    render(await AdminWayPage(LIST_PARAMS));

    expect(screen.getByText("Aún no hay secciones")).toBeInTheDocument();
    expect(
      screen.getByText("Crea la primera sección de la metodología de tu club."),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Crear sección" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("un título muy largo no desborda la fila", async () => {
    mocks.listSectionsForAdmin.mockResolvedValue([
      section({ id: ID_1, title: "x".repeat(80) }),
    ]);

    render(await AdminWayPage(LIST_PARAMS));

    expect(screen.getByText("x".repeat(80))).toHaveClass("wrap-break-word");
  });
});

describe("/admin/way/[sectionId]", () => {
  it("un entrenador recibe el 404 y no se lee la sección", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach"));

    await expect(AdminWaySectionPage(SECTION_PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getSectionForAdmin).not.toHaveBeenCalled();
  });

  it("sin club recibe el mismo 404 y no se lee la sección", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(AdminWaySectionPage(SECTION_PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getSectionForAdmin).not.toHaveBeenCalled();
  });

  it("una sección que no existe (o es de otro club) da el 404", async () => {
    mocks.getSectionForAdmin.mockResolvedValue(null);

    await expect(AdminWaySectionPage(SECTION_PARAMS)).rejects.toThrow("NOT_FOUND");
  });

  it("pide la sección por el id de la URL, en el club de quien administra", async () => {
    render(await AdminWaySectionPage(SECTION_PARAMS));

    expect(mocks.getSectionForAdmin).toHaveBeenCalledTimes(1);
    const [ctx, id] = mocks.getSectionForAdmin.mock.calls[0];
    expect(ctx).toMatchObject({ org: { slug: "club-a" } });
    expect(id).toBe(ID_2);
  });

  it("«Editar sección» es el único <h1>, y el editor trae lo guardado", async () => {
    render(await AdminWaySectionPage(SECTION_PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Editar sección" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByLabelText("Título")).toHaveValue("Segunda");
    expect(screen.getByLabelText("Resumen")).toHaveValue("Su resumen.");
    expect(screen.getByLabelText("Contenido")).toHaveValue("Su texto.");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-a/admin/way");
  });
});
