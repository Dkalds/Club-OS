import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminStandard } from "@/modules/methodology/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), listStandardsForAdmin: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/consents/queries", () => ({
  getConsentStatus: async () => ({ needsTerms: false, pendingGuardianships: [] }),
}));
vi.mock("@/modules/methodology/admin-queries", () => ({
  listStandardsForAdmin: mocks.listStandardsForAdmin,
}));
// Los formularios llaman a estas acciones; aquí solo se pintan.
vi.mock("@/modules/methodology/actions", () => ({
  createStandard: vi.fn(),
  updateStandard: vi.fn(),
  moveMethodologyItem: vi.fn(),
  setMethodologyStatus: vi.fn(),
}));
// Como los de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import AdminStandardsPage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
// Cada página de Gestión pide el contexto y la comprobación de dirección ella misma: un
// layout no protege a sus páginas. Aquí se comprueba eso, y qué pinta la lista de Standards.
const PARAMS = { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve({}) };
const ID_1 = "00000000-0000-4000-8000-000000000001";
const ID_2 = "00000000-0000-4000-8000-000000000002";
const ID_3 = "00000000-0000-4000-8000-000000000003";

function standard(overrides: Partial<AdminStandard> = {}): AdminStandard {
  return {
    id: ID_1,
    number: 1,
    title: "STANDARD A",
    description: "Una descripción.",
    status: "published",
    ...overrides,
  };
}

const STANDARDS: AdminStandard[] = [
  standard({ id: ID_1, number: 1, title: "STANDARD A", status: "published" }),
  standard({ id: ID_2, number: 2, title: "STANDARD B", status: "draft" }),
  standard({ id: ID_3, number: 3, title: "STANDARD C", status: "published" }),
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("admin"));
  mocks.listStandardsForAdmin.mockResolvedValue(STANDARDS);
});

/** Las cards de la lista: un `<li>` por Standard. */
function cards() {
  return screen.getAllByRole("listitem");
}

describe("/admin/standards", () => {
  it("un entrenador recibe el 404 y no se lee ningún Standard", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach"));

    await expect(AdminStandardsPage(PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.listStandardsForAdmin).not.toHaveBeenCalled();
  });

  it("sin club recibe el mismo 404 y no se lee ningún Standard", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(AdminStandardsPage(PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.listStandardsForAdmin).not.toHaveBeenCalled();
  });

  it("lee los Standards del club de quien administra", async () => {
    render(await AdminStandardsPage(PARAMS));

    expect(mocks.listStandardsForAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.listStandardsForAdmin.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
  });

  it("el título es el nombre que el club da a sus Standards, único <h1>, y avisa de lo publicado", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin", { standards: "Normas" }));

    render(await AdminStandardsPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Normas" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Los entrenadores solo ven lo publicado.")).toBeInTheDocument();
  });

  it("sin nombre propio, el título es «Standards»", async () => {
    render(await AdminStandardsPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Standards" })).toBeInTheDocument();
  });

  it("una card por Standard, en su orden, con su número, su título, su estado y su editor", async () => {
    render(await AdminStandardsPage(PARAMS));

    const [first, second, third] = cards();
    expect(cards()).toHaveLength(3);
    expect(within(first).getByText("01")).toBeInTheDocument();
    expect(within(first).getByRole("heading", { level: 2, name: "STANDARD A" })).toBeInTheDocument();
    expect(within(first).getByText("Publicado")).toBeInTheDocument();
    expect(within(first).getByLabelText("Número")).toHaveValue(1);
    expect(within(first).getByLabelText("Título")).toHaveValue("STANDARD A");

    expect(within(second).getByText("02")).toBeInTheDocument();
    expect(within(second).getByText("Borrador")).toBeInTheDocument();
    expect(within(third).getByText("03")).toBeInTheDocument();
    for (const card of [first, second, third]) {
      expect(within(card).getByRole("button", { name: "Guardar" })).toHaveClass("border-line-strong");
    }
  });

  it("el número es el que eligió dirección, tal cual: un hueco se queda y el orden manda sobre él", async () => {
    mocks.listStandardsForAdmin.mockResolvedValue([
      standard({ id: ID_1, number: 12, title: "STANDARD A" }),
      standard({ id: ID_2, number: 5, title: "STANDARD B" }),
    ]);

    render(await AdminStandardsPage(PARAMS));

    const [first, second] = cards();
    expect(within(first).getByText("12")).toBeInTheDocument();
    expect(within(second).getByText("05")).toBeInTheDocument();
  });

  it("cada card lleva sus controles: el primero no sube, el último no baja y el estado manda", async () => {
    render(await AdminStandardsPage(PARAMS));

    const [first, second, third] = cards();
    expect(within(first).getByRole("button", { name: "Subir STANDARD A" })).toBeDisabled();
    expect(within(first).getByRole("button", { name: "Bajar STANDARD A" })).toBeEnabled();
    expect(within(first).getByRole("button", { name: "Pasar a borrador STANDARD A" })).toBeEnabled();

    expect(within(second).getByRole("button", { name: "Publicar STANDARD B" })).toBeEnabled();

    expect(within(third).getByRole("button", { name: "Bajar STANDARD C" })).toBeDisabled();
    expect(within(third).getByRole("button", { name: "Subir STANDARD C" })).toBeEnabled();
  });

  it("una lista de un solo Standard no se puede mover", async () => {
    mocks.listStandardsForAdmin.mockResolvedValue([standard({ id: ID_1, title: "ÚNICO" })]);

    render(await AdminStandardsPage(PARAMS));

    expect(screen.getByRole("button", { name: "Subir ÚNICO" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar ÚNICO" })).toBeDisabled();
  });

  it("después de las cards, el alta con el único botón principal, que propone el máximo más uno", async () => {
    render(await AdminStandardsPage(PARAMS));

    const form = screen.getByRole("form", { name: "Nuevo Standard" });
    const create = within(form).getByRole("button", { name: "Crear Standard" });
    const lastCard = cards()[cards().length - 1];
    expect(lastCard.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(form).getByLabelText("Número")).toHaveValue(4);

    const primaries = screen
      .getAllByRole("button")
      .filter((button) => button.classList.contains("bg-brand-accent"));
    expect(primaries).toEqual([create]);
  });

  it("el número propuesto es el mayor de la lista más uno, esté donde esté, y cuenta los borradores", async () => {
    mocks.listStandardsForAdmin.mockResolvedValue([
      standard({ id: ID_1, number: 2, title: "A", status: "published" }),
      standard({ id: ID_2, number: 9, title: "B", status: "draft" }),
      standard({ id: ID_3, number: 4, title: "C", status: "published" }),
    ]);

    render(await AdminStandardsPage(PARAMS));

    expect(within(screen.getByRole("form", { name: "Nuevo Standard" })).getByLabelText("Número")).toHaveValue(10);
  });

  it("sin Standards: el aviso con su salida, sin cards, y el alta propone el 1", async () => {
    mocks.listStandardsForAdmin.mockResolvedValue([]);

    render(await AdminStandardsPage(PARAMS));

    expect(screen.getByText("Aún no hay Standards")).toBeInTheDocument();
    expect(screen.getByText("Crea el primer Standard de tu club.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Crear Standard" })).toBeInTheDocument();
    expect(screen.getByLabelText("Número")).toHaveValue(1);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("con Standards no sale el aviso de lista vacía", async () => {
    render(await AdminStandardsPage(PARAMS));

    expect(screen.queryByText("Aún no hay Standards")).not.toBeInTheDocument();
  });

  it("un título muy largo no desborda la card", async () => {
    mocks.listStandardsForAdmin.mockResolvedValue([standard({ title: "X".repeat(80) })]);

    render(await AdminStandardsPage(PARAMS));

    expect(screen.getByRole("heading", { level: 2, name: "X".repeat(80) })).toHaveClass(
      "wrap-break-word",
    );
  });
});
