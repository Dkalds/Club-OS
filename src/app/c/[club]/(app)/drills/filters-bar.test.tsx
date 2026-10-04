import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterHref, MAX_QUERY_LENGTH } from "@/modules/drills/filters";
import type { DrillFilters, FocusArea } from "@/modules/drills/types";
import { installChipRowLayout, type ChipRowLayout } from "@/ui/chip-row-layout";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const navigation = vi.hoisted(() => ({ pathname: "/c/club-a/drills" }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => navigation.pathname,
}));

import { DrillFiltersBar } from "./filters-bar";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
// Los objetivos llegan del club (`focus_areas`), nunca del código: aquí son los de «Club A».
const PATH = "/c/club-a/drills";
const FOCUS_AREAS: FocusArea[] = [
  { id: "f-1", slug: "defensa", name: "Defensa" },
  { id: "f-2", slug: "rebote", name: "Rebote" },
  { id: "f-3", slug: "transicion", name: "Transición" },
];

function bar(filters: DrillFilters, principleTitle: string | null = null) {
  return <DrillFiltersBar filters={filters} focusAreas={FOCUS_AREAS} principleTitle={principleTitle} />;
}

function renderBar(filters: DrillFilters = {}, principleTitle: string | null = null) {
  return render(bar(filters, principleTitle));
}

function searchbox() {
  return screen.getByRole("searchbox", { name: "Buscar ejercicios" });
}

function focusGroup() {
  return screen.getByRole("group", { name: "Objetivo" });
}

/** Abre la hoja del chip `chip` y elige `option` en ella. */
function chooseInSheet(chip: string, option: string) {
  fireEvent.click(screen.getByRole("button", { name: chip }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: option }));
}

/** La última navegación pedida: la URL y que no devuelva la página arriba. */
function expectReplacedWith(href: string) {
  expect(router.replace).toHaveBeenLastCalledWith(href, { scroll: false });
}

// Ningún test de este archivo puede dejar avisos de React ni de Radix en la salida.
let consoleErrors: ReturnType<typeof vi.spyOn>;
let consoleWarnings: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  router.replace.mockReset();
  navigation.pathname = PATH;
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(consoleWarnings).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("lo que enseña", () => {
  it("el buscador, con la búsqueda de la URL y el tope que conserva la URL", () => {
    renderBar({ q: "rebote largo" });

    const field = searchbox();
    expect(field).toHaveAttribute("placeholder", "Buscar ejercicios…");
    expect(field).toHaveValue("rebote largo");
    expect(field).toHaveAttribute("maxlength", String(MAX_QUERY_LENGTH));
  });

  it("sin búsqueda, el campo está vacío", () => {
    renderBar();

    expect(searchbox()).toHaveValue("");
  });

  it("«Objetivo»: «Todos» y los objetivos del club, por su nombre y en su orden", () => {
    renderBar();

    expect(within(focusGroup()).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Todos",
      "Defensa",
      "Rebote",
      "Transición",
    ]);
    expect(within(focusGroup()).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");
  });

  it("marca el objetivo de la URL", () => {
    renderBar({ focus: "rebote" });

    expect(within(focusGroup()).getByRole("button", { name: "Rebote" })).toHaveAttribute("aria-pressed", "true");
    expect(within(focusGroup()).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false");
  });

  it("sin filtros, los chips de hoja dicen su nombre y no están pulsados", () => {
    renderBar();

    for (const name of ["Edad", "Jugadores", "Duración"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("con filtros, los chips de hoja enseñan el valor, pulsados", () => {
    renderBar({ age: 12, players: 10, minutes: 15 });

    for (const name of ["U12", "10 jug.", "15 min"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    }
    for (const name of ["Edad", "Jugadores", "Duración"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
  });

  it("las hojas ofrecen las opciones de la biblioteca, con la unidad de cada chip", () => {
    renderBar();

    const sheetOptions = (chip: string) => {
      fireEvent.click(screen.getByRole("button", { name: chip }));
      const dialog = screen.getByRole("dialog", { name: chip });
      const names = within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter((text) => text !== "Cerrar");
      fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
      return names;
    };

    expect(sheetOptions("Edad")).toEqual(["Cualquiera", "U8", "U10", "U12", "U14", "U16", "U18"]);
    expect(sheetOptions("Jugadores")).toEqual([
      "Cualquiera",
      "4 jug.",
      "6 jug.",
      "8 jug.",
      "10 jug.",
      "12 jug.",
      "14 jug.",
      "16 jug.",
    ]);
    expect(sheetOptions("Duración")).toEqual(["Cualquiera", "5 min", "10 min", "15 min", "20 min", "30 min"]);
  });

  it("sin principio no hay chip de principio", () => {
    renderBar({ focus: "rebote" });

    expect(screen.queryByRole("button", { name: "Quitar filtro de principio" })).not.toBeInTheDocument();
  });

  it("con principio, un chip pulsado «Principio: {título}» que se llama «Quitar filtro de principio»", () => {
    renderBar({ principle: "salida" }, "Salida de balón");

    const chip = screen.getByRole("button", { name: "Quitar filtro de principio" });
    expect(chip).toHaveTextContent("Principio: Salida de balón");
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("un principio sin título (no existe o no está publicado) se enseña con su slug", () => {
    renderBar({ principle: "no-existe" }, null);

    // Si no, el filtro vaciaría la lista sin que se vea por qué ni se pueda quitar.
    expect(screen.getByRole("button", { name: "Quitar filtro de principio" })).toHaveTextContent(
      "Principio: no-existe",
    );
  });

  it("todo mide 44 px como mínimo", () => {
    renderBar({ principle: "salida", q: "x" }, "Salida de balón");

    expect(searchbox()).toHaveClass("h-(--target-min)");
    for (const button of screen.getAllByRole("button")) {
      expect(button.className, button.textContent ?? button.getAttribute("aria-label") ?? "").toMatch(
        /min-h-\(--target-min\)|w-\(--target-min\)/,
      );
    }
  });
});

describe("cada control navega con la URL de filterHref", () => {
  it("un objetivo", () => {
    renderBar();

    fireEvent.click(within(focusGroup()).getByRole("button", { name: "Rebote" }));

    expect(router.replace).toHaveBeenCalledTimes(1);
    expectReplacedWith(filterHref(PATH, {}, { focus: "rebote" }));
    expectReplacedWith("/c/club-a/drills?focus=rebote");
  });

  it("«Todos» quita el objetivo", () => {
    renderBar({ focus: "rebote", age: 12 });

    fireEvent.click(within(focusGroup()).getByRole("button", { name: "Todos" }));

    expectReplacedWith(filterHref(PATH, { focus: "rebote", age: 12 }, { focus: undefined }));
    expectReplacedWith("/c/club-a/drills?age=12");
  });

  it("la edad", () => {
    renderBar();

    chooseInSheet("Edad", "U10");

    expect(router.replace).toHaveBeenCalledTimes(1);
    expectReplacedWith(filterHref(PATH, {}, { age: 10 }));
    expectReplacedWith("/c/club-a/drills?age=10");
  });

  it("los jugadores", () => {
    renderBar();

    chooseInSheet("Jugadores", "10 jug.");

    expectReplacedWith(filterHref(PATH, {}, { players: 10 }));
    expectReplacedWith("/c/club-a/drills?players=10");
  });

  it("la duración", () => {
    renderBar();

    chooseInSheet("Duración", "15 min");

    expectReplacedWith(filterHref(PATH, {}, { minutes: 15 }));
    expectReplacedWith("/c/club-a/drills?minutes=15");
  });

  it.each([
    ["U12", { focus: "rebote", age: 12 }],
    ["10 jug.", { focus: "rebote", players: 10 }],
    ["15 min", { focus: "rebote", minutes: 15 }],
  ] as const)("«Cualquiera» en la hoja de %s quita solo ese filtro", (chip, filters) => {
    renderBar(filters);

    chooseInSheet(chip, "Cualquiera");

    expectReplacedWith("/c/club-a/drills?focus=rebote");
  });

  it("cada cambio conserva el resto de filtros, en el orden de la URL", () => {
    renderBar({ q: "rebote", focus: "defensa", principle: "salida", age: 12, players: 8, minutes: 10 }, "Salida");

    chooseInSheet("10 min", "20 min");

    expectReplacedWith("/c/club-a/drills?q=rebote&focus=defensa&principle=salida&age=12&players=8&minutes=20");
  });

  it("el principio: quita solo el principio", () => {
    renderBar({ q: "rebote", focus: "defensa", principle: "salida", age: 12 }, "Salida");

    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro de principio" }));

    expectReplacedWith(
      filterHref(PATH, { q: "rebote", focus: "defensa", principle: "salida", age: 12 }, { principle: undefined }),
    );
    expectReplacedWith("/c/club-a/drills?q=rebote&focus=defensa&age=12");
  });

  it("quitar un principio sin título también lo quita", () => {
    renderBar({ principle: "no-existe" }, null);

    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro de principio" }));

    expectReplacedWith("/c/club-a/drills");
  });

  it("la búsqueda, con Intro y recortada, conserva los demás filtros", () => {
    renderBar({ focus: "rebote", age: 12 });

    fireEvent.change(searchbox(), { target: { value: "  salida  " } });
    fireEvent.keyDown(searchbox(), { key: "Enter" });

    expect(router.replace).toHaveBeenCalledTimes(1);
    expectReplacedWith(filterHref(PATH, { focus: "rebote", age: 12 }, { q: "salida" }));
    expectReplacedWith("/c/club-a/drills?q=salida&focus=rebote&age=12");
  });

  it("la búsqueda sin Intro espera la pausa del campo", () => {
    vi.useFakeTimers();
    renderBar();

    fireEvent.change(searchbox(), { target: { value: "salida" } });
    expect(router.replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expectReplacedWith("/c/club-a/drills?q=salida");
  });

  it("vaciar la búsqueda quita la q", () => {
    renderBar({ q: "salida", focus: "rebote" });

    fireEvent.click(screen.getByRole("button", { name: "Borrar búsqueda" }));

    expectReplacedWith("/c/club-a/drills?focus=rebote");
  });

  it("usa la ruta en la que está, sin query", () => {
    navigation.pathname = "/c/otro-club/drills";
    renderBar();

    fireEvent.click(within(focusGroup()).getByRole("button", { name: "Rebote" }));

    expectReplacedWith("/c/otro-club/drills?focus=rebote");
  });

  it("nunca navega al montarse", () => {
    renderBar({ q: "salida", focus: "rebote" });

    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("un valor de la URL que no es una opción", () => {
  it("una edad suelta se enseña en su chip, pulsada y marcada en la hoja", () => {
    renderBar({ age: 13 });

    const chip = screen.getByRole("button", { name: "U13" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Edad" })).not.toBeInTheDocument();

    fireEvent.click(chip);
    const dialog = screen.getByRole("dialog", { name: "Edad" });
    expect(within(dialog).getByRole("button", { name: "U13" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Cualquiera" })).toHaveAttribute("aria-pressed", "false");
    // Entre sus vecinas, en orden.
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent)
        .filter((text) => text?.startsWith("U")),
    ).toEqual(["U8", "U10", "U12", "U13", "U14", "U16", "U18"]);
  });

  it("y se quita con «Cualquiera»", () => {
    renderBar({ age: 13, focus: "rebote" });

    chooseInSheet("U13", "Cualquiera");

    expectReplacedWith("/c/club-a/drills?focus=rebote");
  });

  it("lo mismo con jugadores y minutos", () => {
    renderBar({ players: 9, minutes: 25 });

    expect(screen.getByRole("button", { name: "9 jug." })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "25 min" })).toHaveAttribute("aria-pressed", "true");

    chooseInSheet("9 jug.", "Cualquiera");
    expectReplacedWith("/c/club-a/drills?minutes=25");
  });

  it("un valor que sí es una opción no duplica nada", () => {
    renderBar({ age: 12 });

    fireEvent.click(screen.getByRole("button", { name: "U12" }));

    expect(within(screen.getByRole("dialog")).getAllByRole("button", { name: "U12" })).toHaveLength(1);
  });

  it("un objetivo que el club no tiene aparece marcado, con su slug, y «Todos» lo quita", () => {
    renderBar({ focus: "no-existe", age: 12 });

    const extra = within(focusGroup()).getByRole("button", { name: "no-existe" });
    expect(extra).toHaveAttribute("aria-pressed", "true");
    expect(within(focusGroup()).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(within(focusGroup()).getByRole("button", { name: "Todos" }));

    expectReplacedWith("/c/club-a/drills?age=12");
  });
});

describe("mientras la URL cambia", () => {
  it("el chip se marca al instante, sin esperar al servidor", () => {
    renderBar();

    fireEvent.click(within(focusGroup()).getByRole("button", { name: "Rebote" }));

    // El `filters` de la página sigue siendo el viejo: lo nuevo aún no ha vuelto.
    expect(within(focusGroup()).getByRole("button", { name: "Rebote" })).toHaveAttribute("aria-pressed", "true");
    expect(within(focusGroup()).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false");
  });

  it("un segundo cambio antes de que llegue el primero no lo pierde", () => {
    renderBar();

    fireEvent.click(within(focusGroup()).getByRole("button", { name: "Rebote" }));
    chooseInSheet("Edad", "U10");

    // Sin esto la segunda URL saldría de los filtros viejos y soltaría el objetivo.
    expect(router.replace).toHaveBeenCalledTimes(2);
    expectReplacedWith("/c/club-a/drills?focus=rebote&age=10");
  });

  it("tres cambios seguidos se acumulan, y quitar uno quita solo ese", () => {
    renderBar();

    fireEvent.click(within(focusGroup()).getByRole("button", { name: "Rebote" }));
    chooseInSheet("Edad", "U10");
    chooseInSheet("Duración", "15 min");
    expectReplacedWith("/c/club-a/drills?focus=rebote&age=10&minutes=15");

    chooseInSheet("U10", "Cualquiera");
    expectReplacedWith("/c/club-a/drills?focus=rebote&minutes=15");
  });

  it("cuando llega la respuesta, manda lo que dice la URL (Atrás, o un servidor que no coincide)", () => {
    const view = renderBar();
    fireEvent.click(within(focusGroup()).getByRole("button", { name: "Rebote" }));

    view.rerender(bar({ focus: "defensa" }));

    expect(within(focusGroup()).getByRole("button", { name: "Defensa" })).toHaveAttribute("aria-pressed", "true");
    expect(within(focusGroup()).getByRole("button", { name: "Rebote" })).toHaveAttribute("aria-pressed", "false");

    // Y el siguiente cambio parte de ahí.
    chooseInSheet("Edad", "U12");
    expectReplacedWith("/c/club-a/drills?focus=defensa&age=12");
  });

  it("la respuesta quita el chip del principio cuando ya no está en la URL", () => {
    const view = renderBar({ principle: "salida" }, "Salida");
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro de principio" }));

    // Al instante, sin esperar al servidor.
    expect(screen.queryByRole("button", { name: "Quitar filtro de principio" })).not.toBeInTheDocument();

    view.rerender(bar({}, null));
    expect(screen.queryByRole("button", { name: "Quitar filtro de principio" })).not.toBeInTheDocument();
  });

  it("el campo de búsqueda es el mismo mientras llegan las respuestas (no se remonta)", () => {
    const view = renderBar({ q: "sal" });
    const field = searchbox();
    field.focus();

    // El eco de la propia búsqueda: la página devuelve el mismo texto.
    view.rerender(bar({ q: "sal", focus: "rebote" }));

    expect(searchbox()).toBe(field);
    expect(field).toHaveFocus();
  });

  it("el campo sigue a la URL cuando el cambio viene de fuera («Quitar filtros»)", () => {
    const view = renderBar({ q: "sal" });
    expect(searchbox()).toHaveValue("sal");

    view.rerender(bar({}));

    expect(searchbox()).toHaveValue("");
    expect(router.replace).not.toHaveBeenCalled();
  });
});

// jsdom no tiene diseño: con `installChipRowLayout` cada fila mide 250 px y cada chip, 100. Tras
// «Todos» (0–100) van «Defensa», «Rebote» y «Transición»: solo caben dos y medio. El efecto real
// lo prueba el e2e de la biblioteca en un navegador.
describe("el filtro activo queda a la vista", () => {
  let layout: ChipRowLayout;
  const scrollsOf = (name: string) =>
    layout.scrollTo.mock.calls
      .map(([options], index) => ({ options, row: layout.scrollTo.mock.contexts[index] as HTMLElement }))
      .filter(({ row }) => row.getAttribute("aria-label") === name)
      .map(({ options }) => options);

  beforeEach(() => {
    layout = installChipRowLayout({ rowWidth: 250, chipWidth: 100 });
  });
  afterEach(() => {
    layout.restore();
  });

  it("un objetivo que queda fuera de la fila al cargar se trae a la vista", () => {
    renderBar({ focus: "transicion" });

    // «Transición» es el cuarto chip: 300–400.
    expect(scrollsOf("Objetivo")).toEqual([{ left: 150, behavior: "instant" }]);
    expect(within(focusGroup()).getByRole("button", { name: "Transición" })).toHaveAttribute("aria-pressed", "true");
  });

  it("un objetivo que el club no tiene va el último y también se trae", () => {
    renderBar({ focus: "no-existe" });

    expect(scrollsOf("Objetivo")).toEqual([{ left: 250, behavior: "instant" }]);
  });

  it("sin objetivo, «Todos» ya se ve y la fila no se mueve", () => {
    renderBar({ age: 12 });

    expect(scrollsOf("Objetivo")).toEqual([]);
  });

  it("un chip de hoja pulsado que queda fuera de la fila se trae a la vista", () => {
    renderBar({ minutes: 15 });

    // «Duración» es el tercer botón de su fila: 200–300.
    expect(scrollsOf("Edad, jugadores y duración")).toEqual([{ left: 50, behavior: "instant" }]);
    expect(scrollsOf("Objetivo")).toEqual([]);
  });

  it("el chip del principio, solo en su fila, no necesita moverla", () => {
    renderBar({ principle: "salida" }, "Salida");

    expect(scrollsOf("Principio")).toEqual([]);
  });

  it("al volver atrás a otro objetivo, la fila lo sigue; y tocar uno que ya se ve no la mueve", () => {
    const view = renderBar({ focus: "transicion" });
    expect(layout.scrollTo).toHaveBeenCalledTimes(1);

    // Con la fila en 150 se ve de 150 a 400: «Rebote» (200–300) está dentro. Es lo que el
    // navegador hace al pulsar Atrás y llegar otro `filters`.
    view.rerender(bar({ focus: "rebote" }));
    expect(layout.scrollTo).toHaveBeenCalledTimes(1);

    // Y quitar el objetivo devuelve «Todos» a la vista.
    view.rerender(bar({}));
    expect(scrollsOf("Objetivo")).toEqual([
      { left: 150, behavior: "instant" },
      { left: 0, behavior: "instant" },
    ]);
  });

  it("al pulsar «Todos» con la fila desplazada, se recoge al instante (el chip se marca sin esperar)", () => {
    renderBar({ focus: "transicion" });

    fireEvent.click(within(focusGroup()).getByRole("button", { name: "Todos" }));

    expect(scrollsOf("Objetivo")).toEqual([
      { left: 150, behavior: "instant" },
      { left: 0, behavior: "instant" },
    ]);
  });
});
