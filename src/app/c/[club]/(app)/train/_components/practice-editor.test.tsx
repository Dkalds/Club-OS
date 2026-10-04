import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Link from "next/link";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok } from "@/lib/action-result";
import type { PracticeDetail, SavedPracticeItem } from "@/modules/practice/types";

const mocks = vi.hoisted(() => ({
  savePracticeItems: vi.fn(),
  updatePracticeMeta: vi.fn(),
  createPractice: vi.fn(),
  push: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("@/modules/practice/actions", () => ({
  savePracticeItems: mocks.savePracticeItems,
  updatePracticeMeta: mocks.updatePracticeMeta,
  createPractice: mocks.createPractice,
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

function item(n: number, title: string, minutes: number): SavedPracticeItem {
  return { id: `00000000-0000-4000-8000-00000000000${n}`, drillId: null, title, phase: null, minutes, notes: null };
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
    ...overrides,
  };
}

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

function renderEditor(overrides: Partial<PracticeDetail> = {}) {
  return render(
    <PracticeEditor
      clubSlug="club-a"
      practice={practice(overrides)}
      options={{ teams: [{ id: TEAM, name: "Equipo A" }], focusAreas: [{ id: FOCUS, name: "Rebote" }] }}
      initialValues={VALUES}
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
