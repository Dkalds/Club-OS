import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { TeamSchedule } from "@/modules/calendar/types";

const mocks = vi.hoisted(() => ({
  createTeamSchedule: vi.fn(),
  updateTeamSchedule: vi.fn(),
  deleteTeamSchedule: vi.fn(),
}));

vi.mock("@/modules/calendar/actions", () => ({
  createTeamSchedule: mocks.createTeamSchedule,
  updateTeamSchedule: mocks.updateTeamSchedule,
  deleteTeamSchedule: mocks.deleteTeamSchedule,
}));

import { ScheduleSection } from "./schedule-section";

// Datos neutros y ficticios: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM = uuid(1);
const VENUE_1 = uuid(11);
const VENUE_2 = uuid(12);
const TUESDAY = uuid(21);
const THURSDAY = uuid(22);
const NEW_ID = uuid(170);

const VENUES = [
  { id: VENUE_1, name: "Pista 1" },
  { id: VENUE_2, name: "Pista 2" },
];

/** Martes con pista y jueves sin ella, de lunes a domingo como los entrega la lectura. */
const SCHEDULES: TeamSchedule[] = [
  { id: TUESDAY, teamId: TEAM, weekday: 2, startTime: "18:00", durationMinutes: 75, venueId: VENUE_1, venueName: "Pista 1" },
  { id: THURSDAY, teamId: TEAM, weekday: 4, startTime: "19:30", durationMinutes: 60, venueId: null, venueName: null },
];

const TUESDAY_LABEL = "Martes · 18:00–19:15 · Pista 1";
const THURSDAY_LABEL = "Jueves · 19:30–20:30";

function renderSection(props: Partial<Parameters<typeof ScheduleSection>[0]> = {}) {
  return render(<ScheduleSection clubSlug="club-a" teamId={TEAM} schedules={SCHEDULES} venues={VENUES} {...props} />);
}

/** La fila de un horario, por su etiqueta. */
const row = (label: string) => screen.getByText(label).closest("li") as HTMLElement;
/** El alta: su encabezado y su formulario. */
const addBlock = () => screen.getByRole("heading", { level: 3, name: "Añadir un horario" }).parentElement as HTMLElement;

const setIn = (scope: HTMLElement, label: string, value: string) =>
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });
const add = () => fireEvent.click(within(addBlock()).getByRole("button", { name: "Añadir horario" }));
const saveIn = (scope: HTMLElement) => fireEvent.click(within(scope).getByRole("button", { name: "Guardar" }));

const DURATION = "Duración (min)";
const DUPLICATE = "Ese equipo ya entrena ese día a esa hora.";
const DURATION_RANGE = "La duración tiene que estar entre 15 y 240 minutos.";
const CANNOT_ADD =
  "No se puede añadir este horario: la temporada del equipo ya ha acabado o tiene demasiados horarios.";
const CLOSED = "La temporada de este equipo ya ha acabado: no se añaden horarios.";

const REMOVE_TITLE = "¿Quitar este horario?";
const askRemove = (scope: HTMLElement) => fireEvent.click(within(scope).getByRole("button", { name: "Quitar horario" }));
async function confirmRemove() {
  const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
  fireEvent.click(within(dialog).getByRole("button", { name: "Quitar horario" }));
}

/** El `<h2>` del apartado, al que va el foco cuando se quita un horario. */
const sectionHeading = () => screen.getByRole("heading", { level: 2, name: "Horario semanal" });
/** La región de estado del apartado: dice lo que pasó al quitar un horario, cuya fila ya no está. */
const removedStatus = () => sectionHeading().nextElementSibling as HTMLElement;

/** Una acción que no acaba hasta que el test lo dice. */
function deferred<T>() {
  let finish: (result: ActionResult<T>) => void = () => {};
  const promise = new Promise<ActionResult<T>>((resolve) => {
    finish = resolve;
  });
  return { promise, finish: (result: ActionResult<T>) => finish(result) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createTeamSchedule.mockResolvedValue(ok({ id: NEW_ID, created: 32 }));
  mocks.updateTeamSchedule.mockResolvedValue(ok({ moved: 5 }));
  mocks.deleteTeamSchedule.mockResolvedValue(ok({ removed: 3 }));
});

describe("ScheduleSection · los horarios del equipo", () => {
  it("es el bloque «Horario semanal», con una fila por horario en el orden en que llegan", () => {
    renderSection();

    expect(screen.getByRole("heading", { level: 2, name: "Horario semanal" })).toBeInTheDocument();
    const list = screen.getAllByRole("list")[0] as HTMLElement;
    expect(Array.from(list.children).map((item) => item.querySelector("summary")?.textContent)).toEqual([
      TUESDAY_LABEL,
      THURSDAY_LABEL,
    ]);
  });

  it("cada fila está plegada: una línea con el día, la franja y la pista, que se despliega para cambiarla", () => {
    renderSection();

    for (const label of [TUESDAY_LABEL, THURSDAY_LABEL]) {
      const details = row(label).querySelector("details");
      expect(details).not.toBeNull();
      expect(details).not.toHaveAttribute("open");
      expect(details?.querySelector("summary")?.className).toContain("min-h-14");
      expect(within(details?.querySelector("summary") as HTMLElement).getByText(label)).toBeInTheDocument();
    }
  });

  it("sin horarios lo dice, y el alta sigue ahí", () => {
    renderSection({ schedules: [] });

    expect(
      screen.getByText("Aún no tiene horarios. Con uno, sus entrenamientos de la temporada se crean solos."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(within(addBlock()).getByRole("button", { name: "Añadir horario" })).toBeInTheDocument();
  });

  it("desplegada, la fila empieza con lo que tiene guardado", () => {
    renderSection();

    const tuesday = row(TUESDAY_LABEL);
    expect(within(tuesday).getByLabelText("Día")).toHaveValue("2");
    expect(within(tuesday).getByLabelText("Hora")).toHaveValue("18:00");
    expect(within(tuesday).getByLabelText(DURATION)).toHaveValue(75);
    expect(within(tuesday).getByLabelText("Pista")).toHaveValue(VENUE_1);

    const thursday = row(THURSDAY_LABEL);
    expect(within(thursday).getByLabelText("Día")).toHaveValue("4");
    expect(within(thursday).getByLabelText("Hora")).toHaveValue("19:30");
    expect(within(thursday).getByLabelText(DURATION)).toHaveValue(60);
    expect(within(thursday).getByLabelText("Pista")).toHaveValue("");
  });

  it("los campos dicen sus opciones, su rango y de qué reloj es la hora", () => {
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    expect(within(within(tuesday).getByLabelText("Día")).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ]);
    const time = within(tuesday).getByLabelText("Hora");
    expect(time).toHaveAttribute("type", "time");
    expect(time).toHaveAccessibleDescription("La del reloj del club.");
    const duration = within(tuesday).getByLabelText(DURATION);
    expect(duration).toHaveAttribute("type", "number");
    expect(duration).toHaveAttribute("min", "15");
    expect(duration).toHaveAttribute("max", "240");
    expect(within(within(tuesday).getByLabelText("Pista")).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Sin pista",
      "Pista 1",
      "Pista 2",
    ]);
  });

  it("sin pistas en el club, la pista solo puede ser «Sin pista»", () => {
    renderSection({ venues: [] });

    expect(
      within(within(addBlock()).getByLabelText("Pista")).getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Sin pista"]);
  });

  it("explica qué pasa con los entrenamientos al guardar", () => {
    renderSection({ schedules: [SCHEDULES[0] as TeamSchedule] });

    expect(
      within(row(TUESDAY_LABEL)).getByText(
        "Al guardar se mueven sus entrenamientos futuros que siguen en su sitio. El que alguien cambió a mano se queda donde está.",
      ),
    ).toBeInTheDocument();
  });
});

describe("ScheduleSection · añadir un horario", () => {
  it("propone el lunes a las 18:00, 75 minutos y sin pista", () => {
    renderSection();
    const block = addBlock();

    expect(within(block).getByLabelText("Día")).toHaveValue("1");
    expect(within(block).getByLabelText("Hora")).toHaveValue("18:00");
    expect(within(block).getByLabelText(DURATION)).toHaveValue(75);
    expect(within(block).getByLabelText("Pista")).toHaveValue("");
  });

  it("«Añadir horario» no es el primario de la página, y lo describe su encabezado", () => {
    renderSection();

    const button = within(addBlock()).getByRole("button", { name: "Añadir horario" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).not.toHaveClass("bg-brand-accent");
    expect(button).toHaveAccessibleDescription("Añadir un horario");
  });

  it("sin tocar nada manda los valores propuestos, para este equipo: el día y la duración como números y sin pista como `null`", async () => {
    renderSection();

    add();

    await screen.findByText(/^Horario creado/);
    expect(mocks.createTeamSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.createTeamSchedule).toHaveBeenCalledWith("club-a", {
      teamId: TEAM,
      weekday: 1,
      time: "18:00",
      durationMinutes: 75,
      venueId: null,
    });
    expect(mocks.updateTeamSchedule).not.toHaveBeenCalled();
  });

  it("manda lo elegido: el día, la hora, la duración y la pista por su id", async () => {
    renderSection();
    const block = addBlock();

    setIn(block, "Día", "6");
    setIn(block, "Hora", "10:30");
    setIn(block, DURATION, "90");
    setIn(block, "Pista", VENUE_2);
    add();

    await screen.findByText(/^Horario creado/);
    expect(mocks.createTeamSchedule).toHaveBeenCalledWith("club-a", {
      teamId: TEAM,
      weekday: 6,
      time: "10:30",
      durationMinutes: 90,
      venueId: VENUE_2,
    });
  });

  it.each([
    [32, "Horario creado: 32 entrenamientos hasta el final de la temporada."],
    [1, "Horario creado: 1 entrenamiento hasta el final de la temporada."],
    [0, "Horario creado. No había entrenamientos que crear."],
  ])("al acabar dice cuántos entrenamientos ha creado: con %i, «%s»", async (created, message) => {
    mocks.createTeamSchedule.mockResolvedValue(ok({ id: NEW_ID, created }));
    renderSection();

    add();

    const confirmation = await screen.findByText(message);
    expect(confirmation.closest('[role="status"]')).not.toBeNull();
    expect(addBlock()).toContainElement(confirmation);
  });

  it("tras crear, el foco vuelve al día: el alta queda lista para el horario siguiente", async () => {
    renderSection();

    add();

    await screen.findByText(/^Horario creado/);
    await waitFor(() => expect(within(addBlock()).getByLabelText("Día")).toHaveFocus());
  });

  it("si no se crea, el foco no se mueve al día", async () => {
    mocks.createTeamSchedule.mockResolvedValue(fail("INVALID", { time: DUPLICATE }));
    renderSection();

    add();

    await within(addBlock()).findByText(DUPLICATE);
    expect(within(addBlock()).getByLabelText("Día")).not.toHaveFocus();
  });

  // Fijado tal como está: tras crear, el alta no vuelve a los valores propuestos.
  it("tras crear, el formulario conserva lo elegido", async () => {
    renderSection();
    const block = addBlock();

    setIn(block, "Día", "6");
    setIn(block, "Hora", "10:30");
    add();

    await screen.findByText(/^Horario creado/);
    expect(within(block).getByLabelText("Día")).toHaveValue("6");
    expect(within(block).getByLabelText("Hora")).toHaveValue("10:30");
  });

  it("el aviso de creado se quita al tocar un campo", async () => {
    renderSection();

    add();
    await screen.findByText(/^Horario creado/);
    setIn(addBlock(), "Día", "3");

    expect(screen.queryByText(/^Horario creado/)).not.toBeInTheDocument();
  });

  it("la duración vacía no viaja como 0: viaja como «no es un número», y la rechaza la acción", async () => {
    mocks.createTeamSchedule.mockResolvedValue(fail("INVALID", { durationMinutes: DURATION_RANGE }));
    renderSection();

    setIn(addBlock(), DURATION, "");
    add();

    await screen.findByText(DURATION_RANGE);
    const sent = mocks.createTeamSchedule.mock.calls[0][1];
    expect(sent.durationMinutes).toBeNaN();
    expect(sent.durationMinutes).not.toBe(0);
    expect(sent.weekday).toBe(1);
  });

  it("entrada inválida: el aviso general y cada error bajo su campo, enlazado", async () => {
    mocks.createTeamSchedule.mockResolvedValue(
      fail("INVALID", {
        weekday: "Elige un día de la semana.",
        time: "Escribe una hora válida.",
        durationMinutes: DURATION_RANGE,
        venueId: ACTION_ERROR_COPY.NOT_FOUND,
      }),
    );
    renderSection();
    const block = addBlock();

    add();

    expect(await within(block).findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message] of [
      ["Día", "Elige un día de la semana."],
      ["Hora", "Escribe una hora válida."],
      [DURATION, DURATION_RANGE],
      ["Pista", ACTION_ERROR_COPY.NOT_FOUND],
    ] as const) {
      const field = within(block).getByLabelText(label);
      const text = within(block).getByText(message);
      expect(field, label).toHaveAttribute("aria-invalid", "true");
      expect(field.getAttribute("aria-describedby")?.split(" "), label).toContain(text.id);
    }
    expect(screen.queryByText(CANNOT_ADD)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Horario creado/)).not.toBeInTheDocument();
  });

  it("el mismo día a la misma hora que otro se dice bajo la hora", async () => {
    mocks.createTeamSchedule.mockResolvedValue(fail("INVALID", { time: DUPLICATE }));
    renderSection();
    const block = addBlock();

    add();

    const message = await within(block).findByText(DUPLICATE);
    expect(within(block).getByLabelText("Hora").getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
    // El error es del alta: las filas de los horarios que ya había no lo enseñan.
    expect(within(row(TUESDAY_LABEL)).queryByText(DUPLICATE)).not.toBeInTheDocument();
  });

  it("un INVALID sin campo es de la base: lo dice un aviso propio, y no «Revisa los campos marcados»", async () => {
    mocks.createTeamSchedule.mockResolvedValue(fail("INVALID"));
    renderSection();

    add();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(CANNOT_ADD);
    expect(addBlock()).toContainElement(alert);
    expect(screen.queryByText(ACTION_ERROR_COPY.INVALID)).not.toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    for (const label of ["Día", "Hora", DURATION, "Pista"]) {
      expect(within(addBlock()).getByLabelText(label), label).not.toHaveAttribute("aria-invalid");
    }
  });

  it("el aviso propio se quita al reintentar con éxito", async () => {
    mocks.createTeamSchedule.mockResolvedValueOnce(fail("INVALID"));
    renderSection();

    add();
    await screen.findByText(CANNOT_ADD);
    add();

    await screen.findByText(/^Horario creado/);
    expect(screen.queryByText(CANNOT_ADD)).not.toBeInTheDocument();
  });

  it.each(["NOT_FOUND", "SAVE_FAILED"] as const)("un %s se dice con su texto de siempre", async (error) => {
    mocks.createTeamSchedule.mockResolvedValue(fail(error));
    renderSection();

    add();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY[error]);
    expect(screen.queryByText(CANNOT_ADD)).not.toBeInTheDocument();
  });

  it("mientras añade, el botón espera y no se lanza un segundo alta", async () => {
    const action = deferred<{ id: string; created: number }>();
    mocks.createTeamSchedule.mockReturnValue(action.promise);
    renderSection();

    add();
    await waitFor(() => expect(within(addBlock()).getByRole("button", { name: "Añadir horario" })).toBeDisabled());
    add();
    expect(mocks.createTeamSchedule).toHaveBeenCalledTimes(1);
    // Cada fila lleva su propia espera: las de los horarios que ya había siguen disponibles.
    expect(within(row(TUESDAY_LABEL)).getByRole("button", { name: "Guardar" })).toBeEnabled();

    action.finish(ok({ id: NEW_ID, created: 32 }));
    await screen.findByText(/^Horario creado/);
  });

  it("si la acción lanza, lo dice sin el error técnico y no pierde lo elegido", async () => {
    mocks.createTeamSchedule.mockRejectedValue(new Error("fetch failed"));
    renderSection();

    setIn(addBlock(), "Hora", "10:30");
    add();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(within(addBlock()).getByLabelText("Hora")).toHaveValue("10:30");
  });
});

describe("ScheduleSection · con la temporada acabada (`closed`)", () => {
  it("no ofrece el alta, y dice por qué", () => {
    renderSection({ closed: true });

    expect(screen.getByText(CLOSED)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Añadir un horario" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir horario" })).not.toBeInTheDocument();
  });

  it("los horarios que tuviera se ven, y se pueden quitar", () => {
    renderSection({ closed: true });

    expect(within(row(TUESDAY_LABEL)).getByRole("button", { name: "Quitar horario" })).toBeInTheDocument();
    expect(within(row(THURSDAY_LABEL)).getByRole("button", { name: "Quitar horario" })).toBeInTheDocument();
  });

  it("sin horarios, dice las dos cosas: que no tiene y que ya no se añaden", () => {
    renderSection({ closed: true, schedules: [] });

    expect(screen.getByText(/^Aún no tiene horarios\./)).toBeInTheDocument();
    expect(screen.getByText(CLOSED)).toBeInTheDocument();
  });

  it("abierta (por defecto) no dice nada de la temporada", () => {
    renderSection();

    expect(screen.queryByText(CLOSED)).not.toBeInTheDocument();
  });
});

describe("ScheduleSection · cambiar un horario", () => {
  it("«Guardar» es secondary y lo describe la línea del horario", () => {
    renderSection();

    const button = within(row(TUESDAY_LABEL)).getByRole("button", { name: "Guardar" });
    expect(button).toHaveClass("border-line-strong");
    expect(button).toHaveAccessibleDescription(TUESDAY_LABEL);
  });

  it("guarda lo elegido con el id del horario, sin el equipo", async () => {
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    setIn(tuesday, "Día", "3");
    setIn(tuesday, "Hora", "19:00");
    setIn(tuesday, DURATION, "60");
    setIn(tuesday, "Pista", VENUE_2);
    saveIn(tuesday);

    await within(tuesday).findByText(/^Horario cambiado/);
    expect(mocks.updateTeamSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.updateTeamSchedule).toHaveBeenCalledWith("club-a", {
      id: TUESDAY,
      weekday: 3,
      time: "19:00",
      durationMinutes: 60,
      venueId: VENUE_2,
    });
    expect(mocks.createTeamSchedule).not.toHaveBeenCalled();
  });

  it("guardar sin tocar nada manda lo que había", async () => {
    renderSection();
    const thursday = row(THURSDAY_LABEL);

    saveIn(thursday);

    await within(thursday).findByText(/^Horario cambiado/);
    expect(mocks.updateTeamSchedule).toHaveBeenCalledWith("club-a", {
      id: THURSDAY,
      weekday: 4,
      time: "19:30",
      durationMinutes: 60,
      venueId: null,
    });
  });

  it("quitarle la pista la manda como `null`", async () => {
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    setIn(tuesday, "Pista", "");
    saveIn(tuesday);

    await within(tuesday).findByText(/^Horario cambiado/);
    expect(mocks.updateTeamSchedule.mock.calls[0][1].venueId).toBeNull();
  });

  it.each([
    // «Actualizados», no «con la hora nueva»: también cuenta el que solo cambia de pista.
    [5, "Horario cambiado: 5 entrenamientos actualizados."],
    [1, "Horario cambiado: 1 entrenamiento actualizado."],
    [0, "Horario cambiado."],
  ])("al acabar dice cuántos entrenamientos se han actualizado: con %i, «%s»", async (moved, message) => {
    mocks.updateTeamSchedule.mockResolvedValue(ok({ moved }));
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    saveIn(tuesday);

    const confirmation = await screen.findByText(message);
    expect(tuesday).toContainElement(confirmation);
    expect(confirmation.closest('[role="status"]')).not.toBeNull();
  });

  it("el aviso es de su fila: ni la otra fila ni el alta lo enseñan, y se quita al tocar un campo", async () => {
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    saveIn(tuesday);
    await within(tuesday).findByText(/^Horario cambiado/);

    expect(within(row(THURSDAY_LABEL)).queryByText(/^Horario cambiado/)).not.toBeInTheDocument();
    expect(within(addBlock()).queryByText(/^Horario cambiado/)).not.toBeInTheDocument();

    setIn(tuesday, "Hora", "19:00");
    expect(screen.queryByText(/^Horario cambiado/)).not.toBeInTheDocument();
  });

  it("la duración vacía tampoco viaja como 0", async () => {
    mocks.updateTeamSchedule.mockResolvedValue(fail("INVALID", { durationMinutes: DURATION_RANGE }));
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    setIn(tuesday, DURATION, "");
    saveIn(tuesday);

    await within(tuesday).findByText(DURATION_RANGE);
    expect(mocks.updateTeamSchedule.mock.calls[0][1].durationMinutes).toBeNaN();
  });

  it("el mismo día a la misma hora que otro se dice bajo la hora de esa fila", async () => {
    mocks.updateTeamSchedule.mockResolvedValue(fail("INVALID", { time: DUPLICATE }));
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    setIn(tuesday, "Día", "4");
    setIn(tuesday, "Hora", "19:30");
    saveIn(tuesday);

    const message = await within(tuesday).findByText(DUPLICATE);
    const time = within(tuesday).getByLabelText("Hora");
    expect(time).toHaveAttribute("aria-invalid", "true");
    expect(time.getAttribute("aria-describedby")?.split(" ")).toContain(message.id);
    expect(within(tuesday).getByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    expect(within(row(THURSDAY_LABEL)).queryByText(DUPLICATE)).not.toBeInTheDocument();
  });

  // Fijado tal como está: en una fila, un INVALID sin campo (lo que la función rechaza y el
  // esquema no paró) no tiene aviso propio como en el alta: dice «Revisa los campos marcados.»
  // sin marcar ninguno.
  it("un INVALID sin campo dice el aviso general de siempre", async () => {
    mocks.updateTeamSchedule.mockResolvedValue(fail("INVALID"));
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    saveIn(tuesday);

    expect(await within(tuesday).findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.INVALID);
    expect(screen.queryByText(CANNOT_ADD)).not.toBeInTheDocument();
  });

  it("si el horario ya no existe (NOT_FOUND), lo dice en su fila", async () => {
    mocks.updateTeamSchedule.mockResolvedValue(fail("NOT_FOUND"));
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    saveIn(tuesday);

    expect(await within(tuesday).findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
  });

  it("repintar con datos nuevos (la acción revalida) pone la línea al día sin pisar lo que se está eligiendo", () => {
    const { rerender } = renderSection();

    setIn(row(TUESDAY_LABEL), "Hora", "20:00");
    rerender(
      <ScheduleSection
        clubSlug="club-a"
        teamId={TEAM}
        schedules={[{ ...(SCHEDULES[0] as TeamSchedule), startTime: "19:00" }, SCHEDULES[1] as TeamSchedule]}
        venues={VENUES}
      />,
    );

    const moved = row("Martes · 19:00–20:15 · Pista 1");
    expect(within(moved).getByLabelText("Hora")).toHaveValue("20:00");
  });

  it("mientras guarda, «Guardar» y «Quitar horario» de esa fila esperan, y no se guarda dos veces", async () => {
    const action = deferred<{ moved: number }>();
    mocks.updateTeamSchedule.mockReturnValue(action.promise);
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    saveIn(tuesday);
    await waitFor(() => expect(within(tuesday).getByRole("button", { name: "Guardar" })).toBeDisabled());
    expect(within(tuesday).getByRole("button", { name: "Quitar horario" })).toBeDisabled();
    saveIn(tuesday);
    expect(mocks.updateTeamSchedule).toHaveBeenCalledTimes(1);
    expect(within(row(THURSDAY_LABEL)).getByRole("button", { name: "Guardar" })).toBeEnabled();

    action.finish(ok({ moved: 0 }));
    await within(tuesday).findByText("Horario cambiado.");
  });
});

describe("ScheduleSection · quitar un horario", () => {
  it("«Quitar horario» va en `danger` y dice de cuál habla", () => {
    renderSection();

    const button = within(row(THURSDAY_LABEL)).getByRole("button", { name: "Quitar horario" });
    expect(button).toHaveClass("border-danger", "text-danger");
    expect(button).toHaveAccessibleDescription(THURSDAY_LABEL);
  });

  it("pregunta antes de quitar, diciendo qué se borra y qué se queda, y aún no quita", async () => {
    renderSection();

    askRemove(row(TUESDAY_LABEL));

    const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
    expect(dialog).toHaveAccessibleDescription(
      "Se borran sus entrenamientos futuros que nadie ha preparado ni movido. Los demás se quedan como sesiones sueltas. No se puede deshacer.",
    );
    expect(within(dialog).getByRole("button", { name: "Quitar horario" })).toHaveClass("border-danger");
    expect(within(dialog).getByRole("button", { name: "Volver" })).toBeInTheDocument();
    expect(mocks.deleteTeamSchedule).not.toHaveBeenCalled();
  });

  it("al confirmar, quita ese horario y cierra el diálogo", async () => {
    renderSection();

    askRemove(row(THURSDAY_LABEL));
    await confirmRemove();

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deleteTeamSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.deleteTeamSchedule).toHaveBeenCalledWith("club-a", { id: THURSDAY });
    expect(mocks.updateTeamSchedule).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  describe("lo que dice al quitarlo", () => {
    it("la región de estado del apartado está desde el principio, vacía, justo bajo su encabezado", () => {
      renderSection();

      expect(removedStatus()).toHaveAttribute("role", "status");
      expect(removedStatus()).toBeEmptyDOMElement();
    });

    it.each([
      [3, "Horario quitado: 3 entrenamientos borrados."],
      [1, "Horario quitado: 1 entrenamiento borrado."],
      [0, "Horario quitado. No tenía entrenamientos sin preparar."],
    ])("dice cuántos entrenamientos se han borrado: con %i, «%s»", async (removed, message) => {
      mocks.deleteTeamSchedule.mockResolvedValue(ok({ removed }));
      renderSection();

      askRemove(row(THURSDAY_LABEL));
      await confirmRemove();

      await waitFor(() => expect(removedStatus()).toHaveTextContent(message));
      expect(removedStatus().textContent).toBe(message);
    });

    it("lo dice el apartado y no la fila, que va a desaparecer", async () => {
      renderSection();
      const thursday = row(THURSDAY_LABEL);

      askRemove(thursday);
      await confirmRemove();

      await waitFor(() => expect(removedStatus()).not.toBeEmptyDOMElement());
      expect(thursday).not.toContainElement(removedStatus());
      expect(within(thursday).queryByText(/^Horario quitado/)).not.toBeInTheDocument();
    });

    it("el encabezado del apartado puede recibir el foco sin entrar en el orden del tabulador", () => {
      renderSection();

      expect(sectionHeading()).toHaveAttribute("tabindex", "-1");
    });

    // La página se repinta sin la fila a la vez que llega el resultado de la acción.
    it("al desaparecer la fila, el foco va al encabezado del apartado", async () => {
      const view = renderSection();
      mocks.deleteTeamSchedule.mockImplementation(async () => {
        view.rerender(
          <ScheduleSection clubSlug="club-a" teamId={TEAM} schedules={[SCHEDULES[0] as TeamSchedule]} venues={VENUES} />,
        );
        return ok({ removed: 3 });
      });

      askRemove(row(THURSDAY_LABEL));
      await confirmRemove();

      await waitFor(() => expect(removedStatus()).toHaveTextContent("Horario quitado: 3 entrenamientos borrados."));
      expect(screen.queryByText(THURSDAY_LABEL)).not.toBeInTheDocument();
      await waitFor(() => expect(sectionHeading()).toHaveFocus());
    });

    it("si no se puede quitar, no dice que se ha quitado", async () => {
      mocks.deleteTeamSchedule.mockResolvedValue(fail("NOT_FOUND"));
      renderSection();
      const tuesday = row(TUESDAY_LABEL);

      askRemove(tuesday);
      await confirmRemove();

      await within(tuesday).findByRole("alert");
      expect(removedStatus()).toBeEmptyDOMElement();
      expect(sectionHeading()).not.toHaveFocus();
    });

    it("el aviso se quita al añadir otro horario", async () => {
      renderSection();

      askRemove(row(THURSDAY_LABEL));
      await confirmRemove();
      await waitFor(() => expect(removedStatus()).not.toBeEmptyDOMElement());
      add();

      await screen.findByText(/^Horario creado/);
      expect(removedStatus()).toBeEmptyDOMElement();
    });

    it("quitar un horario retira el aviso de «Horario creado» del alta: lo último que pasó es lo que se lee", async () => {
      renderSection();

      add();
      await screen.findByText(/^Horario creado/);
      askRemove(row(THURSDAY_LABEL));
      await confirmRemove();

      await waitFor(() => expect(removedStatus()).not.toBeEmptyDOMElement());
      expect(screen.queryByText(/^Horario creado/)).not.toBeInTheDocument();
    });
  });

  it("«Volver» cierra el diálogo sin quitar nada", async () => {
    renderSection();

    askRemove(row(TUESDAY_LABEL));
    const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
    fireEvent.click(within(dialog).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.deleteTeamSchedule).not.toHaveBeenCalled();
  });

  it("si no se puede (NOT_FOUND), cierra el diálogo y lo dice en su fila", async () => {
    mocks.deleteTeamSchedule.mockResolvedValue(fail("NOT_FOUND"));
    renderSection();
    const tuesday = row(TUESDAY_LABEL);

    askRemove(tuesday);
    await confirmRemove();

    expect(await within(tuesday).findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.NOT_FOUND);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("si la acción lanza, el diálogo no se queda abierto y sale el aviso", async () => {
    mocks.deleteTeamSchedule.mockRejectedValue(new Error("fetch failed"));
    renderSection();

    askRemove(row(TUESDAY_LABEL));
    await confirmRemove();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("mientras quita, los botones esperan y no se quita dos veces", async () => {
    const action = deferred<{ removed: number }>();
    mocks.deleteTeamSchedule.mockReturnValue(action.promise);
    renderSection();

    askRemove(row(TUESDAY_LABEL));
    const dialog = await screen.findByRole("alertdialog", { name: REMOVE_TITLE });
    const confirm = within(dialog).getByRole("button", { name: "Quitar horario" });
    fireEvent.click(confirm);
    await waitFor(() => expect(confirm).toBeDisabled());
    fireEvent.click(confirm);
    expect(mocks.deleteTeamSchedule).toHaveBeenCalledTimes(1);

    action.finish(ok({ removed: 3 }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });
});
