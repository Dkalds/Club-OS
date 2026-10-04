import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import type { DrillSummary, FocusArea } from "@/modules/drills/types";

const mocks = vi.hoisted(() => ({ findDrills: vi.fn() }));

vi.mock("@/modules/practice/actions", () => ({ findDrills: mocks.findDrills }));

import { DrillPicker } from "./drill-picker";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
function drill(n: number, title: string, overrides: Partial<DrillSummary> = {}): DrillSummary {
  return {
    id: `00000000-0000-4000-8000-0000000000d${n}`,
    title,
    status: "published",
    createdBy: null,
    minAge: 12,
    maxAge: null,
    minPlayers: 6,
    maxPlayers: 12,
    minMinutes: 10,
    maxMinutes: 15,
    focus: [],
    ...overrides,
  };
}

const OUTLET = drill(1, "Rebote + outlet", { minMinutes: 12, maxMinutes: 15, focus: [{ slug: "rebote", name: "Rebote" }] });
const CALLES = drill(2, "3 calles", { minMinutes: 10, maxMinutes: 10, focus: [{ slug: "transicion", name: "Transición" }] });
const PRESSURE = drill(3, "2x2 presión", { minMinutes: 12, maxMinutes: 15, focus: [{ slug: "defensa", name: "Defensa" }] });
const ALL = [OUTLET, CALLES, PRESSURE];

const FOCUS_AREAS: FocusArea[] = [
  { id: "f-1", slug: "rebote", name: "Rebote" },
  { id: "f-2", slug: "defensa", name: "Defensa" },
];

type Props = Parameters<typeof DrillPicker>[0];

function renderPicker(props: Partial<Props> = {}) {
  const handlers = { onOpenChange: vi.fn(), onPick: vi.fn() };
  const element = (next: Partial<Props>) => (
    <DrillPicker
      clubSlug="club-a"
      focusAreas={FOCUS_AREAS}
      open
      {...handlers}
      {...props}
      {...next}
    />
  );
  const view = render(element({}));
  return { ...view, ...handlers, update: (next: Partial<Props>) => view.rerender(element(next)) };
}

/** La hoja abierta: todo lo del selector vive dentro. */
const sheet = () => screen.getByRole("dialog", { name: "Añadir ejercicio" });
const findSheet = () => screen.findByRole("dialog", { name: "Añadir ejercicio" });
const button = (name: string) => within(sheet()).getByRole("button", { name });
const click = (name: string) => fireEvent.click(button(name));
const searchBox = () => within(sheet()).getByRole("searchbox", { name: "Buscar ejercicios" });

/** Busca ya, sin esperar la pausa del campo (lo mismo que pulsar Intro). */
function searchFor(text: string) {
  fireEvent.change(searchBox(), { target: { value: text } });
  fireEvent.keyDown(searchBox(), { key: "Enter" });
}

/** Las filas de la lista: los enlaces a la ficha de cada ejercicio. */
const links = () => within(sheet()).queryAllByRole("link");

/** Una lectura que no termina hasta que el test lo diga. */
function deferred<T>() {
  let finish: (result: ActionResult<T>) => void = () => {};
  const promise = new Promise<ActionResult<T>>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

let consoleErrors: ReturnType<typeof vi.spyOn>;
let consoleWarnings: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.findDrills.mockResolvedValue(ok(ALL));
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  // Ni avisos de React (`act`, claves) ni de Radix.
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(consoleWarnings).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("DrillPicker · abrir y cargar", () => {
  it("cerrado no pinta nada ni pide ejercicios", async () => {
    renderPicker({ open: false });

    // Un turno: la hoja no dibuja nada hasta saber dónde va.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.findDrills).not.toHaveBeenCalled();
  });

  it("abierto es una hoja «Añadir ejercicio» que pide la primera página, sin búsqueda ni objetivo", async () => {
    renderPicker();

    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");
    expect(mocks.findDrills).toHaveBeenCalledTimes(1);
    expect(mocks.findDrills).toHaveBeenCalledWith("club-a", {});
  });

  it("mientras llega la lista enseña el esqueleto de carga, y después las filas", async () => {
    const pending = deferred<DrillSummary[]>();
    mocks.findDrills.mockReturnValue(pending.promise);
    renderPicker();

    await findSheet();
    expect(within(sheet()).getByRole("status", { name: "Cargando" })).toBeInTheDocument();
    expect(links()).toHaveLength(0);

    pending.finish(ok(ALL));
    await within(sheet()).findByText("Rebote + outlet");
    expect(within(sheet()).queryByRole("status", { name: "Cargando" })).not.toBeInTheDocument();
  });

  it("cada fila lleva a la ficha del ejercicio por su id y enseña sus metadatos", async () => {
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");

    expect(links().map((link) => link.getAttribute("href"))).toEqual(
      ALL.map((entry) => `/c/club-a/drills/${entry.id}`),
    );
    expect(links()[0]).toHaveTextContent("Rebote + outlet");
    expect(links()[0]).toHaveTextContent("U12+ · 6–12 jug. · 12–15 min");
  });

  it("tiene el buscador, el filtro de objetivo con las opciones del club y la acción de cada fila", async () => {
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");

    expect(searchBox()).toHaveAttribute("placeholder", "Buscar ejercicios…");
    const focus = within(sheet()).getByRole("group", { name: "Objetivo" });
    expect(within(focus).getAllByRole("button").map((chip) => chip.textContent)).toEqual([
      "Todos",
      "Rebote",
      "Defensa",
    ]);
    expect(within(focus).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");
    for (const entry of ALL) expect(button(`Añadir ${entry.title}`)).toHaveTextContent("Añadir");
  });

  it("los botones de añadir miden 44 px como mínimo", async () => {
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");

    for (const entry of ALL) {
      expect(button(`Añadir ${entry.title}`)).toHaveClass("min-h-(--target-min)", "min-w-(--target-min)");
    }
  });
});

describe("DrillPicker · añadir", () => {
  it("«Añadir Rebote + outlet» llama a onPick con el ejercicio, la hoja sigue abierta y la fila dice «Añadido»", async () => {
    const { onPick, onOpenChange } = renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");

    click("Añadir Rebote + outlet");

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(OUTLET);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(sheet()).toBeInTheDocument();
    const added = button("Añadido. Volver a añadir Rebote + outlet");
    expect(added).toHaveTextContent("Añadido");
    // Solo esa fila: las demás siguen ofreciendo «Añadir».
    expect(button("Añadir 3 calles")).toHaveTextContent("Añadir");
    expect(within(sheet()).getAllByText("Añadido")).toHaveLength(1);
  });

  it("anuncia lo añadido en una región de estado que ya estaba en el árbol", async () => {
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");
    const status = within(sheet())
      .getAllByRole("status")
      .find((region) => region.textContent === "") as HTMLElement;
    expect(status).toBeDefined();

    click("Añadir Rebote + outlet");

    expect(status).toHaveTextContent("Rebote + outlet añadido a la sesión.");
  });

  it("el botón sigue activo: volver a tocarlo añade el ejercicio otra vez", async () => {
    const { onPick } = renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");

    click("Añadir Rebote + outlet");
    expect(button("Añadido. Volver a añadir Rebote + outlet")).toBeEnabled();
    click("Añadido. Volver a añadir Rebote + outlet");

    expect(onPick).toHaveBeenCalledTimes(2);
    expect(onPick).toHaveBeenNthCalledWith(2, OUTLET);
  });

  it("se pueden añadir varios sin cerrar la hoja, cada uno con su fila marcada", async () => {
    const { onPick, onOpenChange } = renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");

    click("Añadir Rebote + outlet");
    click("Añadir 3 calles");
    click("Añadir 2x2 presión");

    expect(onPick.mock.calls.map(([picked]) => picked.title)).toEqual(["Rebote + outlet", "3 calles", "2x2 presión"]);
    expect(within(sheet()).getAllByText("Añadido")).toHaveLength(3);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("lo añadido sigue marcado al cambiar la búsqueda y volver", async () => {
    mocks.findDrills.mockImplementation(async (_club: string, filters: { q?: string }) =>
      ok(filters.q ? [CALLES] : ALL),
    );
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");
    click("Añadir Rebote + outlet");

    searchFor("calles");
    await waitFor(() => expect(links()).toHaveLength(1));
    searchFor("");
    await waitFor(() => expect(links()).toHaveLength(3));

    expect(button("Añadido. Volver a añadir Rebote + outlet")).toBeInTheDocument();
  });

  it("cerrar y volver a abrir parte de cero: primera página, sin filtros y sin nada marcado", async () => {
    const { update } = renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");
    click("Añadir Rebote + outlet");
    click("Rebote");
    await waitFor(() => expect(mocks.findDrills).toHaveBeenLastCalledWith("club-a", { focus: "rebote" }));

    update({ open: false });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    update({ open: true });

    await findSheet();
    await waitFor(() => expect(mocks.findDrills).toHaveBeenLastCalledWith("club-a", {}));
    await waitFor(() => expect(links()).toHaveLength(3));
    expect(within(sheet()).queryByText("Añadido")).not.toBeInTheDocument();
    expect(within(sheet()).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");
  });

  it("el nombre del botón dice qué ejercicio añade, también con títulos largos", async () => {
    const long = drill(9, "Un ejercicio con un título bastante largo para comprobar el nombre");
    mocks.findDrills.mockResolvedValue(ok([long]));
    renderPicker();
    await findSheet();

    expect(await within(sheet()).findByRole("button", { name: `Añadir ${long.title}` })).toBeInTheDocument();
  });
});

describe("DrillPicker · buscar y filtrar", () => {
  it("buscar pide al servidor ese texto y enseña lo que vuelve", async () => {
    mocks.findDrills.mockImplementation(async (_club: string, filters: { q?: string }) =>
      ok(filters.q === "outlet" ? [OUTLET] : ALL),
    );
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("3 calles");

    searchFor("outlet");

    await waitFor(() => expect(links()).toHaveLength(1));
    expect(links()[0]).toHaveTextContent("Rebote + outlet");
    expect(mocks.findDrills).toHaveBeenLastCalledWith("club-a", { q: "outlet" });
  });

  it("el campo busca solo, tras su pausa, sin pulsar nada", async () => {
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("3 calles");

    fireEvent.change(searchBox(), { target: { value: "outlet" } });

    await waitFor(() => expect(mocks.findDrills).toHaveBeenLastCalledWith("club-a", { q: "outlet" }));
  });

  it("elegir un objetivo lo pide, y «Todos» lo quita", async () => {
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("3 calles");

    click("Defensa");
    await waitFor(() => expect(mocks.findDrills).toHaveBeenLastCalledWith("club-a", { focus: "defensa" }));
    expect(button("Defensa")).toHaveAttribute("aria-pressed", "true");

    click("Todos");
    await waitFor(() => expect(mocks.findDrills).toHaveBeenLastCalledWith("club-a", {}));
    expect(button("Todos")).toHaveAttribute("aria-pressed", "true");
  });

  it("el texto y el objetivo se combinan, y borrar uno deja el otro", async () => {
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("3 calles");

    searchFor("calles");
    click("Rebote");
    await waitFor(() => expect(mocks.findDrills).toHaveBeenLastCalledWith("club-a", { q: "calles", focus: "rebote" }));

    searchFor("");
    await waitFor(() => expect(mocks.findDrills).toHaveBeenLastCalledWith("club-a", { focus: "rebote" }));
  });

  it("una respuesta lenta no pisa a una más nueva", async () => {
    const slow = deferred<DrillSummary[]>();
    const fast = deferred<DrillSummary[]>();
    mocks.findDrills
      .mockResolvedValueOnce(ok(ALL))
      .mockReturnValueOnce(slow.promise)
      .mockReturnValueOnce(fast.promise);
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("3 calles");

    click("Rebote");
    click("Defensa");
    // La del segundo toque llega antes que la del primero.
    fast.finish(ok([PRESSURE]));
    await waitFor(() => expect(links()).toHaveLength(1));
    expect(links()[0]).toHaveTextContent("2x2 presión");

    slow.finish(ok([OUTLET]));
    // Se deja pasar el turno de la respuesta tardía: no cambia nada.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(links()).toHaveLength(1);
    expect(links()[0]).toHaveTextContent("2x2 presión");
    expect(button("Defensa")).toHaveAttribute("aria-pressed", "true");
  });

  it("una respuesta que llega con la hoja cerrada se ignora", async () => {
    const late = deferred<DrillSummary[]>();
    mocks.findDrills.mockReturnValueOnce(late.promise).mockResolvedValue(ok([CALLES]));
    const { update } = renderPicker();
    await findSheet();

    update({ open: false });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    update({ open: true });
    await findSheet();
    await within(sheet()).findByText("3 calles");
    late.finish(ok(ALL));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(links()).toHaveLength(1);
  });
});

describe("DrillPicker · sin resultados y errores", () => {
  it("una búsqueda sin resultados lo dice", async () => {
    mocks.findDrills.mockResolvedValue(ok([]));
    renderPicker();
    await findSheet();

    searchFor("zzz");

    expect(await within(sheet()).findByRole("heading", { name: "No hay ejercicios con esta búsqueda" })).toBeInTheDocument();
    expect(links()).toHaveLength(0);
  });

  it("sin ningún ejercicio publicado en el club, no culpa a una búsqueda que no se hizo", async () => {
    mocks.findDrills.mockResolvedValue(ok([]));
    renderPicker();
    await findSheet();

    expect(await within(sheet()).findByRole("heading", { name: "Aún no hay ejercicios publicados" })).toBeInTheDocument();
    expect(within(sheet()).queryByText("No hay ejercicios con esta búsqueda")).not.toBeInTheDocument();
  });

  it.each([
    ["una acción que falla", () => mocks.findDrills.mockResolvedValue(fail("SAVE_FAILED"))],
    ["sin permiso", () => mocks.findDrills.mockResolvedValue(fail("NOT_FOUND"))],
    ["una llamada caída", () => mocks.findDrills.mockRejectedValue(new TypeError("fetch failed"))],
  ])("%s: «No se pudieron cargar los ejercicios. Inténtalo de nuevo.» con «Reintentar»", async (_name, arrange) => {
    arrange();
    renderPicker();
    await findSheet();

    const alert = await within(sheet()).findByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar los ejercicios");
    expect(alert).toHaveTextContent("Inténtalo de nuevo.");
    expect(within(alert).getByRole("button", { name: "Reintentar" })).toHaveClass("border-line-strong");
    expect(links()).toHaveLength(0);
  });

  it("«Reintentar» vuelve a pedir lo mismo, con la búsqueda que había", async () => {
    mocks.findDrills.mockResolvedValueOnce(ok(ALL)).mockResolvedValueOnce(fail("SAVE_FAILED")).mockResolvedValue(ok([CALLES]));
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("3 calles");

    searchFor("calles");
    const alert = await within(sheet()).findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(links()).toHaveLength(1));
    expect(mocks.findDrills).toHaveBeenLastCalledWith("club-a", { q: "calles" });
    expect(within(sheet()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tras un error el buscador y los filtros siguen ahí para probar otra cosa", async () => {
    mocks.findDrills.mockResolvedValueOnce(fail("SAVE_FAILED")).mockResolvedValue(ok(ALL));
    renderPicker();
    await findSheet();
    await within(sheet()).findByRole("alert");

    click("Defensa");

    await waitFor(() => expect(links()).toHaveLength(3));
  });
});

describe("DrillPicker · la sesión llena", () => {
  it("con `full` los botones no dejan añadir, y la hoja dice por qué", async () => {
    const { onPick } = renderPicker({ full: true });
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");

    expect(within(sheet()).getByText("Una sesión tiene como máximo 30 ejercicios.")).toBeVisible();
    for (const entry of ALL) expect(button(`Añadir ${entry.title}`)).toBeDisabled();
    fireEvent.click(button("Añadir Rebote + outlet"));
    expect(onPick).not.toHaveBeenCalled();
  });

  it("sin `full` no hay aviso y los botones están activos", async () => {
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");

    expect(within(sheet()).queryByText("Una sesión tiene como máximo 30 ejercicios.")).not.toBeInTheDocument();
    expect(button("Añadir Rebote + outlet")).toBeEnabled();
  });

  it("si la sesión se llena mientras la hoja está abierta, los botones se cierran en el momento", async () => {
    const { update } = renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");

    update({ full: true });

    expect(button("Añadir 3 calles")).toBeDisabled();
    expect(within(sheet()).getByText("Una sesión tiene como máximo 30 ejercicios.")).toBeInTheDocument();
  });
});

describe("DrillPicker · medidas", () => {
  it("no usa colores ni medidas propias: solo tokens y la escala del sistema", async () => {
    renderPicker();
    await findSheet();
    await within(sheet()).findByText("Rebote + outlet");

    const classes = within(sheet())
      .getAllByRole("button", { name: /^Añadir / })
      .map((add) => `${add.className} ${add.innerHTML}`)
      .join(" ");
    expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(classes).not.toMatch(/\[\d+(px|rem|%)\]/);
  });
});
