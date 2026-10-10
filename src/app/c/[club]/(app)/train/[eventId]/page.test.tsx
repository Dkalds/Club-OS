import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeDetail, PracticeDetailItem } from "@/modules/practice/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), getPractice: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/practice/queries", () => ({ getPractice: mocks.getPractice }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
// Las acciones son de cliente y tienen su propio test: aquí solo importa qué reciben.
vi.mock("../_components/practice-actions", () => ({
  PracticeActions: (props: unknown) => <div data-testid="actions" data-props={JSON.stringify(props)} />,
}));

import PracticePage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
function item(n: number, phase: string | null, title: string, minutes: number): PracticeDetailItem {
  return { id: `i-${n}`, drillId: null, drillVisible: false, title, phase, minutes, notes: null, completed: null, actualMinutes: null };
}

// Activación · Técnica ×2 · (sin fase) · Técnica: cuatro bloques, el segundo con dos ítems.
const ITEMS = [
  item(1, "Activación", "Calentamiento", 10),
  item(2, "Técnica", "Bote en movimiento", 15),
  item(3, "Técnica", "Pase y corte", 10),
  item(4, null, "Tiro libre", 5),
  item(5, "Técnica", "Juego libre", 10),
];

function standard(number: number) {
  return { id: `s-${number}`, number, title: `Standard ${number}`, description: "Una descripción." };
}

function practice(overrides: Partial<PracticeDetail> = {}): PracticeDetail {
  return {
    eventId: "e-1",
    planId: "p-1",
    teamId: "t-1",
    teamName: "Equipo A",
    status: "scheduled",
    startsAt: "2026-10-06T16:00:00.000Z",
    endsAt: "2026-10-06T17:15:00.000Z",
    slotLabel: "Martes 6 oct · 18:00–19:15",
    location: "Pabellón 2",
    title: "Salida de presión",
    primaryFocus: { id: "f-1", name: "Rebote" },
    secondaryFocus: null,
    notes: null,
    items: ITEMS,
    standards: [],
    updatedAt: "2026-10-04T10:00:00.123456+00:00",
    canEdit: true,
    live: { started: false, position: null },
    actualMinutes: null,
    ...overrides,
  };
}

function props(eventId = "e-1") {
  return { params: Promise.resolve({ club: "club-a", eventId }), searchParams: Promise.resolve({}) };
}

async function renderPage(overrides: Partial<PracticeDetail> = {}) {
  mocks.getPractice.mockResolvedValue(practice(overrides));
  return render(await PracticePage(props()));
}

/** Lo que la página le pasó a las acciones. */
function actionsProps() {
  return JSON.parse(screen.getByTestId("actions").getAttribute("data-props") ?? "{}");
}

/** Los bloques de ejercicios: las listas de la pantalla que no son la de objetivos de la cabecera. */
function blockLists() {
  return screen.getAllByRole("list").filter((list) => list.getAttribute("aria-label") !== "Objetivos");
}

/** Las filas de ejercicios, de todos los bloques (no los objetivos de la cabecera). */
function itemRows() {
  return screen.queryAllByRole("listitem").filter((row) => !row.closest('[aria-label="Objetivos"]'));
}

/** Las secciones del contenido: cada una, con su `<h2>`. */
function section(name: string) {
  return screen.getByRole("heading", { level: 2, name }).parentElement?.parentElement as HTMLElement;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getPractice.mockResolvedValue(practice());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/train/[eventId], acceso y lectura", () => {
  it("sin club recibe el 404 y no lee ninguna sesión", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(PracticePage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getPractice).not.toHaveBeenCalled();
  });

  it("lee la sesión de la URL con el contexto del club", async () => {
    const ctx = clubContext("coach");
    mocks.getClubContext.mockResolvedValue(ctx);

    render(await PracticePage(props("e-9")));

    expect(mocks.getPractice).toHaveBeenCalledTimes(1);
    expect(mocks.getPractice).toHaveBeenCalledWith(ctx, "e-9");
  });

  it("una sesión que no existe, o que no se ve, es el mismo 404", async () => {
    mocks.getPractice.mockResolvedValue(null);

    await expect(PracticePage(props())).rejects.toThrow("NOT_FOUND");
  });

  it("si no se puede leer, lanza: lo recoge `error.tsx`", async () => {
    mocks.getPractice.mockRejectedValue(new Error("practice.detail: fallo"));

    await expect(PracticePage(props())).rejects.toThrow("practice.detail: fallo");
  });
});

describe("/train/[eventId], cabecera", () => {
  it("vuelve a Sesiones y el único <h1> es el título de la sesión", async () => {
    await renderPage();

    const back = screen.getByRole("link", { name: "Sesiones" });
    expect(back).toHaveAttribute("href", "/c/club-a/train");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const title = screen.getByRole("heading", { level: 1, name: "Salida de presión" });
    expect(back.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("enseña el equipo, la franja del club, los metadatos y el objetivo", async () => {
    await renderPage();

    expect(screen.getByText("Equipo A")).toBeInTheDocument();
    expect(screen.getByText("Martes 6 oct · 18:00–19:15")).toBeInTheDocument();
    // Los minutos son la suma de los ítems (50), no un dato guardado.
    expect(screen.getByText("50 min · 5 ejercicios · Pabellón 2")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Objetivos" })).getByText("Rebote")).toBeInTheDocument();
  });

  it("una sesión sin ejercicios dura su franja: de 18:00 a 19:15, 75 min", async () => {
    await renderPage({ items: [] });

    expect(screen.getByText("75 min · Sin ejercicios todavía · Pabellón 2")).toBeInTheDocument();
  });

  it("una sesión sin ejercicios de una hora dura 60 min, no 0", async () => {
    await renderPage({ items: [], startsAt: "2026-10-06T16:00:00.000Z", endsAt: "2026-10-06T17:00:00.000Z" });

    expect(screen.getByText("60 min · Sin ejercicios todavía · Pabellón 2")).toBeInTheDocument();
  });

  it("una sesión cancelada lo dice con su palabra", async () => {
    await renderPage({ status: "cancelled", canEdit: false });

    expect(screen.getByText("Cancelada")).toBeInTheDocument();
  });
});

describe("/train/[eventId], Standards", () => {
  it("sin Standards no hay sección", async () => {
    await renderPage({ standards: [] });

    expect(screen.queryByRole("heading", { level: 2, name: "Standards" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Standard/ })).not.toBeInTheDocument();
  });

  it("con Standards, la sección lleva el nombre que el club les da, o «Standards»", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach", { standards: "Estándares del club" }));
    const { unmount } = await renderPage({ standards: [standard(3)] });
    expect(screen.getByRole("heading", { level: 2, name: "Estándares del club" })).toBeInTheDocument();
    unmount();

    mocks.getClubContext.mockResolvedValue(clubContext("coach"));
    await renderPage({ standards: [standard(3)] });
    expect(screen.getByRole("heading", { level: 2, name: "Standards" })).toBeInTheDocument();
  });

  it("cada uno es un enlace a su Standard en The Way, con el número de dos cifras", async () => {
    await renderPage({ standards: [standard(2), standard(11)] });

    const standards = within(section("Standards"));
    // Lista de verdad también en Safari, que sin viñetas deja de anunciarla como tal.
    expect(standards.getByRole("list")).toHaveAttribute("role", "list");
    expect(standards.getByRole("link", { name: "02 Standard 2" })).toHaveAttribute(
      "href",
      "/c/club-a/way/standards#standard-02",
    );
    expect(standards.getByRole("link", { name: "11 Standard 11" })).toHaveAttribute(
      "href",
      "/c/club-a/way/standards#standard-11",
    );
    expect(standards.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it("hasta tres sin más; con más, tres y «+N» con lo que sobra", async () => {
    const { unmount } = await renderPage({ standards: [1, 2, 3].map(standard) });
    expect(within(section("Standards")).getAllByRole("link")).toHaveLength(3);
    expect(within(section("Standards")).queryByText(/^\+\d/)).not.toBeInTheDocument();
    unmount();

    await renderPage({ standards: [1, 2, 3, 4, 5].map(standard) });
    const standards = within(section("Standards"));
    expect(standards.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/c/club-a/way/standards#standard-01",
      "/c/club-a/way/standards#standard-02",
      "/c/club-a/way/standards#standard-03",
    ]);
    expect(standards.getByText("+2")).toBeInTheDocument();
  });
});

describe("/train/[eventId], notas", () => {
  it("con notas, una sección «Notas» con el texto", async () => {
    await renderPage({ notes: "Llevar los petos azules." });

    expect(within(section("Notas")).getByText("Llevar los petos azules.")).toBeInTheDocument();
  });

  it.each([null, "", "   "])("sin notas (%j) no hay sección", async (notes) => {
    await renderPage({ notes });

    expect(screen.queryByRole("heading", { name: "Notas" })).not.toBeInTheDocument();
  });
});

describe("/train/[eventId], ejercicios", () => {
  it("los agrupa en bloques de fase seguida, con la fase y sus minutos de cabecera", async () => {
    await renderPage();

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Activación", "Técnica", "Sin fase", "Técnica"]);

    expect(blockLists()).toHaveLength(4);
    // Cada bloque suma lo suyo, y «Sin fase» es el de los ítems sin fase.
    const minutesOf = (heading: HTMLElement) => heading.parentElement?.textContent;
    const headingEls = screen.getAllByRole("heading", { level: 2 });
    expect(minutesOf(headingEls[0])).toBe("Activación10 min");
    expect(minutesOf(headingEls[1])).toBe("Técnica25 min");
    expect(minutesOf(headingEls[2])).toBe("Sin fase5 min");
    expect(minutesOf(headingEls[3])).toBe("Técnica10 min");
  });

  it("cada bloque es una lista con sus ítems, numerados a lo largo de toda la sesión", async () => {
    await renderPage();

    expect(itemRows().map((row) => row.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      expect.stringMatching(/^01\s*Calentamiento/),
      expect.stringMatching(/^02\s*Bote en movimiento/),
      expect.stringMatching(/^03\s*Pase y corte/),
      expect.stringMatching(/^04\s*Tiro libre/),
      expect.stringMatching(/^05\s*Juego libre/),
    ]);
    // El segundo bloque lleva dos filas, y sigue la cuenta del primero.
    const second = within(screen.getAllByRole("heading", { level: 2 })[1].parentElement?.parentElement as HTMLElement);
    expect(second.getAllByRole("listitem")).toHaveLength(2);
  });

  it("las filas dicen sus minutos y no repiten la fase que ya dice su bloque", async () => {
    await renderPage();

    const rows = itemRows();
    expect(rows[0]).toHaveTextContent("10 minutos");
    expect(rows[1]).toHaveTextContent("15 minutos");
    // «Activación» está una sola vez: en la cabecera del bloque.
    expect(screen.getAllByText("Activación")).toHaveLength(1);
    expect(screen.getAllByText("Técnica")).toHaveLength(2);
  });

  it("los bloques libres son texto: no llevan a ninguna pantalla", async () => {
    await renderPage();

    expect(itemRows()).toHaveLength(5);
    for (const row of itemRows()) {
      expect(within(row).queryByRole("link")).not.toBeInTheDocument();
    }
  });

  describe("ejercicios de la biblioteca", () => {
    const DRILL = "00000000-0000-4000-8000-0000000000d1";
    const HIDDEN = "00000000-0000-4000-8000-0000000000d2";

    /** Un bloque libre, un ejercicio que se ve y uno que no (el borrador de otro entrenador). */
    function mixed(): PracticeDetailItem[] {
      return [
        item(1, "Técnica", "Bloque libre", 10),
        { ...item(2, "Técnica", "Rebote y salida", 15), drillId: DRILL, drillVisible: true },
        { ...item(3, "Técnica", "Borrador ajeno", 10), drillId: HIDDEN, drillVisible: false },
      ];
    }

    it("el ítem con un ejercicio que se ve enlaza a su ficha, en esta misma app", async () => {
      await renderPage({ items: mixed() });

      const link = within(itemRows()[1]).getByRole("link");
      expect(link).toHaveAttribute("href", `/c/club-a/drills/${DRILL}`);
      expect(link).toHaveTextContent("Rebote y salida");
      expect(link).toHaveTextContent("15 minutos");
    });

    it("el bloque libre y el ejercicio que no se ve se quedan en texto: no llevarían a ninguna ficha", async () => {
      await renderPage({ items: mixed() });

      expect(within(itemRows()[0]).queryByRole("link")).not.toBeInTheDocument();
      expect(within(itemRows()[2]).queryByRole("link")).not.toBeInTheDocument();
      expect(itemRows()[2]).toHaveTextContent("Borrador ajeno");
    });

    it("la URL lleva el id del ejercicio, nunca su nombre", async () => {
      await renderPage({ items: mixed() });

      const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
      expect(hrefs.filter((href) => href?.includes("/drills/"))).toEqual([`/c/club-a/drills/${DRILL}`]);
    });
  });

  it("acaba con el total, la suma de los minutos de los ítems", async () => {
    await renderPage();

    const total = screen.getByText("Total").parentElement as HTMLElement;
    expect(within(total).getByText("50'")).toBeInTheDocument();
    expect(total).toHaveTextContent("50 minutos");
  });

  it("la cabecera de la sesión va antes que los bloques, y el total después de todos", async () => {
    await renderPage();

    const title = screen.getByRole("heading", { level: 1 });
    const firstBlock = screen.getAllByRole("heading", { level: 2 })[0];
    const total = screen.getByText("Total");
    expect(title.compareDocumentPosition(firstBlock)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(itemRows().at(-1)?.compareDocumentPosition(total)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  describe("sin ejercicios", () => {
    it("una sesión que se puede editar lo dice, sin acción propia: el «Editar sesión» es el de las acciones", async () => {
      await renderPage({ items: [], canEdit: true });

      expect(
        screen.getByRole("heading", { level: 2, name: "Esta sesión aún no tiene ejercicios" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Añade ejercicios para prepararla.")).toBeInTheDocument();
      // Una pantalla, un solo «Editar sesión» (el primary de `PracticeActions`): el aviso no
      // lleva otro, ni ningún otro enlace ni botón.
      const empty = screen.getByText("Añade ejercicios para prepararla.").closest("div") as HTMLElement;
      expect(within(empty).queryByRole("link")).not.toBeInTheDocument();
      expect(within(empty).queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Editar sesión" })).not.toBeInTheDocument();
      expect(actionsProps()).toMatchObject({ eventId: "e-1", canEdit: true });
      expect(screen.queryByText("Total")).not.toBeInTheDocument();
      expect(itemRows()).toHaveLength(0);
    });

    it("una sesión cerrada dice «Sesión sin ejercicios», que no se añadieron, y ofrece volver a Sesiones", async () => {
      await renderPage({ items: [], canEdit: false, status: "done" });

      expect(screen.getByRole("heading", { level: 2, name: "Sesión sin ejercicios" })).toBeInTheDocument();
      expect(screen.getByText("No se añadieron ejercicios a esta sesión.")).toBeInTheDocument();
      expect(screen.queryByText("Añade ejercicios para prepararla.")).not.toBeInTheDocument();
      expect(screen.queryByText("Esta sesión aún no tiene ejercicios")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Volver a Sesiones" })).toHaveAttribute("href", "/c/club-a/train");
      expect(screen.queryByRole("link", { name: "Editar sesión" })).not.toBeInTheDocument();
    });

    it("sin permiso para editar, igual: no se ofrece editar y no se pintan las acciones", async () => {
      mocks.getClubContext.mockResolvedValue(clubContext("player"));

      await renderPage({ items: [], canEdit: false });

      expect(screen.getByRole("heading", { level: 2, name: "Sesión sin ejercicios" })).toBeInTheDocument();
      expect(screen.getByText("No se añadieron ejercicios a esta sesión.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Volver a Sesiones" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Editar sesión" })).not.toBeInTheDocument();
      expect(screen.queryByTestId("actions")).not.toBeInTheDocument();
    });
  });
});

describe("/train/[eventId], acciones", () => {
  it("quien gestiona sesiones las ve, con la sesión, el club y si se puede editar", async () => {
    await renderPage();

    expect(actionsProps()).toMatchObject({ clubSlug: "club-a", eventId: "e-1", canEdit: true });
  });

  it("les pasa cuántos ejercicios tiene y lo que el servidor sabe del directo", async () => {
    await renderPage({ live: { started: true, position: 2 } });

    expect(actionsProps()).toMatchObject({ itemCount: 5, live: { started: true, position: 2 } });
  });

  it("una sesión cerrada llega a las acciones sin poder editarse, para que solo se duplique", async () => {
    await renderPage({ status: "done", canEdit: false });

    expect(actionsProps()).toMatchObject({ canEdit: false });
  });

  it.each(["player", "guardian"] as const)("un %s no las ve: no se pinta nada", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));

    await renderPage({ canEdit: false });

    expect(screen.queryByTestId("actions")).not.toBeInTheDocument();
  });

  it("la copia se propone la semana siguiente, a la misma hora del reloj del club", async () => {
    // Martes 6 oct, 18:00 en Madrid (CEST). Hoy es domingo 4.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T10:00:00.000Z"));

    await renderPage();

    expect(actionsProps().duplicateDefaults).toEqual({ date: "2026-10-13", time: "18:00" });
  });

  it("a través del cambio de hora, las 18:00 siguen siendo las 18:00 del club", async () => {
    // Martes 20 oct, 18:00 CEST; el domingo 25 se pasa a CET: el martes 27 son las 17:00 UTC.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-21T08:00:00.000Z"));

    await renderPage({ startsAt: "2026-10-20T16:00:00.000Z", endsAt: "2026-10-20T17:15:00.000Z" });

    expect(actionsProps().duplicateDefaults).toEqual({ date: "2026-10-27", time: "18:00" });
  });

  it("una sesión pasada propone la primera semana que aún no ha llegado, no la siguiente a ella", async () => {
    // La sesión fue el martes 6; hoy es el jueves 22: la próxima fecha libre con su día es el martes 27.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T10:00:00.000Z"));

    await renderPage({ status: "done", canEdit: false });

    expect(actionsProps().duplicateDefaults).toEqual({ date: "2026-10-27", time: "18:00" });
  });
});

describe("/train/[eventId], revisar una sesión hecha", () => {
  const DONE_ITEMS = [
    { ...item(1, "Activación", "Calentamiento", 10), completed: true, actualMinutes: 12 },
    { ...item(2, "Técnica", "Bote en movimiento", 15), completed: false, actualMinutes: null },
  ];

  it("cada ejercicio dice si se hizo y cuánto duró de verdad", async () => {
    await renderPage({ status: "done", canEdit: false, items: DONE_ITEMS, actualMinutes: 12 });

    const [first, second] = itemRows();
    expect(first).toHaveTextContent("Hecho · 12 min");
    expect(second).toHaveTextContent("Sin hacer");
  });

  it("bajo el total previsto va el real", async () => {
    await renderPage({ status: "done", canEdit: false, items: DONE_ITEMS, actualMinutes: 12 });

    expect(screen.getByText("Total").parentElement).toHaveTextContent("25 minutos");
    expect(screen.getByText("Real").parentElement).toHaveTextContent("12 minutos");
  });

  it("sin duración registrada no hay fila «Real»", async () => {
    await renderPage({ status: "done", canEdit: false, items: DONE_ITEMS, actualMinutes: null });

    expect(screen.queryByText("Real")).not.toBeInTheDocument();
  });

  it("una sesión programada no dice nada de cómo acabó, aunque esté en curso", async () => {
    await renderPage({ items: DONE_ITEMS, live: { started: true, position: 1 } });

    expect(screen.queryByText(/Hecho|Sin hacer/)).not.toBeInTheDocument();
    expect(screen.queryByText("Real")).not.toBeInTheDocument();
  });
});
