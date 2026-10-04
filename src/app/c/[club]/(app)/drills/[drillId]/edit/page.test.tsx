import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DrillDetail, DrillStatus } from "@/modules/drills/types";
import type { Standard } from "@/modules/methodology/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  getDrill: vi.fn(),
  getDrillFormOptions: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/drills/queries", () => ({
  getDrill: mocks.getDrill,
  getDrillFormOptions: mocks.getDrillFormOptions,
}));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
// El formulario es de cliente y tiene su propio test: aquí solo importa qué recibe.
vi.mock("../../drill-form", () => ({
  DrillForm: (props: unknown) => <div data-testid="drill-form" data-props={JSON.stringify(props)} />,
}));

import EditDrillPage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const DRILL_ID = "00000000-0000-4000-8000-0000000000d1";
const OPTIONS = {
  focusAreas: [{ id: "f-1", slug: "uno", name: "Uno" }],
  principles: [],
  standards: [{ id: "s-1", number: 1, title: "UNO", description: "El primero." }] satisfies Standard[],
};

function props(drillId = DRILL_ID) {
  return { params: Promise.resolve({ club: "club-a", drillId }), searchParams: Promise.resolve({}) };
}

function drill(overrides: Partial<DrillDetail> = {}): DrillDetail {
  return {
    id: DRILL_ID,
    title: "Un ejercicio",
    status: "draft",
    createdBy: null,
    minAge: 12,
    maxAge: null,
    minPlayers: 6,
    maxPlayers: 12,
    minMinutes: 10,
    maxMinutes: 15,
    focus: [],
    summary: null,
    objective: null,
    setupMd: null,
    equipment: [],
    videoUrl: null,
    diagramMediaId: null,
    diagramUrl: null,
    coachingPoints: [],
    variants: [],
    focusAreaIds: [],
    principleIds: [],
    standardIds: [],
    principles: [],
    principlesSectionSlug: null,
    standards: [],
    createdByMe: true,
    updatedAt: "2026-10-03T10:00:00.123456+00:00",
    ...overrides,
  };
}

async function renderPage(drillId = DRILL_ID) {
  return render(await EditDrillPage(props(drillId)));
}

/** Lo que la página le pasó al formulario. */
function formProps() {
  return JSON.parse(screen.getByTestId("drill-form").getAttribute("data-props") ?? "{}");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getDrill.mockResolvedValue(drill());
  mocks.getDrillFormOptions.mockResolvedValue(OPTIONS);
});

describe("quién entra", () => {
  it("sin club recibe el 404 y no lee nada", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(EditDrillPage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getDrill).not.toHaveBeenCalled();
    expect(mocks.getDrillFormOptions).not.toHaveBeenCalled();
  });

  it("pide el ejercicio con el contexto del club y el id de la URL", async () => {
    await renderPage();

    expect(mocks.getDrill).toHaveBeenCalledTimes(1);
    expect(mocks.getDrill).toHaveBeenCalledWith(clubContext("coach"), DRILL_ID);
  });

  it("si el ejercicio no llega (no existe, es de otro club o no se puede ver) es el 404 de siempre", async () => {
    mocks.getDrill.mockResolvedValue(null);

    await expect(EditDrillPage(props())).rejects.toThrow("NOT_FOUND");
    expect(mocks.getDrillFormOptions).not.toHaveBeenCalled();
  });

  it("un id que no es un uuid acaba igual: lo resuelve `getDrill`, que devuelve null", async () => {
    mocks.getDrill.mockResolvedValue(null);

    await expect(EditDrillPage(props("no-soy-un-uuid"))).rejects.toThrow("NOT_FOUND");
    expect(mocks.getDrill).toHaveBeenCalledWith(expect.anything(), "no-soy-un-uuid");
  });

  it.each([
    ["admin", "draft", false, true],
    ["admin", "published", false, true],
    ["admin", "archived", false, true],
    ["coach", "draft", true, true],
    ["coach", "draft", false, false],
    ["coach", "published", true, false],
    ["coach", "archived", true, false],
    ["player", "published", false, false],
    ["guardian", "published", false, false],
  ] as const)(
    "%s, ejercicio %s, suyo: %s → ve el formulario: %s (si no, el mismo 404 y no lee lo que se elige)",
    async (role, status: DrillStatus, createdByMe, allowed) => {
      mocks.getClubContext.mockResolvedValue(clubContext(role));
      mocks.getDrill.mockResolvedValue(drill({ status, createdByMe }));

      if (allowed) {
        await renderPage();
        expect(screen.getByTestId("drill-form")).toBeInTheDocument();
      } else {
        await expect(EditDrillPage(props())).rejects.toThrow("NOT_FOUND");
        expect(mocks.getDrillFormOptions).not.toHaveBeenCalled();
      }
    },
  );

  it("un fallo de lectura sube hasta error.tsx, no se traga", async () => {
    mocks.getDrill.mockRejectedValue(new Error("drills.detail: boom"));

    await expect(EditDrillPage(props())).rejects.toThrow("drills.detail: boom");
  });
});

describe("la pantalla", () => {
  it("monta el formulario de edición con el ejercicio tal cual y las opciones del club", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin", { standards: "Nuestros Standards" }));

    await renderPage();

    expect(formProps()).toEqual({
      clubSlug: "club-a",
      mode: "edit",
      drill: drill(),
      options: OPTIONS,
      standardsLabel: "Nuestros Standards",
    });
    expect(mocks.getDrillFormOptions).toHaveBeenCalledWith(clubContext("admin", { standards: "Nuestros Standards" }));
  });

  it("la cabecera es la de detalle «Editar ejercicio», lo primero del contenido, y vuelve a la ficha", async () => {
    const { container } = await renderPage();

    const header = container.firstElementChild as HTMLElement;
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(within(header).getByText("Editar ejercicio")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Volver" })).toHaveAttribute(
      "href",
      `/c/club-a/drills/${DRILL_ID}`,
    );
  });

  it("tiene un único <h1>, solo para lectores de pantalla: la cabecera ya dice dónde se está", async () => {
    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Editar ejercicio");
    expect(headings[0]).toHaveClass("sr-only");
  });
});
