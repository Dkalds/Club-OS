import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GamePrinciple } from "@/modules/methodology/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), listPrinciplesForAdmin: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/consents/queries", () => ({
  getConsentStatus: async () => ({ needsTerms: false, pendingGuardianships: [] }),
}));
vi.mock("@/modules/methodology/admin-queries", () => ({
  listPrinciplesForAdmin: mocks.listPrinciplesForAdmin,
}));
// Los formularios llaman a estas acciones; aquí solo se pintan.
vi.mock("@/modules/methodology/actions", () => ({
  createPrinciple: vi.fn(),
  savePrinciple: vi.fn(),
  moveMethodologyItem: vi.fn(),
  setMethodologyStatus: vi.fn(),
}));
// Como los de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import AdminPrinciplesPage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
// Cada página de Gestión pide el contexto y la comprobación de dirección ella misma: un
// layout no protege a sus páginas. Aquí se comprueba eso, y qué pinta la lista de principios.
const PARAMS = { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve({}) };
const ID_1 = "00000000-0000-4000-8000-000000000001";
const ID_2 = "00000000-0000-4000-8000-000000000002";
const ID_3 = "00000000-0000-4000-8000-000000000003";

function principle(overrides: Partial<GamePrinciple> = {}, texts: string[] = []): GamePrinciple {
  return {
    id: ID_1,
    slug: "un-principio",
    title: "Principio A",
    summary: null,
    status: "published",
    points: texts.map((text, index) => ({ id: `${overrides.id ?? ID_1}-p${index}`, text })),
    ...overrides,
  };
}

const PRINCIPLES: GamePrinciple[] = [
  principle({ id: ID_1, title: "Principio A", summary: "Su resumen.", status: "published" }, ["Uno", "Dos"]),
  principle({ id: ID_2, title: "Principio B", status: "draft" }),
  principle({ id: ID_3, title: "Principio C", status: "published" }, ["Tres"]),
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("admin"));
  mocks.listPrinciplesForAdmin.mockResolvedValue(PRINCIPLES);
});

/** Las cards de la lista: los `<li>` que llevan un encabezado (los puntos también son `<li>`). */
function cards() {
  return screen
    .getAllByRole("listitem")
    .filter((item) => within(item).queryByRole("heading", { level: 2 }) !== null);
}

describe("/admin/principles", () => {
  it("un entrenador recibe el 404 y no se lee ningún principio", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach"));

    await expect(AdminPrinciplesPage(PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.listPrinciplesForAdmin).not.toHaveBeenCalled();
  });

  it("sin club recibe el mismo 404 y no se lee ningún principio", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(AdminPrinciplesPage(PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.listPrinciplesForAdmin).not.toHaveBeenCalled();
  });

  it("lee los principios del club de quien administra", async () => {
    render(await AdminPrinciplesPage(PARAMS));

    expect(mocks.listPrinciplesForAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.listPrinciplesForAdmin.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
  });

  it("«Principios» es el único <h1> y avisa de que los entrenadores solo ven lo publicado", async () => {
    render(await AdminPrinciplesPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Principios" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Los entrenadores solo ven lo publicado.")).toBeInTheDocument();
  });

  it("una card por principio, en su orden, con su título, su estado y su editor", async () => {
    render(await AdminPrinciplesPage(PARAMS));

    const [first, second, third] = cards();
    expect(cards()).toHaveLength(3);
    expect(within(first).getByRole("heading", { level: 2, name: "Principio A" })).toBeInTheDocument();
    expect(within(first).getByText("Publicado")).toBeInTheDocument();
    expect(within(first).getByLabelText("Título")).toHaveValue("Principio A");
    expect(within(first).getByLabelText("Resumen (opcional)")).toHaveValue("Su resumen.");

    expect(within(second).getByRole("heading", { level: 2, name: "Principio B" })).toBeInTheDocument();
    expect(within(second).getByText("Borrador")).toBeInTheDocument();
    expect(within(second).getByLabelText("Resumen (opcional)")).toHaveValue("");

    expect(within(third).getByRole("heading", { level: 2, name: "Principio C" })).toBeInTheDocument();
    for (const card of [first, second, third]) {
      expect(within(card).getByRole("button", { name: "Guardar" })).toHaveClass("border-line-strong");
    }
  });

  it("cada card trae sus puntos, en su orden, y «Añadir punto»", async () => {
    render(await AdminPrinciplesPage(PARAMS));

    const [first, second, third] = cards();
    expect(
      (within(first).getAllByLabelText(/^Punto \d+$/) as HTMLInputElement[]).map((input) => input.value),
    ).toEqual(["Uno", "Dos"]);
    expect(within(second).queryAllByLabelText(/^Punto \d+$/)).toHaveLength(0);
    expect(
      (within(third).getAllByLabelText(/^Punto \d+$/) as HTMLInputElement[]).map((input) => input.value),
    ).toEqual(["Tres"]);
    for (const card of [first, second, third]) {
      expect(within(card).getByRole("group", { name: "Puntos" })).toBeInTheDocument();
      expect(within(card).getByRole("button", { name: "Añadir punto" })).toBeInTheDocument();
    }
  });

  it("cada card lleva sus controles: el primero no sube, el último no baja y el estado manda", async () => {
    render(await AdminPrinciplesPage(PARAMS));

    const [first, second, third] = cards();
    expect(within(first).getByRole("button", { name: "Subir Principio A" })).toBeDisabled();
    expect(within(first).getByRole("button", { name: "Bajar Principio A" })).toBeEnabled();
    expect(within(first).getByRole("button", { name: "Pasar a borrador Principio A" })).toBeEnabled();

    expect(within(second).getByRole("button", { name: "Subir Principio B" })).toBeEnabled();
    expect(within(second).getByRole("button", { name: "Publicar Principio B" })).toBeEnabled();

    expect(within(third).getByRole("button", { name: "Bajar Principio C" })).toBeDisabled();
    expect(within(third).getByRole("button", { name: "Subir Principio C" })).toBeEnabled();
  });

  it("una lista de un solo principio no se puede mover", async () => {
    mocks.listPrinciplesForAdmin.mockResolvedValue([principle({ id: ID_1, title: "Único" })]);

    render(await AdminPrinciplesPage(PARAMS));

    expect(screen.getByRole("button", { name: "Subir Único" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar Único" })).toBeDisabled();
  });

  it("un principio con 12 puntos no ofrece otro", async () => {
    mocks.listPrinciplesForAdmin.mockResolvedValue([
      principle({ id: ID_1, title: "Lleno" }, Array.from({ length: 12 }, (_, index) => `P${index}`)),
    ]);

    render(await AdminPrinciplesPage(PARAMS));

    expect(screen.getAllByLabelText(/^Punto \d+$/)).toHaveLength(12);
    expect(screen.queryByRole("button", { name: "Añadir punto" })).not.toBeInTheDocument();
  });

  it("después de las cards, el alta con el único botón principal de la página", async () => {
    render(await AdminPrinciplesPage(PARAMS));

    const form = screen.getByRole("form", { name: "Nuevo principio" });
    const create = within(form).getByRole("button", { name: "Crear principio" });
    const lastCard = cards()[cards().length - 1];
    expect(lastCard.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // El alta solo pide título y resumen.
    expect(within(form).getByLabelText("Título")).toBeInTheDocument();
    expect(within(form).getByLabelText("Resumen (opcional)")).toBeInTheDocument();
    expect(within(form).queryByRole("group", { name: "Puntos" })).not.toBeInTheDocument();

    const primaries = screen
      .getAllByRole("button")
      .filter((button) => button.classList.contains("bg-brand-accent"));
    expect(primaries).toEqual([create]);
  });

  it("sin principios: el aviso con su salida, sin cards, y el alta sigue ahí", async () => {
    mocks.listPrinciplesForAdmin.mockResolvedValue([]);

    render(await AdminPrinciplesPage(PARAMS));

    expect(screen.getByText("Aún no hay principios")).toBeInTheDocument();
    expect(screen.getByText("Crea el primer principio de juego de tu club.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Crear principio" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("con principios no sale el aviso de lista vacía", async () => {
    render(await AdminPrinciplesPage(PARAMS));

    expect(screen.queryByText("Aún no hay principios")).not.toBeInTheDocument();
  });
});
