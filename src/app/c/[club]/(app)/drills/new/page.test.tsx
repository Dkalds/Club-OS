import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusArea } from "@/modules/drills/types";
import type { GamePrinciple, Standard } from "@/modules/methodology/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), getDrillFormOptions: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/drills/queries", () => ({ getDrillFormOptions: mocks.getDrillFormOptions }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
// El formulario es de cliente y tiene su propio test: aquí solo importa qué recibe.
vi.mock("../drill-form", () => ({
  DrillForm: (props: unknown) => <div data-testid="drill-form" data-props={JSON.stringify(props)} />,
}));

import NewDrillPage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const FOCUS_AREAS: FocusArea[] = [{ id: "f-1", slug: "uno", name: "Uno" }];
const PRINCIPLES: GamePrinciple[] = [
  { id: "p-1", slug: "uno", title: "Uno", summary: null, status: "published", points: [] },
];
const STANDARDS: Standard[] = [{ id: "s-1", number: 1, title: "UNO", description: "El primero." }];
const OPTIONS = { focusAreas: FOCUS_AREAS, principles: PRINCIPLES, standards: STANDARDS };

function props() {
  return { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve({}) };
}

async function renderPage() {
  return render(await NewDrillPage(props()));
}

/** Lo que la página le pasó al formulario. */
function formProps() {
  return JSON.parse(screen.getByTestId("drill-form").getAttribute("data-props") ?? "{}");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getDrillFormOptions.mockResolvedValue(OPTIONS);
});

describe("quién entra", () => {
  it("sin club recibe el 404 y no lee nada", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(NewDrillPage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getDrillFormOptions).not.toHaveBeenCalled();
  });

  it.each(["admin", "coach"] as const)("%s puede crear ejercicios: ve el formulario", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));

    await renderPage();

    expect(screen.getByTestId("drill-form")).toBeInTheDocument();
  });

  it.each(["player", "guardian"] as const)("%s no puede: el mismo 404, y no se lee nada del club", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));

    await expect(NewDrillPage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getDrillFormOptions).not.toHaveBeenCalled();
  });

  it("un fallo de lectura de lo que se puede elegir sube hasta error.tsx, no se traga", async () => {
    mocks.getDrillFormOptions.mockRejectedValue(new Error("drills.focus-areas: boom"));

    await expect(NewDrillPage(props())).rejects.toThrow("drills.focus-areas: boom");
  });
});

describe("la pantalla", () => {
  it("lee lo que se puede elegir con el contexto del club", async () => {
    await renderPage();

    expect(mocks.getDrillFormOptions).toHaveBeenCalledTimes(1);
    expect(mocks.getDrillFormOptions).toHaveBeenCalledWith(clubContext("coach"));
  });

  it("monta el formulario de alta, sin ejercicio, con las opciones del club", async () => {
    await renderPage();

    expect(formProps()).toEqual({
      clubSlug: "club-a",
      mode: "new",
      drill: null,
      options: OPTIONS,
      standardsLabel: "Standards",
    });
  });

  it("los Standards llevan el nombre que el club les da", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin", { standards: "Nuestros Standards" }));

    await renderPage();

    expect(formProps().standardsLabel).toBe("Nuestros Standards");
  });

  it("la cabecera es la de detalle «Nuevo ejercicio», lo primero del contenido, y vuelve a la biblioteca", async () => {
    const { container } = await renderPage();

    const header = container.firstElementChild as HTMLElement;
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(within(header).getByText("Nuevo ejercicio")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-a/drills");
    expect(within(header).queryByRole("link", { name: /editar|nuevo/i })).not.toBeInTheDocument();
  });

  it("tiene un único <h1>, solo para lectores de pantalla: la cabecera ya dice dónde se está", async () => {
    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Nuevo ejercicio");
    expect(headings[0]).toHaveClass("sr-only");
  });
});
