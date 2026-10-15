import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "@/modules/board/types";
import type { DrillDetail, DrillStatus } from "@/modules/drills/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  getDrill: vi.fn(),
  /** Cuántas veces se ha montado el editor desde cero. */
  mounts: { count: 0 },
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/drills/queries", () => ({ getDrill: mocks.getDrill }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
// El editor es de cliente y tiene su propio test: aquí solo importa qué recibe, y si al cambiar
// de ejercicio se monta de nuevo (su estado es el de la pizarra que se está dibujando).
vi.mock("./_components/board-editor", async () => {
  const { useState } = await import("react");
  return {
    BoardEditor: (props: unknown) => {
      const [mount] = useState(() => (mocks.mounts.count += 1));
      return <div data-testid="board-editor" data-mount={mount} data-props={JSON.stringify(props)} />;
    },
  };
});

import DrillBoardPage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const DRILL_ID = "00000000-0000-4000-8000-0000000000d1";
const OTHER_ID = "00000000-0000-4000-8000-0000000000d2";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos y desfase. */
const LOADED = "2026-10-03T10:00:00.123456+00:00";

const BOARD: Board = {
  version: 1,
  court: "half",
  tokens: [
    { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
    { id: "b1", kind: "ball", at: { x: 53, y: 80 } },
  ],
  steps: [{ note: "El 1 ataca el aro", moves: [{ token: "a1", kind: "dribble", to: { x: 50, y: 30 } }] }],
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
    updatedAt: LOADED,
    ...overrides,
  };
}

async function renderPage(drillId = DRILL_ID) {
  return render(await DrillBoardPage(props(drillId)));
}

/** Lo que la página le pasó al editor. */
function editorProps() {
  return JSON.parse(screen.getByTestId("board-editor").getAttribute("data-props") ?? "{}");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.mounts.count = 0;
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getDrill.mockResolvedValue(drill());
});

describe("quién entra", () => {
  it("sin club recibe el 404 y no lee nada", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(DrillBoardPage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getDrill).not.toHaveBeenCalled();
  });

  it("pide el ejercicio con el contexto del club y el id de la URL", async () => {
    await renderPage();

    expect(mocks.getDrill).toHaveBeenCalledTimes(1);
    expect(mocks.getDrill).toHaveBeenCalledWith(clubContext("coach"), DRILL_ID);
  });

  it("si el ejercicio no llega (no existe, es de otro club o no se puede ver) es el 404 de siempre", async () => {
    mocks.getDrill.mockResolvedValue(null);

    await expect(DrillBoardPage(props())).rejects.toThrow("NOT_FOUND");
  });

  it("un id que no es un uuid acaba igual: lo resuelve `getDrill`, que devuelve null", async () => {
    mocks.getDrill.mockResolvedValue(null);

    await expect(DrillBoardPage(props("no-soy-un-uuid"))).rejects.toThrow("NOT_FOUND");
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
    "%s, ejercicio %s, suyo: %s → ve el editor: %s (si no, el mismo 404)",
    async (role, status: DrillStatus, createdByMe, allowed) => {
      mocks.getClubContext.mockResolvedValue(clubContext(role));
      mocks.getDrill.mockResolvedValue(drill({ status, createdByMe, board: BOARD }));

      if (allowed) {
        await renderPage();
        expect(screen.getByTestId("board-editor")).toBeInTheDocument();
      } else {
        await expect(DrillBoardPage(props())).rejects.toThrow("NOT_FOUND");
      }
    },
  );

  it("el 404 de quien no puede editarlo es el mismo que el de un ejercicio que no existe", async () => {
    mocks.getDrill.mockResolvedValue(null);
    const missing = await DrillBoardPage(props()).catch((error: unknown) => error);

    mocks.getDrill.mockResolvedValue(drill({ status: "published", createdByMe: true, board: BOARD }));
    const forbidden = await DrillBoardPage(props()).catch((error: unknown) => error);

    expect(forbidden).toEqual(missing);
  });

  it("un fallo de lectura sube hasta error.tsx, no se traga", async () => {
    mocks.getDrill.mockRejectedValue(new Error("drills.detail: boom"));

    await expect(DrillBoardPage(props())).rejects.toThrow("drills.detail: boom");
  });
});

describe("lo que recibe el editor", () => {
  it("el club, el ejercicio, su título, su pizarra y la copia con la que guardará", async () => {
    mocks.getDrill.mockResolvedValue(drill({ board: BOARD }));

    await renderPage();

    expect(editorProps()).toEqual({
      clubSlug: "club-a",
      drillId: DRILL_ID,
      title: "Un ejercicio",
      initialBoard: BOARD,
      expectedUpdatedAt: LOADED,
    });
  });

  it("sin pizarra recibe `null`, no la clave ausente: el editor empieza de cero", async () => {
    await renderPage();

    const received = editorProps();
    expect(received).toHaveProperty("initialBoard", null);
    expect(received).toEqual({
      clubSlug: "club-a",
      drillId: DRILL_ID,
      title: "Un ejercicio",
      initialBoard: null,
      expectedUpdatedAt: LOADED,
    });
  });

  it("la copia viaja tal cual, con sus microsegundos y su desfase: no pasa por Date", async () => {
    mocks.getDrill.mockResolvedValue(drill({ updatedAt: "2026-10-03T12:00:00.000001+02:00" }));

    await renderPage();

    expect(editorProps().expectedUpdatedAt).toBe("2026-10-03T12:00:00.000001+02:00");
  });

  it("el slug es el del club de la sesión y el id el del ejercicio leído, no los de la URL", async () => {
    mocks.getDrill.mockResolvedValue(drill({ id: OTHER_ID }));

    await renderPage(DRILL_ID);

    expect(editorProps()).toMatchObject({ clubSlug: clubContext("coach").org.slug, drillId: OTHER_ID });
  });

  it("no le pasa nada más del ejercicio: ni su estado ni sus textos", async () => {
    mocks.getDrill.mockResolvedValue(drill({ objective: "Un objetivo", summary: "Un resumen", board: BOARD }));

    await renderPage();

    expect(Object.keys(editorProps()).sort()).toEqual(
      ["clubSlug", "drillId", "expectedUpdatedAt", "initialBoard", "title"].sort(),
    );
  });

  it("lleva el ejercicio como clave: pasar de uno a otro monta el editor de cero", async () => {
    const view = await renderPage();
    expect(screen.getByTestId("board-editor")).toHaveAttribute("data-mount", "1");

    // La misma página con el mismo ejercicio (un repintado tras revalidar) conserva el editor.
    view.rerender(await DrillBoardPage(props()));
    expect(screen.getByTestId("board-editor")).toHaveAttribute("data-mount", "1");

    mocks.getDrill.mockResolvedValue(drill({ id: OTHER_ID, title: "Otro ejercicio" }));
    view.rerender(await DrillBoardPage(props(OTHER_ID)));

    expect(screen.getByTestId("board-editor")).toHaveAttribute("data-mount", "2");
    expect(editorProps()).toMatchObject({ drillId: OTHER_ID, title: "Otro ejercicio" });
  });
});

describe("la pantalla", () => {
  it("la cabecera es la de detalle «Pizarra», lo primero del contenido, y vuelve a la ficha", async () => {
    const { container } = await renderPage();

    const header = container.firstElementChild as HTMLElement;
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(within(header).getByText("Pizarra")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Volver" })).toHaveAttribute(
      "href",
      `/c/club-a/drills/${DRILL_ID}`,
    );
  });

  it("la cabecera no lleva ninguna acción: solo la vuelta", async () => {
    const { container } = await renderPage();

    const header = container.firstElementChild as HTMLElement;
    expect(within(header).getAllByRole("link")).toHaveLength(1);
    expect(within(header).queryByRole("button")).not.toBeInTheDocument();
  });

  it("tiene un único <h1>, solo para lectores de pantalla, con el nombre del ejercicio", async () => {
    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Pizarra de Un ejercicio");
    expect(headings[0]).toHaveClass("sr-only");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("el título del ejercicio se ve encima del editor, sin partir la pantalla si es largo", async () => {
    await renderPage();

    const title = screen.getByText("Un ejercicio", { selector: "p" });
    expect(title).toHaveClass("wrap-break-word");
    expect(title.compareDocumentPosition(screen.getByTestId("board-editor"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("no pone su propio <main>: va dentro del marco del club", async () => {
    const { container } = await renderPage();

    expect(container.querySelector("main")).toBeNull();
  });
});
