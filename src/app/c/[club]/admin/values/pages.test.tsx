import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubValue } from "@/modules/methodology/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), listValuesForAdmin: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/consents/queries", () => ({
  getConsentStatus: async () => ({ needsTerms: false, pendingGuardianships: [] }),
}));
vi.mock("@/modules/methodology/admin-queries", () => ({
  listValuesForAdmin: mocks.listValuesForAdmin,
}));
// Los formularios llaman a estas acciones; aquí solo se pintan.
vi.mock("@/modules/methodology/actions", () => ({
  createValue: vi.fn(),
  updateValue: vi.fn(),
  moveMethodologyItem: vi.fn(),
  setMethodologyStatus: vi.fn(),
}));
// Como los de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import AdminValuesPage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
// Cada página de Gestión pide el contexto y la comprobación de dirección ella misma: un
// layout no protege a sus páginas. Aquí se comprueba eso, y qué pinta la lista de valores.
const PARAMS = { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve({}) };
const ID_1 = "00000000-0000-4000-8000-000000000001";
const ID_2 = "00000000-0000-4000-8000-000000000002";
const ID_3 = "00000000-0000-4000-8000-000000000003";

function value(overrides: Partial<ClubValue> = {}): ClubValue {
  return {
    id: ID_1,
    code: "VALOR A",
    title: null,
    description: "Una descripción.",
    status: "published",
    ...overrides,
  };
}

const VALUES: ClubValue[] = [
  value({ id: ID_1, code: "VALOR A", status: "published" }),
  value({ id: ID_2, code: "VALOR B", title: "Un título", status: "draft" }),
  value({ id: ID_3, code: "VALOR C", status: "published" }),
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("admin"));
  mocks.listValuesForAdmin.mockResolvedValue(VALUES);
});

/** Las cards de la lista: un `<li>` por valor. */
function cards() {
  return screen.getAllByRole("listitem");
}

describe("/admin/values", () => {
  it("un entrenador recibe el 404 y no se lee ningún valor", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach"));

    await expect(AdminValuesPage(PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.listValuesForAdmin).not.toHaveBeenCalled();
  });

  it("sin club recibe el mismo 404 y no se lee ningún valor", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(AdminValuesPage(PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.listValuesForAdmin).not.toHaveBeenCalled();
  });

  it("lee los valores del club de quien administra", async () => {
    render(await AdminValuesPage(PARAMS));

    expect(mocks.listValuesForAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.listValuesForAdmin.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
  });

  it("«Valores» es el único <h1> y avisa de que los entrenadores solo ven lo publicado", async () => {
    render(await AdminValuesPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Valores" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Los entrenadores solo ven lo publicado.")).toBeInTheDocument();
  });

  it("una card por valor, en su orden, con su código, su estado y su editor", async () => {
    render(await AdminValuesPage(PARAMS));

    const [first, second, third] = cards();
    expect(cards()).toHaveLength(3);
    expect(within(first).getByRole("heading", { level: 2, name: "VALOR A" })).toBeInTheDocument();
    expect(within(first).getByText("Publicado")).toBeInTheDocument();
    expect(within(first).getByLabelText("Código")).toHaveValue("VALOR A");
    expect(within(first).getByLabelText("Título (opcional)")).toHaveValue("");

    expect(within(second).getByRole("heading", { level: 2, name: "VALOR B" })).toBeInTheDocument();
    expect(within(second).getByText("Borrador")).toBeInTheDocument();
    expect(within(second).getByLabelText("Título (opcional)")).toHaveValue("Un título");

    expect(within(third).getByRole("heading", { level: 2, name: "VALOR C" })).toBeInTheDocument();
    for (const card of [first, second, third]) {
      expect(within(card).getByRole("button", { name: "Guardar" })).toHaveClass("border-line-strong");
    }
  });

  it("cada card lleva sus controles: el primero no sube, el último no baja y el estado manda", async () => {
    render(await AdminValuesPage(PARAMS));

    const [first, second, third] = cards();
    expect(within(first).getByRole("button", { name: "Subir VALOR A" })).toBeDisabled();
    expect(within(first).getByRole("button", { name: "Bajar VALOR A" })).toBeEnabled();
    expect(within(first).getByRole("button", { name: "Pasar a borrador VALOR A" })).toBeEnabled();

    expect(within(second).getByRole("button", { name: "Subir VALOR B" })).toBeEnabled();
    expect(within(second).getByRole("button", { name: "Bajar VALOR B" })).toBeEnabled();
    expect(within(second).getByRole("button", { name: "Publicar VALOR B" })).toBeEnabled();

    expect(within(third).getByRole("button", { name: "Bajar VALOR C" })).toBeDisabled();
    expect(within(third).getByRole("button", { name: "Subir VALOR C" })).toBeEnabled();
  });

  it("una lista de un solo valor no se puede mover", async () => {
    mocks.listValuesForAdmin.mockResolvedValue([value({ id: ID_1, code: "ÚNICO" })]);

    render(await AdminValuesPage(PARAMS));

    expect(screen.getByRole("button", { name: "Subir ÚNICO" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar ÚNICO" })).toBeDisabled();
  });

  it("después de las cards, el alta con el único botón principal de la página", async () => {
    render(await AdminValuesPage(PARAMS));

    const form = screen.getByRole("form", { name: "Nuevo valor" });
    const create = within(form).getByRole("button", { name: "Crear valor" });
    const lastCard = cards()[cards().length - 1];
    expect(lastCard.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // El alta no está dentro de la lista: no es una card más.
    expect(within(lastCard).queryByRole("button", { name: "Crear valor" })).not.toBeInTheDocument();

    const primaries = screen
      .getAllByRole("button")
      .filter((button) => button.classList.contains("bg-brand-accent"));
    expect(primaries).toEqual([create]);
  });

  it("sin valores: el aviso con su salida, sin cards, y el alta sigue ahí", async () => {
    mocks.listValuesForAdmin.mockResolvedValue([]);

    render(await AdminValuesPage(PARAMS));

    expect(screen.getByText("Aún no hay valores")).toBeInTheDocument();
    expect(screen.getByText("Crea el primer valor de tu club.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Crear valor" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Valores" })).toBeInTheDocument();
  });

  it("con valores no sale el aviso de lista vacía", async () => {
    render(await AdminValuesPage(PARAMS));

    expect(screen.queryByText("Aún no hay valores")).not.toBeInTheDocument();
  });

  it("un código muy largo no desborda la card", async () => {
    mocks.listValuesForAdmin.mockResolvedValue([value({ code: "X".repeat(40) })]);

    render(await AdminValuesPage(PARAMS));

    expect(screen.getByRole("heading", { level: 2, name: "X".repeat(40) })).toHaveClass(
      "wrap-break-word",
    );
  });
});
