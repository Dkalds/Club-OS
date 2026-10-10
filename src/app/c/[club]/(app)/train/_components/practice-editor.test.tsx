import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Link from "next/link";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { DrillSummary, FocusArea } from "@/modules/drills/types";
import type { Proposal, ProposedItem } from "@/modules/practice/proposal";
import type { PracticeDetail, PracticeDetailItem } from "@/modules/practice/types";

const mocks = vi.hoisted(() => ({
  findDrills: vi.fn(),
  savePracticeItems: vi.fn(),
  updatePracticeMeta: vi.fn(),
  createPractice: vi.fn(),
  proposePracticeItems: vi.fn(),
  push: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("@/modules/practice/actions", () => ({
  findDrills: mocks.findDrills,
  savePracticeItems: mocks.savePracticeItems,
  updatePracticeMeta: mocks.updatePracticeMeta,
  createPractice: mocks.createPractice,
  proposePracticeItems: mocks.proposePracticeItems,
}));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

import { PracticeEditor } from "./practice-editor";
import type { PracticeFormValues } from "./practice-form";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const EVENT = "00000000-0000-4000-8000-0000000000e1";
const TEAM = "00000000-0000-4000-8000-0000000000a1";
const FOCUS = "00000000-0000-4000-8000-0000000000f1";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos. */
const UPDATED_AT = "2026-10-04T10:00:00.123456+00:00";
const AFTER_FIRST = "2026-10-04T10:05:00.654321+00:00";
const AFTER_SECOND = "2026-10-04T10:06:00.000001+00:00";
const DETAIL = `/c/club-a/train/${EVENT}`;

function item(n: number, title: string, minutes: number): PracticeDetailItem {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    drillId: null,
    drillVisible: false,
    title,
    phase: null,
    minutes,
    notes: null,
    completed: null,
    actualMinutes: null,
  };
}

const ITEMS = [item(1, "Rueda de pases", 10), item(2, "Tres calles", 15)];

function practice(overrides: Partial<PracticeDetail> = {}): PracticeDetail {
  return {
    eventId: EVENT,
    planId: "00000000-0000-4000-8000-0000000000b1",
    teamId: TEAM,
    teamName: "Equipo A",
    status: "scheduled",
    startsAt: "2026-10-06T16:00:00.000Z",
    endsAt: "2026-10-06T17:15:00.000Z",
    slotLabel: "Martes 6 oct · 18:00–19:15",
    location: "Pabellón 2",
    title: "Salida de presión",
    primaryFocus: { id: FOCUS, name: "Rebote" },
    secondaryFocus: null,
    notes: null,
    items: ITEMS,
    standards: [],
    updatedAt: UPDATED_AT,
    canEdit: true,
    live: { started: false, position: null },
    actualMinutes: null,
    ...overrides,
  };
}

/** Los objetivos del club como los lee la biblioteca (con slug): lo que filtra el selector de ejercicios. */
const DRILL_FOCUS_AREAS: FocusArea[] = [{ id: FOCUS, slug: "rebote", name: "Rebote" }];

const VALUES: PracticeFormValues = {
  teamId: TEAM,
  title: "Salida de presión",
  date: "2026-10-06",
  time: "18:00",
  durationMinutes: "75",
  primaryFocusId: FOCUS,
  secondaryFocusId: "",
  location: "Pabellón 2",
  notes: "",
};

/** `extra` es lo que la página añade para preparar la sesión: la franja y la propuesta al entrar. */
function renderEditor(
  overrides: Partial<PracticeDetail> = {},
  extra: { slotMinutes?: number; autoPropose?: boolean } = {},
) {
  return render(
    <PracticeEditor
      clubSlug="club-a"
      practice={practice(overrides)}
      options={{ teams: [{ id: TEAM, name: "Equipo A" }], focusAreas: [{ id: FOCUS, name: "Rebote" }] }}
      drillFocusAreas={DRILL_FOCUS_AREAS}
      initialValues={VALUES}
      {...extra}
    />,
  );
}

const button = (name: string) => screen.getByRole("button", { name });
const click = (name: string) => fireEvent.click(button(name));

/** Las filas del constructor (la cabecera tiene su propia lista, la de objetivos). */
const rows = () => screen.getAllByRole("listitem").filter((row) => row.hasAttribute("data-row"));

/** El panel de «Fecha y datos»: lo que controla su botón. */
function panel(): HTMLElement {
  const id = button("Fecha y datos").getAttribute("aria-controls");
  return document.getElementById(id ?? "") as HTMLElement;
}

/** Un campo del formulario de «Fecha y datos» (una fila abierta también tiene «Título» y «Notas»). */
const metaField = (label: string) => within(panel()).getByLabelText(label);
const changeMeta = (label: string, value: string) => fireEvent.change(metaField(label), { target: { value } });

/** Cambia la lista de ejercicios: cinco minutos más al primero. */
const changeItems = () => click("Más minutos, Rueda de pases");
/** Cambia los datos de la sesión, con el panel abierto. */
const changeLocation = () => changeMeta("Lugar", "Pabellón 3");

/**
 * Lo que haría el navegador al cerrar o recargar la pestaña: lanza `beforeunload` y dice si
 * algo pidió confirmación (cancelando el evento).
 */
function unloadAsks(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

/**
 * Pulsa «Volver a la sesión» (el de arriba) y dice si el clic llegó a navegar. jsdom no
 * implementa la navegación (la registra como error): el clic se corta en `document`, ya
 * después de que React y el componente lo hayan visto, y se mira si el componente lo había
 * cancelado.
 */
function clickBack(): "navega" | "se queda" {
  let outcome: "navega" | "se queda" = "navega";
  const cut = (event: Event) => {
    outcome = event.defaultPrevented ? "se queda" : "navega";
    event.preventDefault();
  };
  document.addEventListener("click", cut);
  fireEvent.click(screen.getAllByRole("link", { name: "Volver a la sesión" })[0]);
  document.removeEventListener("click", cut);
  return outcome;
}

const leaveDialog = () => screen.queryByRole("alertdialog", { name: "¿Salir sin guardar?" });

/** Una acción que no termina hasta que el test lo diga. */
function deferred<T>() {
  let finish: (result: ActionResult<T>) => void = () => {};
  const promise = new Promise<ActionResult<T>>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

/**
 * Mira en el instante en que `text` entra en el documento, antes de cualquier otro turno de
 * React (un MutationObserver corre justo después de esa pintura): si la pestaña aún pregunta
 * al cerrarse y si «Volver a la sesión» aún pregunta.
 */
async function whenShown(text: string, trigger: () => void) {
  let seen: { tabAsks: boolean; backAsks: boolean } | null = null;
  const observer = new MutationObserver(() => {
    if (seen === null && screen.queryByText(text)) {
      seen = { tabAsks: unloadAsks(), backAsks: clickBack() === "se queda" };
    }
  });
  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  trigger();
  await screen.findByText(text);
  observer.disconnect();
  return seen;
}

beforeAll(() => {
  // jsdom no implementa `scrollIntoView`; el constructor lo usa para dejar a la vista la fila nueva.
  Element.prototype.scrollIntoView = vi.fn();
});

let consoleErrors: ReturnType<typeof vi.spyOn>;
let consoleWarnings: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.savePracticeItems.mockResolvedValue(ok({ updatedAt: AFTER_FIRST }));
  mocks.updatePracticeMeta.mockResolvedValue(ok({ updatedAt: AFTER_FIRST }));
  // `location.reload` no se puede sustituir en jsdom: se cambia todo `location`.
  vi.stubGlobal("location", { reload: mocks.reload });
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleWarnings = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(consoleWarnings).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PracticeEditor · la pantalla", () => {
  it("vuelve a la sesión, y el único <h1> es su título, con su equipo y su franja", () => {
    renderEditor();

    const back = screen.getByRole("link", { name: "Volver a la sesión" });
    expect(back).toHaveAttribute("href", DETAIL);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const title = screen.getByRole("heading", { level: 1, name: "Salida de presión" });
    expect(back.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("Equipo A")).toBeInTheDocument();
    expect(screen.getByText("Martes 6 oct · 18:00–19:15")).toBeInTheDocument();
  });

  it("la cabecera dice el lugar y el objetivo, pero no la duración ni el recuento: el total está en la barra", () => {
    renderEditor();

    const header = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
    expect(within(header).getByText("Pabellón 2")).toBeInTheDocument();
    expect(within(within(header).getByRole("list", { name: "Objetivos" })).getByText("Rebote")).toBeInTheDocument();
    expect(header).not.toHaveTextContent("25 min");
    expect(header).not.toHaveTextContent("ejercicios");

    // Con la lista cambiada, lo único que dice cuánto dura es el total de la barra.
    changeItems();
    expect(screen.getByText("Total").parentElement).toHaveTextContent("30'");
    expect(header).not.toHaveTextContent(/\d+ min/);
  });

  it("monta el constructor con los ejercicios de la sesión", () => {
    renderEditor();

    expect(rows()).toHaveLength(2);
    expect(button("Mover Rueda de pases")).toBeInTheDocument();
    expect(button("Guardar sesión")).toBeDisabled();
    expect(button("Añadir bloque libre")).toBeInTheDocument();
  });

  it("«Fecha y datos» empieza cerrado: lo principal es la lista de ejercicios", () => {
    renderEditor();

    const toggle = button("Fecha y datos");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel()).not.toBeVisible();
    // Va antes que la lista: son los datos de la sesión, no un ejercicio más.
    expect(toggle.compareDocumentPosition(rows()[0])).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("abierto, es el formulario de la sesión en modo editar, con sus datos", () => {
    renderEditor();

    click("Fecha y datos");

    expect(button("Fecha y datos")).toHaveAttribute("aria-expanded", "true");
    expect(panel()).toBeVisible();
    expect(metaField("Título")).toHaveValue("Salida de presión");
    expect(metaField("Fecha")).toHaveValue("2026-10-06");
    expect(metaField("Hora")).toHaveValue("18:00");
    expect(metaField("Duración (min)")).toHaveValue(75);
    expect(metaField("Objetivo principal")).toHaveValue(FOCUS);
    expect(metaField("Lugar")).toHaveValue("Pabellón 2");
    expect(metaField("Notas")).toHaveValue("");
    expect(within(panel()).queryByLabelText("Equipo")).not.toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Guardar datos" })).toBeInTheDocument();

    click("Fecha y datos");
    expect(panel()).not.toBeVisible();
  });

  it("«Guardar sesión» es el único primary de la pantalla", () => {
    renderEditor();
    click("Fecha y datos");

    expect(button("Guardar sesión")).toHaveClass("bg-brand-accent");
    expect(button("Guardar datos")).not.toHaveClass("bg-brand-accent");
    expect(button("Añadir bloque libre")).not.toHaveClass("bg-brand-accent");
  });
});

describe("PracticeEditor · salir con cambios", () => {
  // Review Focus 5: se sale con cambios sin guardar.
  it("sin cambios, «Volver a la sesión» navega y la pestaña no pregunta", () => {
    renderEditor();

    expect(unloadAsks()).toBe(false);
    expect(clickBack()).toBe("navega");
    expect(leaveDialog()).not.toBeInTheDocument();
  });

  it("con la lista cambiada, pregunta: «Seguir editando» conserva el cambio y «Salir sin guardar» sale", () => {
    renderEditor();
    changeItems();

    expect(unloadAsks()).toBe(true);
    expect(clickBack()).toBe("se queda");
    expect(leaveDialog()).toBeInTheDocument();

    click("Seguir editando");
    expect(leaveDialog()).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(rows()[0]).toHaveTextContent("15'");

    expect(clickBack()).toBe("se queda");
    click("Salir sin guardar");
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(DETAIL);
  });

  it("con solo los datos de la sesión cambiados, también pregunta", () => {
    renderEditor();
    click("Fecha y datos");
    changeLocation();

    expect(unloadAsks()).toBe(true);
    expect(clickBack()).toBe("se queda");
    expect(leaveDialog()).toBeInTheDocument();
  });

  it("cerrar «Fecha y datos» con cambios no los pierde: sigue preguntando y, al abrirlo, siguen ahí", () => {
    renderEditor();
    click("Fecha y datos");
    changeLocation();

    click("Fecha y datos");
    expect(panel()).not.toBeVisible();
    expect(unloadAsks()).toBe(true);
    expect(clickBack()).toBe("se queda");
    click("Seguir editando");

    click("Fecha y datos");
    expect(metaField("Lugar")).toHaveValue("Pabellón 3");
  });

  it("deshacer el cambio deja de preguntar", () => {
    renderEditor();
    changeItems();
    click("Fecha y datos");
    changeLocation();

    click("Menos minutos, Rueda de pases");
    expect(unloadAsks()).toBe(true);

    changeMeta("Lugar", "Pabellón 2");
    expect(unloadAsks()).toBe(false);
    expect(clickBack()).toBe("navega");
  });

  it("al aparecer «Sesión guardada.», la pestaña ya no pregunta y «Volver a la sesión» navega", async () => {
    renderEditor();
    changeItems();
    expect(unloadAsks()).toBe(true);

    const seen = await whenShown("Sesión guardada.", () => click("Guardar sesión"));

    expect(seen).toEqual({ tabAsks: false, backAsks: false });
  });

  it("al aparecer «Datos guardados.», igual", async () => {
    renderEditor();
    click("Fecha y datos");
    changeLocation();
    expect(unloadAsks()).toBe(true);

    const seen = await whenShown("Datos guardados.", () => click("Guardar datos"));

    expect(seen).toEqual({ tabAsks: false, backAsks: false });
  });

  it("guardar la lista con los datos aún sin guardar sigue preguntando, y al revés", async () => {
    renderEditor();
    changeItems();
    click("Fecha y datos");
    changeLocation();

    click("Guardar sesión");
    await screen.findByText("Sesión guardada.");
    expect(unloadAsks()).toBe(true);
    expect(clickBack()).toBe("se queda");
    click("Seguir editando");

    click("Guardar datos");
    await screen.findByText("Datos guardados.");
    expect(unloadAsks()).toBe(false);
    expect(clickBack()).toBe("navega");
  });
});

describe("PracticeEditor · una sola copia para los datos y para los ejercicios", () => {
  it("cada guardado usa la copia que dejó el anterior, sea de los datos o de los ejercicios", async () => {
    mocks.updatePracticeMeta
      .mockResolvedValueOnce(ok({ updatedAt: AFTER_FIRST }))
      .mockResolvedValueOnce(ok({ updatedAt: "2026-10-04T10:07:00.000002+00:00" }));
    mocks.savePracticeItems.mockResolvedValueOnce(ok({ updatedAt: AFTER_SECOND }));
    renderEditor();
    click("Fecha y datos");

    // Primero los datos, con la copia con la que se abrió la pantalla.
    changeLocation();
    click("Guardar datos");
    await screen.findByText("Datos guardados.");
    expect(mocks.updatePracticeMeta).toHaveBeenLastCalledWith(
      "club-a",
      expect.objectContaining({ eventId: EVENT, expectedUpdatedAt: UPDATED_AT, location: "Pabellón 3" }),
    );

    // Después los ejercicios, sin recargar: con la copia que dejó guardar los datos.
    changeItems();
    click("Guardar sesión");
    await screen.findByText("Sesión guardada.");
    expect(mocks.savePracticeItems).toHaveBeenLastCalledWith(
      "club-a",
      expect.objectContaining({ eventId: EVENT, expectedUpdatedAt: AFTER_FIRST }),
    );

    // Y otra vez los datos, con la que dejó guardar los ejercicios.
    changeMeta("Lugar", "Pabellón 1");
    click("Guardar datos");
    await waitFor(() => expect(mocks.updatePracticeMeta).toHaveBeenCalledTimes(2));
    expect(mocks.updatePracticeMeta).toHaveBeenLastCalledWith(
      "club-a",
      expect.objectContaining({ expectedUpdatedAt: AFTER_SECOND }),
    );
  });

  it("un guardado que falla no cambia la copia", async () => {
    mocks.savePracticeItems.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderEditor();
    changeItems();

    click("Guardar sesión");
    await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED);
    click("Guardar sesión");

    await screen.findByText("Sesión guardada.");
    expect(mocks.savePracticeItems).toHaveBeenCalledTimes(2);
    expect(mocks.savePracticeItems).toHaveBeenLastCalledWith(
      "club-a",
      expect.objectContaining({ expectedUpdatedAt: UPDATED_AT }),
    );
  });
});

describe("PracticeEditor · los dos guardados no se pisan", () => {
  // Los dos comparan con la misma copia: enviados a la vez, el segundo llegaría con la vieja y
  // recibiría «Alguien ha cambiado esto…» sin que nadie más hubiera guardado.
  it("con «Guardar datos» en marcha, «Guardar sesión» espera; después guarda con la copia nueva", async () => {
    const data = deferred<{ updatedAt: string }>();
    mocks.updatePracticeMeta.mockReturnValue(data.promise);
    mocks.savePracticeItems.mockResolvedValue(ok({ updatedAt: AFTER_SECOND }));
    renderEditor();
    changeItems();
    click("Fecha y datos");
    changeLocation();
    expect(button("Guardar sesión")).toBeEnabled();

    click("Guardar datos");

    expect(button("Guardar sesión")).toBeDisabled();
    fireEvent.click(button("Guardar sesión"));
    expect(mocks.savePracticeItems).not.toHaveBeenCalled();
    // La lista se puede seguir montando mientras tanto.
    click("Más minutos, Tres calles");
    expect(rows()[1]).toHaveTextContent("20'");
    expect(button("Guardar sesión")).toBeDisabled();

    data.finish(ok({ updatedAt: AFTER_FIRST }));
    await screen.findByText("Datos guardados.");
    await waitFor(() => expect(button("Guardar sesión")).toBeEnabled());

    click("Guardar sesión");
    await screen.findByText("Sesión guardada.");
    expect(mocks.savePracticeItems).toHaveBeenCalledTimes(1);
    expect(mocks.savePracticeItems).toHaveBeenLastCalledWith(
      "club-a",
      expect.objectContaining({ expectedUpdatedAt: AFTER_FIRST }),
    );
    expect(screen.queryByText(ACTION_ERROR_COPY.STALE_COPY)).not.toBeInTheDocument();
  });

  it("y al revés: con «Guardar sesión» en marcha, «Guardar datos» espera", async () => {
    const items = deferred<{ updatedAt: string }>();
    mocks.savePracticeItems.mockReturnValue(items.promise);
    mocks.updatePracticeMeta.mockResolvedValue(ok({ updatedAt: AFTER_SECOND }));
    renderEditor();
    changeItems();
    click("Fecha y datos");
    changeLocation();
    expect(button("Guardar datos")).toBeEnabled();

    click("Guardar sesión");

    expect(button("Guardar datos")).toBeDisabled();
    fireEvent.submit(button("Guardar datos").closest("form") as HTMLFormElement);
    expect(mocks.updatePracticeMeta).not.toHaveBeenCalled();
    // Los datos se pueden seguir escribiendo mientras tanto.
    changeMeta("Lugar", "Pabellón 4");
    expect(button("Guardar datos")).toBeDisabled();

    items.finish(ok({ updatedAt: AFTER_FIRST }));
    await screen.findByText("Sesión guardada.");
    await waitFor(() => expect(button("Guardar datos")).toBeEnabled());

    click("Guardar datos");
    await screen.findByText("Datos guardados.");
    expect(mocks.updatePracticeMeta).toHaveBeenCalledTimes(1);
    expect(mocks.updatePracticeMeta).toHaveBeenLastCalledWith(
      "club-a",
      expect.objectContaining({ expectedUpdatedAt: AFTER_FIRST, location: "Pabellón 4" }),
    );
    expect(screen.queryByText(ACTION_ERROR_COPY.STALE_COPY)).not.toBeInTheDocument();
  });

  it("un guardado que falla también deja paso al otro, con la copia que había", async () => {
    const data = deferred<{ updatedAt: string }>();
    mocks.updatePracticeMeta.mockReturnValue(data.promise);
    renderEditor();
    changeItems();
    click("Fecha y datos");
    changeLocation();

    click("Guardar datos");
    expect(button("Guardar sesión")).toBeDisabled();
    data.finish(fail("SAVE_FAILED"));

    await within(panel()).findByText(ACTION_ERROR_COPY.SAVE_FAILED);
    await waitFor(() => expect(button("Guardar sesión")).toBeEnabled());
    click("Guardar sesión");
    await screen.findByText("Sesión guardada.");
    expect(mocks.savePracticeItems).toHaveBeenLastCalledWith(
      "club-a",
      expect.objectContaining({ expectedUpdatedAt: UPDATED_AT }),
    );
  });

  it("sin nada en marcha, cada botón depende solo de lo suyo", () => {
    renderEditor();
    click("Fecha y datos");

    expect(button("Guardar sesión")).toBeDisabled();
    expect(button("Guardar datos")).toBeEnabled();
  });
});

describe("PracticeEditor · «Fecha y datos» con cambios sin guardar", () => {
  const toggle = () => button("Fecha y datos");

  it("lo dice en su botón, se vea o no el formulario, y deja de decirlo al guardar", async () => {
    renderEditor();
    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
    expect(toggle()).not.toHaveAccessibleDescription();

    click("Fecha y datos");
    changeLocation();

    expect(screen.getByText("Cambios sin guardar")).toBeVisible();
    expect(toggle()).toContainElement(screen.getByText("Cambios sin guardar"));
    // El botón sigue llamándose igual; el aviso lo describe.
    expect(toggle()).toHaveAccessibleDescription("Cambios sin guardar");

    // Cerrado es cuando hace falta: lo escrito no se ve y el aviso de salida preguntaría por ello.
    click("Fecha y datos");
    expect(panel()).not.toBeVisible();
    expect(screen.getByText("Cambios sin guardar")).toBeVisible();

    click("Fecha y datos");
    click("Guardar datos");
    await screen.findByText("Datos guardados.");
    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
    expect(toggle()).not.toHaveAccessibleDescription();
  });

  it("deshacer el cambio lo quita", () => {
    renderEditor();
    click("Fecha y datos");
    changeLocation();
    expect(screen.getByText("Cambios sin guardar")).toBeInTheDocument();

    changeMeta("Lugar", "Pabellón 2");

    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
  });

  it("los cambios de la lista de ejercicios no lo ponen: esos tienen su «Guardar sesión»", () => {
    renderEditor();

    changeItems();

    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
    expect(button("Guardar sesión")).toBeEnabled();
  });

  it("no usa colores ni medidas propias: solo tokens", () => {
    renderEditor();
    click("Fecha y datos");
    changeLocation();

    expect(screen.getByText("Cambios sin guardar")).toHaveClass("text-body-s", "text-ink-2");
  });
});

describe("PracticeEditor · salir por un enlace que no es el suyo", () => {
  it("con cambios, un enlace de fuera del editor (la navegación) también pregunta", () => {
    render(
      <>
        <nav aria-label="Principal">
          <Link href="/c/club-a/way" prefetch={false}>
            The Way
          </Link>
        </nav>
        <PracticeEditor
          clubSlug="club-a"
          practice={practice()}
          options={{ teams: [{ id: TEAM, name: "Equipo A" }], focusAreas: [{ id: FOCUS, name: "Rebote" }] }}
          drillFocusAreas={DRILL_FOCUS_AREAS}
          initialValues={VALUES}
        />
      </>,
    );
    const outside = screen.getByRole("link", { name: "The Way" });
    const clickOutside = () => {
      let prevented = false;
      const cut = (event: Event) => {
        prevented = event.defaultPrevented;
        event.preventDefault();
      };
      document.addEventListener("click", cut);
      fireEvent.click(outside);
      document.removeEventListener("click", cut);
      return prevented ? "se queda" : "navega";
    };

    expect(clickOutside()).toBe("navega");

    changeItems();
    expect(clickOutside()).toBe("se queda");
    expect(leaveDialog()).toBeInTheDocument();

    click("Salir sin guardar");
    expect(mocks.push).toHaveBeenCalledWith("/c/club-a/way");
  });
});

describe("PracticeEditor · copia obsoleta y sesión cerrada", () => {
  // Review Focus 2: otra persona guardó antes.
  it("«Recargar» de la lista recarga la página sin que el navegador pregunte otra vez", async () => {
    mocks.savePracticeItems.mockResolvedValue(fail("STALE_COPY"));
    let askedOnReload: boolean | null = null;
    mocks.reload.mockImplementation(() => {
      askedOnReload = unloadAsks();
    });
    renderEditor();
    changeItems();
    click("Guardar sesión");
    await screen.findByText(ACTION_ERROR_COPY.STALE_COPY);
    // Lo escrito sigue ahí, y sin guardar, hasta que se decide recargar.
    expect(rows()[0]).toHaveTextContent("15'");
    expect(unloadAsks()).toBe(true);

    click("Recargar");

    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(askedOnReload).toBe(false);
  });

  it("«Recargar» de los datos hace lo mismo", async () => {
    mocks.updatePracticeMeta.mockResolvedValue(fail("STALE_COPY"));
    let askedOnReload: boolean | null = null;
    mocks.reload.mockImplementation(() => {
      askedOnReload = unloadAsks();
    });
    renderEditor();
    click("Fecha y datos");
    changeLocation();
    click("Guardar datos");
    await within(panel()).findByText(ACTION_ERROR_COPY.STALE_COPY);
    expect(metaField("Lugar")).toHaveValue("Pabellón 3");

    fireEvent.click(within(panel()).getByRole("button", { name: "Recargar" }));

    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(askedOnReload).toBe(false);
  });

  it("con la sesión cerrada, el aviso de la lista ofrece volver a ella", async () => {
    mocks.savePracticeItems.mockResolvedValue(fail("SESSION_CLOSED"));
    renderEditor();
    changeItems();

    click("Guardar sesión");

    const alert = (await screen.findByText(ACTION_ERROR_COPY.SESSION_CLOSED)).closest('[role="alert"]') as HTMLElement;
    expect(within(alert).getByRole("link", { name: "Volver a la sesión" })).toHaveAttribute("href", DETAIL);
  });
});

describe("PracticeEditor · ejercicios de la biblioteca", () => {
  function drill(n: number, title: string, minMinutes: number): DrillSummary {
    return {
      id: `00000000-0000-4000-8000-0000000000d${n}`,
      title,
      status: "published",
      createdBy: null,
      minAge: 12,
      maxAge: null,
      minPlayers: 6,
      maxPlayers: 12,
      minMinutes,
      maxMinutes: minMinutes + 5,
      focus: [],
    };
  }

  const OUTLET = drill(1, "Rebote y salida", 12);
  const CALLES = drill(2, "Tres calles seguidas", 10);
  const FIVE = [OUTLET, CALLES, drill(3, "Pase y va", 8), drill(4, "Presión a dos", 15), drill(5, "Salida rápida", 5)];

  beforeEach(() => {
    mocks.findDrills.mockResolvedValue(ok(FIVE));
  });

  /**
   * Las filas del constructor mientras la hoja está abierta: la hoja modal esconde el resto de la
   * pantalla a los lectores de pantalla (`aria-hidden`), y `rows()` no las encontraría.
   */
  const rowsBehindSheet = () =>
    screen.getAllByRole("listitem", { hidden: true }).filter((row) => row.hasAttribute("data-row"));

  /** Abre el selector y espera a que traiga la lista. */
  async function openPicker() {
    click("Añadir ejercicio");
    const dialog = await screen.findByRole("dialog", { name: "Añadir ejercicio" });
    await within(dialog).findByText("Rebote y salida");
    return dialog;
  }

  it("«Añadir ejercicio» es secondary a todo el ancho y va encima de «Añadir bloque libre»; el único primary sigue siendo «Guardar sesión»", () => {
    renderEditor();

    const add = button("Añadir ejercicio");
    expect(add).toHaveClass("border-line-strong", "w-full");
    expect(add).not.toHaveClass("bg-brand-accent");
    expect(add).toHaveAttribute("type", "button");
    expect(add.compareDocumentPosition(button("Añadir bloque libre"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(rows().at(-1)?.compareDocumentPosition(add)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(button("Guardar sesión")).toHaveClass("bg-brand-accent");
  });

  it("no pide ejercicios hasta que se abre el selector", async () => {
    renderEditor();

    expect(mocks.findDrills).not.toHaveBeenCalled();
    await openPicker();
    expect(mocks.findDrills).toHaveBeenCalledWith("club-a", {});
  });

  it("el selector ofrece los objetivos del club que le da la página", async () => {
    renderEditor();

    const dialog = await openPicker();

    const group = within(dialog).getByRole("group", { name: "Objetivo" });
    expect(within(group).getAllByRole("button").map((chip) => chip.textContent)).toEqual(["Todos", "Rebote"]);
  });

  it("elegir un ejercicio lo añade al final con su título y sus minutos mínimos, y la hoja sigue abierta", async () => {
    renderEditor();
    const dialog = await openPicker();

    fireEvent.click(within(dialog).getByRole("button", { name: "Añadir Rebote y salida" }));

    expect(dialog).toBeInTheDocument();
    expect(rowsBehindSheet()).toHaveLength(3);
    expect(rowsBehindSheet()[2]).toHaveTextContent("03");
    expect(rowsBehindSheet()[2]).toHaveTextContent("Rebote y salida");
    expect(rowsBehindSheet()[2]).toHaveTextContent("12'");
    expect(screen.getByText("Total").parentElement).toHaveTextContent("37'");
    expect(screen.getByRole("button", { name: "Guardar sesión", hidden: true })).toBeEnabled();
  });

  it("al guardar, el ítem sale con su ejercicio, sin fase ni notas y sin id", async () => {
    renderEditor();
    const dialog = await openPicker();
    fireEvent.click(within(dialog).getByRole("button", { name: "Añadir Rebote y salida" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    click("Guardar sesión");
    await screen.findByText("Sesión guardada.");

    const { items } = mocks.savePracticeItems.mock.calls[0][1];
    expect(items).toHaveLength(3);
    expect(items[2]).toStrictEqual({ drillId: OUTLET.id, title: "Rebote y salida", phase: null, minutes: 12, notes: null });
  });

  it("cinco ejercicios seguidos, sin cerrar la hoja: cinco filas más, cada una con sus minutos", async () => {
    renderEditor();
    const dialog = await openPicker();

    for (const entry of FIVE) {
      fireEvent.click(within(dialog).getByRole("button", { name: `Añadir ${entry.title}` }));
    }

    expect(dialog).toBeInTheDocument();
    expect(rowsBehindSheet()).toHaveLength(7);
    expect(rowsBehindSheet().slice(2).map((row) => row.textContent?.replace(/\s+/g, " "))).toEqual([
      expect.stringMatching(/^03\s*Rebote y salida.*12'/),
      expect.stringMatching(/^04\s*Tres calles seguidas.*10'/),
      expect.stringMatching(/^05\s*Pase y va.*8'/),
      expect.stringMatching(/^06\s*Presión a dos.*15'/),
      expect.stringMatching(/^07\s*Salida rápida.*5'/),
    ]);
  });

  it("con la sesión llena, el selector no deja añadir y dice por qué", async () => {
    // Dos filas más cinco de ejercicios de arriba: se parte de 28 para que quepan dos.
    const items = Array.from({ length: 28 }, (_, index) => item(index + 1, `Bloque ${index + 1}`, 5));
    mocks.findDrills.mockResolvedValue(ok(FIVE));
    renderEditor({ items });
    const dialog = await openPicker();
    expect(within(dialog).queryByText("Una sesión tiene como máximo 30 ejercicios.")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Añadir Rebote y salida" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Añadir Tres calles seguidas" }));

    expect(rowsBehindSheet()).toHaveLength(30);
    expect(within(dialog).getByText("Una sesión tiene como máximo 30 ejercicios.")).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Añadir Pase y va" })).toBeDisabled();
  });

  it("con 30 ítems, el selector se puede abrir para ver el motivo, y todos sus botones están cerrados", async () => {
    const items = Array.from({ length: 30 }, (_, index) => item(index + 1, `Bloque ${index + 1}`, 5));
    renderEditor({ items });

    const dialog = await openPicker();

    expect(within(dialog).getByText("Una sesión tiene como máximo 30 ejercicios.")).toBeVisible();
    for (const entry of FIVE) expect(within(dialog).getByRole("button", { name: `Añadir ${entry.title}` })).toBeDisabled();
  });

  it("con cambios sin guardar, abrir la ficha de un ejercicio desde el selector pregunta antes de salir", async () => {
    renderEditor();
    const dialog = await openPicker();
    fireEvent.click(within(dialog).getByRole("button", { name: "Añadir Rebote y salida" }));

    let prevented = false;
    const cut = (event: Event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", cut);
    fireEvent.click(within(dialog).getAllByRole("link")[0]);
    document.removeEventListener("click", cut);

    expect(prevented).toBe(true);
    expect(await screen.findByRole("alertdialog", { name: "¿Salir sin guardar?" })).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("sin cambios, abrir la ficha desde el selector navega sin preguntar", async () => {
    renderEditor();
    const dialog = await openPicker();

    let prevented = true;
    const cut = (event: Event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", cut);
    fireEvent.click(within(dialog).getAllByRole("link")[0]);
    document.removeEventListener("click", cut);

    expect(prevented).toBe(false);
    expect(leaveDialog()).not.toBeInTheDocument();
  });
});

describe("PracticeEditor · encaje con la franja", () => {
  /** Cualquier frase de encaje, esté donde esté. */
  const anyFit = () => screen.queryByText(/^Te (sobran?|pasas) \d+ min$/);

  it("le da al constructor lo que dura la franja: junto al total dice si lo montado encaja", () => {
    renderEditor({}, { slotMinutes: 75 });

    // Los dos ejercicios de la sesión suman 25 minutos.
    const notice = screen.getByText("Te sobran 50 min");
    expect(screen.getByText("Total").parentElement?.nextElementSibling).toBe(notice);

    changeItems();
    expect(screen.getByText("Te sobran 45 min")).toBeInTheDocument();
  });

  it("si lo montado se pasa de la franja, lo dice, y se puede guardar igual", async () => {
    renderEditor({}, { slotMinutes: 20 });
    expect(screen.getByText("Te pasas 5 min")).toBeInTheDocument();

    changeItems();
    expect(screen.getByText("Te pasas 10 min")).toBeInTheDocument();
    click("Guardar sesión");

    await screen.findByText("Sesión guardada.");
    expect(mocks.savePracticeItems).toHaveBeenCalledTimes(1);
  });

  it("sin franja no dice nada: es lo que pasaba antes de que la página la diera", () => {
    renderEditor();

    expect(anyFit()).not.toBeInTheDocument();
    changeItems();
    expect(anyFit()).not.toBeInTheDocument();
  });

  it("con la sesión sin ejercicios tampoco, aunque haya franja", () => {
    renderEditor({ items: [] }, { slotMinutes: 75 });

    expect(anyFit()).not.toBeInTheDocument();
  });
});

describe("PracticeEditor · proponer entrenamiento", () => {
  const EDIT = `${DETAIL}/edit`;
  const UNSAVED = "Propuesta sin guardar. Revísala, cámbiala y guarda.";
  const NOTHING = "No hay ejercicios en la biblioteca para esta sesión. Móntala tú.";

  function proposed(n: number, title: string, phase: string, minutes: number, hint: string): ProposedItem {
    return { drillId: `00000000-0000-4000-8000-0000000000d${n}`, title, phase, minutes, hint };
  }

  // Una propuesta de una hora: 10 + 35 + 15.
  const WARMUP = proposed(1, "Rueda de pases en carrera", "Activación", 10, "Pase · 2 puntos clave");
  const MAIN = proposed(2, "Rebote y salida", "Rebote", 35, "Rebote · 3 puntos clave · 1 variante");
  const GAME = proposed(3, "Tres contra tres", "Competición", 15, "Transición · 1 variante");
  const PROPOSED = [WARMUP, MAIN, GAME];

  /** Lo que devuelve la acción: los ítems y los minutos que no ha podido cubrir. */
  const proposal = (items: ProposedItem[] = PROPOSED): ActionResult<Proposal> => ok({ items, uncoveredMinutes: 0 });

  /** El editor de una sesión recién creada: aún sin ejercicios. */
  const renderEmpty = (extra: Parameters<typeof renderEditor>[1] = {}) => renderEditor({ items: [] }, extra);

  const proposeButton = () => screen.queryByRole("button", { name: "Proponer entrenamiento" });
  const propose = () => click("Proponer entrenamiento");
  /** Las filas del constructor, que con la sesión vacía no hay ninguna. */
  const builderRows = () => screen.queryAllByRole("listitem").filter((row) => row.hasAttribute("data-row"));
  /** El nombre del botón que abre una fila propuesta: la fase, el título y la línea de por qué está. */
  const rowName = (entry: ProposedItem) => `${entry.phase} ${entry.title} ${entry.hint}`;
  /** La región de estado del editor, donde salen los avisos de la propuesta. */
  const noticeRegion = () =>
    screen.getAllByRole("status").find((region) => region.hasAttribute("data-proposal-notice")) as HTMLElement;
  const calls = () => mocks.proposePracticeItems.mock.calls.length;

  /**
   * Llega como quien viene de «Proponer entrenamiento» en la sesión nueva: con el parámetro en
   * la URL. El `location` de pega de este fichero no tiene ruta, así que aquí vuelve el de jsdom.
   */
  function arrive(search = "?propose=1") {
    vi.unstubAllGlobals();
    window.history.replaceState({ from: "new" }, "", `${EDIT}${search}`);
  }

  beforeEach(() => {
    mocks.proposePracticeItems.mockResolvedValue(proposal());
  });
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  describe("cuándo se ofrece", () => {
    it("con la sesión sin ejercicios hay «Proponer entrenamiento», encima de «Añadir ejercicio»", () => {
      renderEmpty();

      const button = proposeButton() as HTMLElement;
      expect(button).toBeEnabled();
      expect(button).toHaveClass("border-line-strong", "w-full");
      expect(button).not.toHaveClass("bg-brand-accent");
      expect(button).toHaveAttribute("type", "button");
      expect(button.compareDocumentPosition(screen.getByRole("button", { name: "Añadir ejercicio" }))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(
        screen
          .getByRole("button", { name: "Añadir ejercicio" })
          .compareDocumentPosition(screen.getByRole("button", { name: "Añadir bloque libre" })),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it("con ejercicios no: proponer encima de lo montado lo mezclaría", () => {
      renderEditor();

      expect(rows()).toHaveLength(2);
      expect(proposeButton()).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Añadir ejercicio" })).toBeInTheDocument();
    });

    it("no pide nada hasta que se pulsa, y de entrada no hay ningún aviso", () => {
      renderEmpty();

      expect(mocks.proposePracticeItems).not.toHaveBeenCalled();
      // La región de los avisos está ya en el árbol, vacía: así se anuncia lo que entre en ella.
      expect(noticeRegion()).toBeEmptyDOMElement();
      expect(button("Guardar sesión")).toBeDisabled();
    });

    it("aparece al quitar el último ejercicio, y desaparece al añadir uno a mano", () => {
      renderEditor({ items: [item(1, "Rueda de pases", 10)] });
      expect(proposeButton()).not.toBeInTheDocument();

      click("Rueda de pases");
      click("Quitar Rueda de pases");
      expect(proposeButton()).toBeInTheDocument();

      click("Añadir bloque libre");
      expect(proposeButton()).not.toBeInTheDocument();
      expect(mocks.proposePracticeItems).not.toHaveBeenCalled();
    });
  });

  describe("al pulsarlo", () => {
    it("pide la propuesta de esa sesión de ese club", async () => {
      renderEmpty();

      propose();

      await waitFor(() => expect(builderRows()).toHaveLength(3));
      expect(mocks.proposePracticeItems).toHaveBeenCalledTimes(1);
      expect(mocks.proposePracticeItems).toHaveBeenCalledWith("club-a", { eventId: EVENT });
    });

    it("los ejercicios propuestos entran en la lista, en su orden, con su fase, su título, sus minutos y por qué están", async () => {
      renderEmpty();

      propose();

      await waitFor(() => expect(builderRows()).toHaveLength(3));
      PROPOSED.forEach((entry, index) => {
        const row = builderRows()[index];
        const toggle = within(row).getByRole("button", { name: rowName(entry) });
        expect(row.textContent?.slice(0, 2), entry.title).toBe(`0${index + 1}`);
        // La fase arriba, el título y, debajo, la línea de por qué está ahí.
        expect(Array.from(toggle.children).map((child) => child.textContent), entry.title).toEqual([
          entry.phase,
          entry.title,
          entry.hint,
        ]);
        expect(toggle, entry.title).toHaveAttribute("aria-expanded", "false");
        expect(within(row).getByText(`${entry.minutes}'`), entry.title).toBeInTheDocument();
      });
      expect(screen.getByText("Total").parentElement).toHaveTextContent("60'");
      // Ya no es una sesión vacía.
      expect(screen.queryByText("Esta sesión aún no tiene ejercicios")).not.toBeInTheDocument();
    });

    it("entran sin guardar: lo dice un aviso sobre la lista, en la región que ya estaba", async () => {
      renderEmpty();
      const region = noticeRegion();

      propose();

      const notice = await screen.findByText(UNSAVED);
      expect(region).toContainElement(notice);
      expect(notice.compareDocumentPosition(builderRows()[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      // Es un aviso, no un error.
      expect(notice).toHaveClass("text-body", "text-ink-2");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText(NOTHING)).not.toBeInTheDocument();
      // Nada se ha escrito todavía.
      expect(mocks.savePracticeItems).not.toHaveBeenCalled();
      expect(screen.queryByText("Sesión guardada.")).not.toBeInTheDocument();
    });

    it("«Guardar sesión» queda activo, y salir pregunta como con cualquier otro cambio", async () => {
      renderEmpty();
      expect(button("Guardar sesión")).toBeDisabled();
      expect(unloadAsks()).toBe(false);

      propose();
      await screen.findByText(UNSAVED);

      expect(button("Guardar sesión")).toBeEnabled();
      expect(unloadAsks()).toBe(true);
      expect(clickBack()).toBe("se queda");
      expect(leaveDialog()).toBeInTheDocument();
      click("Seguir editando");
      expect(builderRows()).toHaveLength(3);
    });

    it("con la propuesta en la lista, «Proponer entrenamiento» desaparece: la lista ya no está vacía", async () => {
      renderEmpty();

      propose();
      await screen.findByText(UNSAVED);

      expect(proposeButton()).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Añadir ejercicio" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Añadir bloque libre" })).toBeEnabled();
    });

    it("mientras llega, el botón espera: un segundo toque no pide otra", async () => {
      const pending = deferred<Proposal>();
      mocks.proposePracticeItems.mockReturnValue(pending.promise);
      renderEmpty();

      propose();

      await waitFor(() => expect(proposeButton()).toBeDisabled());
      fireEvent.click(proposeButton() as HTMLElement);
      expect(calls()).toBe(1);
      expect(builderRows()).toHaveLength(0);
      expect(noticeRegion()).toBeEmptyDOMElement();

      pending.finish(proposal());
      await screen.findByText(UNSAVED);
      expect(builderRows()).toHaveLength(3);
      expect(calls()).toBe(1);
    });

    it("lo propuesto se revisa como cualquier fila: se cambia, se quita y el aviso sigue mientras no se guarde", async () => {
      renderEmpty();
      propose();
      await screen.findByText(UNSAVED);

      click(`Más minutos, ${MAIN.title}`);
      expect(builderRows()[1]).toHaveTextContent("40'");
      click(rowName(GAME));
      click(`Quitar ${GAME.title}`);

      expect(builderRows()).toHaveLength(2);
      expect(screen.getByText("Total").parentElement).toHaveTextContent("50'");
      expect(screen.getByText(UNSAVED)).toBeInTheDocument();
      expect(button("Guardar sesión")).toBeEnabled();
    });

    it("con la franja de la sesión, dice también si la propuesta encaja", async () => {
      renderEmpty({ slotMinutes: 75 });

      propose();
      await screen.findByText(UNSAVED);

      // La propuesta dura 60 minutos.
      expect(screen.getByText("Te sobran 15 min")).toBeInTheDocument();
    });
  });

  describe("al guardar la sesión", () => {
    it("se envían los ejercicios propuestos, sin la línea de por qué están", async () => {
      renderEmpty();
      propose();
      await screen.findByText(UNSAVED);

      click("Guardar sesión");
      await screen.findByText("Sesión guardada.");

      expect(mocks.savePracticeItems).toHaveBeenCalledTimes(1);
      const [slug, input] = mocks.savePracticeItems.mock.calls[0];
      expect(slug).toBe("club-a");
      expect(input).toMatchObject({ eventId: EVENT, expectedUpdatedAt: UPDATED_AT });
      expect(input.items).toStrictEqual(
        PROPOSED.map(({ drillId, title, phase, minutes }) => ({ drillId, title, phase, minutes, notes: null })),
      );
      expect(JSON.stringify(input)).not.toContain("puntos clave");
    });

    it("el aviso de «Propuesta sin guardar» desaparece, y salir ya no pregunta", async () => {
      renderEmpty();
      propose();
      await screen.findByText(UNSAVED);

      click("Guardar sesión");
      await screen.findByText("Sesión guardada.");

      expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
      expect(noticeRegion()).toBeEmptyDOMElement();
      expect(builderRows()).toHaveLength(3);
      expect(unloadAsks()).toBe(false);
      expect(clickBack()).toBe("navega");
    });

    it("si guardar falla, el aviso sigue: la propuesta sigue sin guardar", async () => {
      mocks.savePracticeItems.mockResolvedValue(fail("SAVE_FAILED"));
      renderEmpty();
      propose();
      await screen.findByText(UNSAVED);

      click("Guardar sesión");
      await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED);

      expect(screen.getByText(UNSAVED)).toBeInTheDocument();
      expect(builderRows()).toHaveLength(3);
      expect(unloadAsks()).toBe(true);
    });
  });

  describe("propuesta vacía", () => {
    beforeEach(() => {
      mocks.proposePracticeItems.mockResolvedValue(proposal([]));
    });

    it("dice que no hay ejercicios en la biblioteca, y no deja nada que guardar", async () => {
      renderEmpty();
      const region = noticeRegion();

      propose();

      const notice = await screen.findByText(NOTHING);
      expect(region).toContainElement(notice);
      expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(builderRows()).toHaveLength(0);
      expect(button("Guardar sesión")).toBeDisabled();
      expect(unloadAsks()).toBe(false);
    });

    it("se puede volver a proponer", async () => {
      renderEmpty();
      propose();
      await screen.findByText(NOTHING);

      await waitFor(() => expect(proposeButton()).toBeEnabled());
      propose();

      await waitFor(() => expect(calls()).toBe(2));
      expect(mocks.proposePracticeItems).toHaveBeenLastCalledWith("club-a", { eventId: EVENT });
      await waitFor(() => expect(proposeButton()).toBeEnabled());
      expect(screen.getByText(NOTHING)).toBeInTheDocument();
    });

    it("si a la segunda hay ejercicios, entran y el aviso pasa a ser el de «sin guardar»", async () => {
      mocks.proposePracticeItems.mockResolvedValueOnce(proposal([])).mockResolvedValueOnce(proposal());
      renderEmpty();
      propose();
      await screen.findByText(NOTHING);
      await waitFor(() => expect(proposeButton()).toBeEnabled());

      propose();

      await screen.findByText(UNSAVED);
      expect(screen.queryByText(NOTHING)).not.toBeInTheDocument();
      expect(builderRows()).toHaveLength(3);
    });

    it("lo dice hasta que se añade algo a mano", async () => {
      renderEmpty();
      propose();
      await screen.findByText(NOTHING);

      click("Añadir bloque libre");

      expect(screen.queryByText(NOTHING)).not.toBeInTheDocument();
      // Lo añadido a mano no es una propuesta.
      expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
      expect(builderRows()).toHaveLength(1);
    });
  });

  describe("si la acción falla", () => {
    it("dice por qué, sobre el botón, y el botón sigue disponible", async () => {
      mocks.proposePracticeItems.mockResolvedValue(fail("NOT_FOUND"));
      renderEmpty();

      propose();

      const alert = (await screen.findByText(ACTION_ERROR_COPY.NOT_FOUND)).closest('[role="alert"]') as HTMLElement;
      expect(alert.nextElementSibling).toBe(proposeButton());
      await waitFor(() => expect(proposeButton()).toBeEnabled());
      expect(builderRows()).toHaveLength(0);
      expect(noticeRegion()).toBeEmptyDOMElement();
      expect(button("Guardar sesión")).toBeDisabled();
      expect(unloadAsks()).toBe(false);
    });

    it("el aviso no se lleva el foco: sale justo encima del botón que se acaba de pulsar", async () => {
      mocks.proposePracticeItems.mockResolvedValue(fail("SAVE_FAILED"));
      renderEmpty();

      propose();

      const alert = (await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).closest('[role="alert"]');
      // El foco, si se lo llevara, llegaría en un efecto, un turno después de pintarse.
      await waitFor(() => expect(proposeButton()).toBeEnabled());
      expect(alert).not.toHaveFocus();
    });

    it("al volver a pedirla se quita el aviso y, si va bien, entra la propuesta", async () => {
      mocks.proposePracticeItems.mockResolvedValueOnce(fail("SAVE_FAILED")).mockResolvedValueOnce(proposal());
      renderEmpty();
      propose();
      await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED);
      await waitFor(() => expect(proposeButton()).toBeEnabled());

      propose();

      await screen.findByText(UNSAVED);
      expect(calls()).toBe(2);
      expect(builderRows()).toHaveLength(3);
      expect(screen.queryByText(ACTION_ERROR_COPY.SAVE_FAILED)).not.toBeInTheDocument();
    });

    it("si se cae la llamada, es un SAVE_FAILED sin el mensaje del error", async () => {
      mocks.proposePracticeItems.mockRejectedValue(new Error("fallo de red con datos internos"));
      renderEmpty();

      propose();

      expect(await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).toBeInTheDocument();
      expect(screen.queryByText(/fallo de red/)).not.toBeInTheDocument();
      await waitFor(() => expect(proposeButton()).toBeEnabled());
    });
  });

  describe("lo que deja de ser una propuesta", () => {
    it("guardada, un cambio posterior ya no es «Propuesta sin guardar»", async () => {
      renderEmpty();
      propose();
      await screen.findByText(UNSAVED);
      click("Guardar sesión");
      await screen.findByText("Sesión guardada.");

      click(`Más minutos, ${MAIN.title}`);

      expect(button("Guardar sesión")).toBeEnabled();
      expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
    });

    it("quitada entera, lo que se monte después a mano no es la propuesta", async () => {
      mocks.proposePracticeItems.mockResolvedValue(proposal([WARMUP]));
      renderEmpty();
      propose();
      await screen.findByText(UNSAVED);

      click(rowName(WARMUP));
      click(`Quitar ${WARMUP.title}`);
      click("Añadir bloque libre");

      expect(builderRows()).toHaveLength(1);
      expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
    });

    it("el aviso de que no había ejercicios no vuelve al quitar lo que se añadió a mano", async () => {
      mocks.proposePracticeItems.mockResolvedValue(proposal([]));
      renderEmpty();
      propose();
      await screen.findByText(NOTHING);

      click("Añadir bloque libre");
      click("Quitar Sin título");

      expect(builderRows()).toHaveLength(0);
      expect(screen.queryByText(NOTHING)).not.toBeInTheDocument();
      expect(proposeButton()).toBeEnabled();
    });

    it("si mientras llega se añade algo a mano, la propuesta se descarta: no se mezcla", async () => {
      const pending = deferred<Proposal>();
      mocks.proposePracticeItems.mockReturnValue(pending.promise);
      renderEmpty();
      propose();
      await waitFor(() => expect(proposeButton()).toBeDisabled());

      click("Añadir bloque libre");
      expect(proposeButton()).not.toBeInTheDocument();
      pending.finish(proposal());

      // Se da tiempo a que la respuesta se aplique: no debe añadir nada.
      await waitFor(() => expect(mocks.proposePracticeItems).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(builderRows()).toHaveLength(1);
      expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
    });

    it("con ejercicios al entrar, `autoPropose` no vale ni después de vaciar la lista", () => {
      renderEditor({}, { autoPropose: true });
      expect(calls()).toBe(0);

      for (const row of rows()) {
        fireEvent.click(within(row).getAllByRole("button").find((b) => b.dataset.control === "toggle") as HTMLElement);
        fireEvent.click(screen.getByRole("button", { name: /^Quitar / }));
      }

      expect(builderRows()).toHaveLength(0);
      expect(proposeButton()).toBeEnabled();
      expect(calls()).toBe(0);
    });
  });

  describe("con `autoPropose` (quien llega de «Proponer entrenamiento» en la sesión nueva)", () => {
    it("pide la propuesta sola al montarse, sin pulsar nada, y la carga como sin guardar", async () => {
      renderEmpty({ autoPropose: true });

      await screen.findByText(UNSAVED);
      expect(mocks.proposePracticeItems).toHaveBeenCalledTimes(1);
      expect(mocks.proposePracticeItems).toHaveBeenCalledWith("club-a", { eventId: EVENT });
      expect(builderRows()).toHaveLength(3);
      expect(within(builderRows()[0]).getByRole("button", { name: rowName(WARMUP) })).toBeInTheDocument();
      expect(button("Guardar sesión")).toBeEnabled();
      expect(mocks.savePracticeItems).not.toHaveBeenCalled();
    });

    it("mientras llega, el botón está a la vista pero espera", async () => {
      const pending = deferred<Proposal>();
      mocks.proposePracticeItems.mockReturnValue(pending.promise);
      renderEmpty({ autoPropose: true });

      await waitFor(() => expect(proposeButton()).toBeDisabled());
      expect(calls()).toBe(1);

      pending.finish(proposal());
      await screen.findByText(UNSAVED);
      expect(calls()).toBe(1);
    });

    it("gasta el parámetro: quita `?propose=1` de la URL, en la misma entrada del historial", async () => {
      arrive();
      const entries = window.history.length;
      const replaceState = vi.spyOn(window.history, "replaceState");
      expect(window.location.search).toBe("?propose=1");

      renderEmpty({ autoPropose: true });
      // Ya al montarse, sin esperar a la propuesta: recargar mientras llega no la pide otra vez.
      expect(window.location.search).toBe("");

      await screen.findByText(UNSAVED);
      expect(window.location.pathname).toBe(EDIT);
      expect(window.location.search).toBe("");
      expect(window.history.length).toBe(entries);
      // Con `null`, y no con el estado que había: ese lleva la marca del router de Next, que
      // entonces no se enteraría del cambio y devolvería el parámetro al siguiente guardado.
      // Con `null` el router copia su estado y se queda con la URL nueva.
      expect(replaceState).toHaveBeenCalledTimes(1);
      expect(replaceState).toHaveBeenCalledWith(null, "", EDIT);
    });

    it("una sola vez: volver a pintar el editor no la pide de nuevo", async () => {
      const view = renderEmpty({ autoPropose: true });
      await screen.findByText(UNSAVED);

      view.rerender(
        <PracticeEditor
          clubSlug="club-a"
          practice={practice({ items: [] })}
          options={{ teams: [{ id: TEAM, name: "Equipo A" }], focusAreas: [{ id: FOCUS, name: "Rebote" }] }}
          drillFocusAreas={DRILL_FOCUS_AREAS}
          initialValues={VALUES}
          autoPropose
        />,
      );

      expect(calls()).toBe(1);
      expect(builderRows()).toHaveLength(3);
    });

    it("tampoco si después se quitan todos los ejercicios y el botón vuelve a salir; a mano sí", async () => {
      mocks.proposePracticeItems.mockResolvedValue(proposal([WARMUP]));
      renderEmpty({ autoPropose: true });
      await screen.findByText(UNSAVED);
      expect(proposeButton()).not.toBeInTheDocument();

      click(rowName(WARMUP));
      click(`Quitar ${WARMUP.title}`);

      expect(builderRows()).toHaveLength(0);
      expect(proposeButton()).toBeEnabled();
      expect(calls()).toBe(1);
      // Vacía otra vez y sin nada pendiente: ni propuesta sin guardar ni aviso de salida.
      expect(screen.queryByText(UNSAVED)).not.toBeInTheDocument();
      expect(unloadAsks()).toBe(false);

      propose();
      await screen.findByText(UNSAVED);
      expect(calls()).toBe(2);
      expect(builderRows()).toHaveLength(1);
    });

    it("con la biblioteca vacía lo dice, no insiste sola y deja pedirla a mano", async () => {
      mocks.proposePracticeItems.mockResolvedValue(proposal([]));
      renderEmpty({ autoPropose: true });

      await screen.findByText(NOTHING);
      await waitFor(() => expect(proposeButton()).toBeEnabled());
      expect(calls()).toBe(1);

      propose();
      await waitFor(() => expect(calls()).toBe(2));
      await waitFor(() => expect(proposeButton()).toBeEnabled());
    });

    it("si falla, lo dice y no reintenta sola: el botón queda para pedirla", async () => {
      mocks.proposePracticeItems.mockResolvedValue(fail("SAVE_FAILED"));
      renderEmpty({ autoPropose: true });

      expect(await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).toBeInTheDocument();
      await waitFor(() => expect(proposeButton()).toBeEnabled());
      expect(calls()).toBe(1);
      expect(builderRows()).toHaveLength(0);
    });

    it("sin `autoPropose` no la pide al montarse ni toca la URL", () => {
      arrive();
      const replaceState = vi.spyOn(window.history, "replaceState");

      renderEmpty();

      expect(mocks.proposePracticeItems).not.toHaveBeenCalled();
      expect(replaceState).not.toHaveBeenCalled();
      expect(window.location.search).toBe("?propose=1");
      expect(proposeButton()).toBeEnabled();
    });

    it("pedirla a mano tampoco toca la URL", async () => {
      arrive("");
      const replaceState = vi.spyOn(window.history, "replaceState");
      renderEmpty();

      propose();
      await screen.findByText(UNSAVED);

      expect(replaceState).not.toHaveBeenCalled();
      expect(window.location.pathname).toBe(EDIT);
    });
  });
});
