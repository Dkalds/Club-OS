import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { PracticeListItem } from "@/modules/practice/types";

const mocks = vi.hoisted(() => ({ addDrillToPractice: vi.fn() }));

vi.mock("@/modules/practice/actions", () => ({ addDrillToPractice: mocks.addDrillToPractice }));

import { AddToPractice } from "./add-to-practice";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const DRILL = "00000000-0000-4000-8000-0000000000d1";
const FIRST = "00000000-0000-4000-8000-0000000000e1";
const SECOND = "00000000-0000-4000-8000-0000000000e2";

function practice(eventId: string, overrides: Partial<PracticeListItem> = {}): PracticeListItem {
  return {
    eventId,
    teamName: "Equipo A",
    dow: "Mar",
    day: "6",
    month: "",
    time: "18:00",
    title: "Salida de presión",
    totalMinutes: 75,
    itemCount: 5,
    status: "scheduled",
    location: "Pabellón 2",
    ...overrides,
  };
}

const PRACTICES = [
  practice(FIRST),
  practice(SECOND, { dow: "Jue", day: "8", title: "Defensa en transición", itemCount: 0, totalMinutes: 60, location: null }),
];

type Props = Parameters<typeof AddToPractice>[0];

function renderAdd(props: Partial<Props> = {}) {
  return render(<AddToPractice clubSlug="club-a" drillId={DRILL} practices={PRACTICES} teamCount={1} {...props} />);
}

const openButton = () => screen.getByRole("button", { name: "Añadir a sesión" });
const sheet = () => screen.getByRole("dialog", { name: "Añadir a una sesión" });
const findSheet = () => screen.findByRole("dialog", { name: "Añadir a una sesión" });

async function openSheet() {
  fireEvent.click(openButton());
  return findSheet();
}

/** La fila de una sesión: su botón, que se llama como se lee. */
const row = (title: string) => within(sheet()).getByRole("button", { name: new RegExp(title) });

/** Una acción que no termina hasta que el test lo diga. */
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
  mocks.addDrillToPractice.mockResolvedValue(ok({ title: "Rebote y salida" }));
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  // Ni avisos de React (`act`) ni de Radix.
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(consoleWarnings).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

describe("AddToPractice · el botón", () => {
  it("«Añadir a sesión» es secondary a todo el ancho, y la hoja no se abre hasta pulsarlo", async () => {
    renderAdd();

    expect(openButton()).toHaveClass("border-line-strong", "w-full");
    expect(openButton()).not.toHaveClass("bg-brand-accent");
    expect(openButton()).toHaveAttribute("type", "button");
    expect(openButton()).toHaveAttribute("aria-haspopup", "dialog");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("abre una hoja «Añadir a una sesión» con las sesiones que le dan", async () => {
    renderAdd();

    await openSheet();

    expect(within(sheet()).getAllByRole("button", { name: /Salida de presión|Defensa en transición/ })).toHaveLength(2);
  });
});

describe("AddToPractice · las sesiones", () => {
  it("cada fila enseña el día, el título y los metadatos de la sesión, y su hora", async () => {
    renderAdd();
    await openSheet();

    const first = row("Salida de presión");
    expect(first).toHaveTextContent("Mar");
    expect(first).toHaveTextContent("6");
    expect(first).toHaveTextContent("Salida de presión");
    expect(first).toHaveTextContent("75 min · 5 ejercicios · Pabellón 2");
    expect(first).toHaveTextContent("18:00");
    expect(row("Defensa en transición")).toHaveTextContent("60 min · Sin ejercicios todavía");
  });

  it("con un solo equipo no repite su nombre en cada fila", async () => {
    renderAdd();
    await openSheet();

    expect(within(sheet()).queryByText(/Equipo A/)).not.toBeInTheDocument();
  });

  it("con varios equipos (`teamCount`) cada fila empieza por el suyo", async () => {
    renderAdd({ teamCount: 2, practices: [practice(FIRST), practice(SECOND, { teamName: "Equipo B", title: "Otra" })] });
    await openSheet();

    expect(within(sheet()).getByText("Equipo A · 75 min · 5 ejercicios · Pabellón 2")).toBeInTheDocument();
    expect(within(sheet()).getByText("Equipo B · 75 min · 5 ejercicios · Pabellón 2")).toBeInTheDocument();
  });

  it("el nombre del equipo depende solo de `teamCount`, no de los equipos que se vean en las sesiones", async () => {
    renderAdd({
      teamCount: 1,
      practices: [practice(FIRST), practice(SECOND, { teamName: "Equipo B", title: "Otra" })],
    });
    await openSheet();

    expect(within(sheet()).queryByText(/Equipo A|Equipo B/)).not.toBeInTheDocument();
  });

  it("las filas miden 44 px como mínimo y llevan solo tokens", async () => {
    renderAdd();
    await openSheet();

    for (const title of ["Salida de presión", "Defensa en transición"]) {
      expect(row(title)).toHaveClass("min-h-14", "w-full");
    }
    const classes = within(sheet())
      .getAllByRole("button", { name: /Salida de presión|Defensa en transición/ })
      .map((entry) => entry.className)
      .join(" ");
    expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(classes).not.toMatch(/\[\d+(px|rem|%)\]/);
  });
});

describe("AddToPractice · elegir una sesión", () => {
  it("añade el ejercicio de la ficha a la sesión elegida, en este club", async () => {
    renderAdd();
    await openSheet();

    fireEvent.click(row("Defensa en transición"));

    await waitFor(() => expect(mocks.addDrillToPractice).toHaveBeenCalledTimes(1));
    expect(mocks.addDrillToPractice).toHaveBeenCalledWith("club-a", { eventId: SECOND, drillId: DRILL });
  });

  it("al salir bien dice «Añadido a {título}.» y ofrece «Abrir sesión», que lleva al constructor", async () => {
    renderAdd();
    await openSheet();

    fireEvent.click(row("Salida de presión"));

    expect(await within(sheet()).findByText("Añadido a Salida de presión.")).toBeVisible();
    const open = within(sheet()).getByRole("link", { name: "Abrir sesión" });
    expect(open).toHaveAttribute("href", `/c/club-a/train/${FIRST}/edit`);
    expect(open).toHaveClass("min-h-(--target-min)");
    // El resultado sustituye a la lista: ya no se ofrece elegir otra sesión.
    expect(within(sheet()).queryByRole("button", { name: /Defensa en transición/ })).not.toBeInTheDocument();
  });

  // Un lector de pantalla anuncia el texto que CAMBIA dentro de una región `status` que ya estaba
  // en el árbol de accesibilidad; una región que pasa de `display: none` a visible con su texto en
  // la misma pintura no se anuncia, y el foco se va a «Abrir sesión» sin que se oiga el aviso. Así
  // que la región existe al abrir la hoja, vacía, es la misma después, y nada la oculta con CSS
  // (jsdom no aplica CSS: se mira la clase, como en `section-editor.test.tsx`).
  it("el aviso de lo añadido va en una región de estado que ya estaba en el árbol, vacía y sin ocultarse", async () => {
    renderAdd();
    await openSheet();
    const region = within(sheet()).getByRole("status");
    expect(region).toBeEmptyDOMElement();
    expect(region.className).not.toMatch(/hidden|empty:hidden|sr-only/);

    fireEvent.click(row("Salida de presión"));

    await within(sheet()).findByRole("link", { name: "Abrir sesión" });
    expect(within(sheet()).getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Añadido a Salida de presión.");
  });

  it("el foco va a «Abrir sesión» al añadir", async () => {
    renderAdd();
    await openSheet();

    fireEvent.click(row("Salida de presión"));

    expect(await within(sheet()).findByRole("link", { name: "Abrir sesión" })).toHaveFocus();
  });

  it("mientras guarda, las filas esperan y la hoja no se deja cerrar a medias", async () => {
    const pending = deferred<{ title: string }>();
    mocks.addDrillToPractice.mockReturnValue(pending.promise);
    renderAdd();
    await openSheet();

    fireEvent.click(row("Salida de presión"));

    await waitFor(() => expect(row("Salida de presión")).toBeDisabled());
    expect(row("Defensa en transición")).toBeDisabled();
    fireEvent.click(row("Defensa en transición"));
    expect(mocks.addDrillToPractice).toHaveBeenCalledTimes(1);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Cerrar" }));
    fireEvent.keyDown(sheet(), { key: "Escape" });
    expect(sheet()).toBeInTheDocument();

    pending.finish(ok({ title: "Rebote y salida" }));
    expect(await within(sheet()).findByText("Añadido a Salida de presión.")).toBeInTheDocument();
  });

  it("cerrar y volver a abrir la hoja vuelve a ofrecer las sesiones", async () => {
    renderAdd();
    await openSheet();
    fireEvent.click(row("Salida de presión"));
    await within(sheet()).findByText("Añadido a Salida de presión.");

    fireEvent.click(within(sheet()).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openSheet();

    expect(row("Salida de presión")).toBeEnabled();
    expect(within(sheet()).queryByText(/^Añadido a/)).not.toBeInTheDocument();
  });
});

describe("AddToPractice · cuando falla", () => {
  it.each([
    ["SAVE_FAILED"],
    ["NOT_FOUND"],
    ["SESSION_CLOSED"],
    ["STALE_COPY"],
  ] as const)("%s: dice el motivo de siempre y deja elegir otra sesión", async (error) => {
    mocks.addDrillToPractice.mockResolvedValue(fail(error));
    renderAdd();
    await openSheet();

    fireEvent.click(row("Salida de presión"));

    const alert = await within(sheet()).findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY[error]);
    expect(within(sheet()).queryByText(/^Añadido a/)).not.toBeInTheDocument();
    expect(row("Defensa en transición")).toBeEnabled();
  });

  it("con la sesión llena, dice que una sesión tiene como máximo 30 ejercicios, no «Revisa los campos»", async () => {
    mocks.addDrillToPractice.mockResolvedValue(
      fail("INVALID", { items: "Una sesión tiene como máximo 30 ejercicios." }),
    );
    renderAdd();
    await openSheet();

    fireEvent.click(row("Salida de presión"));

    const alert = await within(sheet()).findByRole("alert");
    expect(alert).toHaveTextContent("Una sesión tiene como máximo 30 ejercicios.");
    expect(alert).not.toHaveTextContent(ACTION_ERROR_COPY.INVALID);
  });

  it("un INVALID sin más detalle dice lo de siempre", async () => {
    mocks.addDrillToPractice.mockResolvedValue(fail("INVALID"));
    renderAdd();
    await openSheet();

    fireEvent.click(row("Salida de presión"));

    expect(await within(sheet()).findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.INVALID);
  });

  it("una llamada caída es SAVE_FAILED", async () => {
    mocks.addDrillToPractice.mockRejectedValue(new TypeError("fetch failed"));
    renderAdd();
    await openSheet();

    fireEvent.click(row("Salida de presión"));

    expect(await within(sheet()).findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
  });

  it("el aviso se quita al volver a intentarlo, y un éxito posterior ya no lo lleva", async () => {
    mocks.addDrillToPractice.mockResolvedValueOnce(fail("SAVE_FAILED")).mockResolvedValue(ok({ title: "Rebote y salida" }));
    renderAdd();
    await openSheet();
    fireEvent.click(row("Salida de presión"));
    await within(sheet()).findByRole("alert");

    fireEvent.click(row("Salida de presión"));

    expect(await within(sheet()).findByText("Añadido a Salida de presión.")).toBeInTheDocument();
    expect(within(sheet()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un fallo no se queda para la próxima vez que se abre la hoja", async () => {
    mocks.addDrillToPractice.mockResolvedValue(fail("SAVE_FAILED"));
    renderAdd();
    await openSheet();
    fireEvent.click(row("Salida de presión"));
    await within(sheet()).findByRole("alert");

    fireEvent.click(within(sheet()).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await openSheet();

    expect(within(sheet()).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AddToPractice · sin sesiones", () => {
  it("dice que no hay sesiones programadas y ofrece «Preparar sesión», que lleva al formulario", async () => {
    renderAdd({ practices: [] });

    await openSheet();

    expect(within(sheet()).getByRole("heading", { name: "No hay sesiones programadas" })).toBeInTheDocument();
    expect(within(sheet()).getByRole("link", { name: "Preparar sesión" })).toHaveAttribute("href", "/c/club-a/train/new");
    expect(mocks.addDrillToPractice).not.toHaveBeenCalled();
  });

  it("el botón sigue ahí: abrir la hoja es como se llega al aviso", () => {
    renderAdd({ practices: [] });

    expect(openButton()).toBeInTheDocument();
  });
});
