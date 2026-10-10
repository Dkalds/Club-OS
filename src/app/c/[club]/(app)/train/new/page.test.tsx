import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  getPracticeFormOptions: vi.fn(),
  getTeamDefaults: vi.fn(),
  getTemplate: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/practice/queries", () => ({
  getPracticeFormOptions: mocks.getPracticeFormOptions,
  getTeamDefaults: mocks.getTeamDefaults,
}));
vi.mock("@/modules/practice/template-queries", () => ({ getTemplate: mocks.getTemplate }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
// El formulario es de cliente y tiene su propio test: aquí solo importa qué recibe.
vi.mock("../_components/practice-form", () => ({
  PracticeForm: (props: unknown) => <div data-testid="form" data-props={JSON.stringify(props)} />,
}));
vi.mock("../_components/template-delete", () => ({
  TemplateDelete: (props: unknown) => <div data-testid="template-delete" data-props={JSON.stringify(props)} />,
}));

import NewPracticePage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TEAMS = [
  { id: "t-1", name: "Equipo A" },
  { id: "t-2", name: "Equipo B" },
];
const FOCUS_AREAS = [{ id: "f-1", name: "Rebote" }];
/** Lo de siempre: ningún equipo tiene sesiones anteriores. */
const NO_HISTORY = {
  "t-1": { time: "18:00", durationMinutes: 75, location: null },
  "t-2": { time: "18:00", durationMinutes: 75, location: null },
};
const ISO_NOW = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TEMPLATE_ID = "00000000-0000-4000-8000-0000000000c1";
const TEMPLATE = {
  id: TEMPLATE_ID,
  title: "Salida de presión",
  totalMinutes: 45,
  itemCount: 4,
  primaryFocus: { id: "f-1", name: "Rebote" },
  secondaryFocus: null,
};

function props(searchParams: Record<string, string | string[]> = {}) {
  return { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve(searchParams) };
}

/** Lo que la página le pasó al formulario. */
function formProps() {
  return JSON.parse(screen.getByTestId("form").getAttribute("data-props") ?? "{}");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getPracticeFormOptions.mockResolvedValue({ teams: TEAMS, focusAreas: FOCUS_AREAS, defaultTeamId: null });
  mocks.getTeamDefaults.mockResolvedValue(NO_HISTORY);
  mocks.getTemplate.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/train/new, acceso y lectura", () => {
  it("sin club recibe el 404 y no lee nada", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(NewPracticePage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getPracticeFormOptions).not.toHaveBeenCalled();
  });

  it.each(["player", "guardian"] as const)("un %s no gestiona sesiones: 404 sin leer nada", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));

    await expect(NewPracticePage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getPracticeFormOptions).not.toHaveBeenCalled();
  });

  it.each(["coach", "admin"] as const)("un %s entra y se leen las opciones con su contexto", async (role) => {
    const ctx = clubContext(role);
    mocks.getClubContext.mockResolvedValue(ctx);

    render(await NewPracticePage(props()));

    expect(mocks.getPracticeFormOptions).toHaveBeenCalledTimes(1);
    expect(mocks.getPracticeFormOptions).toHaveBeenCalledWith(ctx);
    expect(screen.getByTestId("form")).toBeInTheDocument();
  });

  it("si no se pueden leer las opciones, lanza: lo recoge `error.tsx`", async () => {
    mocks.getPracticeFormOptions.mockRejectedValue(new Error("practice.teams: fallo"));

    await expect(NewPracticePage(props())).rejects.toThrow("practice.teams: fallo");
  });
});

describe("/train/new, pantalla", () => {
  it("el único <h1> es «Nueva sesión», y va después de la vuelta a Sesiones", async () => {
    render(await NewPracticePage(props()));

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const title = screen.getByRole("heading", { level: 1, name: "Nueva sesión" });
    const back = screen.getByRole("link", { name: "Sesiones" });
    expect(back).toHaveAttribute("href", "/c/club-a/train");
    expect(back.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(title.compareDocumentPosition(screen.getByTestId("form"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("le da al formulario el club, los equipos y los objetivos que leyó", async () => {
    render(await NewPracticePage(props()));

    expect(formProps().clubSlug).toBe("club-a");
    expect(formProps().options).toEqual({ teams: TEAMS, focusAreas: FOCUS_AREAS, defaultTeamId: null });
    expect(formProps().edit).toBeUndefined();
    expect(formProps().template).toBeUndefined();
  });

  it("parte del primer equipo, las 18:00 y 75 minutos, sin título, objetivos ni lugar", async () => {
    render(await NewPracticePage(props()));

    expect(formProps().initial).toEqual({
      teamId: "t-1",
      title: "",
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      time: "18:00",
      durationMinutes: "75",
      primaryFocusId: "",
      secondaryFocusId: "",
      location: "",
      notes: "",
    });
  });

  it("la fecha de partida es hoy en la zona del club, no la del servidor ni la del dispositivo", async () => {
    // 22:30 UTC del 4 de octubre: en Madrid (UTC+2) ya es el 5, a las 00:30.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-04T22:30:00.000Z"));

    render(await NewPracticePage(props()));

    expect(formProps().initial.date).toBe("2026-10-05");
  });

  it("pasada la hora de partida, la fecha es mañana: la sesión no se propone en el pasado", async () => {
    // 17:00 UTC del 5 de octubre: en Madrid son las 19:00, y las 18:00 de hoy ya han pasado.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-05T17:00:00.000Z"));

    render(await NewPracticePage(props()));

    expect(formProps().initial.date).toBe("2026-10-06");
    expect(formProps().initial.time).toBe("18:00");
  });
});

describe("/train/new, lo que trae el equipo", () => {
  it("parte de la hora, la duración y el lugar de la última sesión del equipo", async () => {
    mocks.getTeamDefaults.mockResolvedValue({
      ...NO_HISTORY,
      "t-1": { time: "17:30", durationMinutes: 90, location: "Pabellón 2" },
    });

    render(await NewPracticePage(props()));

    expect(mocks.getTeamDefaults).toHaveBeenCalledWith(clubContext("coach"), TEAMS, expect.stringMatching(ISO_NOW));
    expect(formProps().initial).toMatchObject({
      teamId: "t-1",
      time: "17:30",
      durationMinutes: "90",
      location: "Pabellón 2",
    });
  });

  it("con un equipo activo, parte de él y de lo suyo", async () => {
    mocks.getPracticeFormOptions.mockResolvedValue({ teams: TEAMS, focusAreas: FOCUS_AREAS, defaultTeamId: "t-2" });
    mocks.getTeamDefaults.mockResolvedValue({
      ...NO_HISTORY,
      "t-2": { time: "19:00", durationMinutes: 60, location: null },
    });

    render(await NewPracticePage(props()));

    expect(formProps().initial).toMatchObject({ teamId: "t-2", time: "19:00", durationMinutes: "60", location: "" });
  });

  it("le da al formulario lo de todos los equipos, para cuando se cambie, con el día que le toca a su hora", async () => {
    // Las 19:00 en Madrid: las 18:00 ya han pasado (mañana) y las 20:30 no (hoy).
    vi.useFakeTimers({ now: new Date("2026-10-06T17:00:00Z") });
    mocks.getTeamDefaults.mockResolvedValue({
      "t-1": { time: "18:00", durationMinutes: 75, location: null },
      "t-2": { time: "20:30", durationMinutes: 60, location: "Pabellón 2" },
    });

    render(await NewPracticePage(props()));

    expect(formProps().teamDefaults).toEqual({
      "t-1": { time: "18:00", durationMinutes: 75, location: null, date: "2026-10-07" },
      "t-2": { time: "20:30", durationMinutes: 60, location: "Pabellón 2", date: "2026-10-06" },
    });
    expect(formProps().initial.date).toBe("2026-10-07");
  });
});

describe("/train/new, con una plantilla", () => {
  beforeEach(() => {
    mocks.getTemplate.mockResolvedValue(TEMPLATE);
  });

  it("lee la plantilla con el contexto de quien entra", async () => {
    const ctx = clubContext("coach");

    render(await NewPracticePage(props({ template: TEMPLATE_ID })));

    expect(mocks.getTemplate).toHaveBeenCalledWith(ctx, TEMPLATE_ID);
  });

  it("el formulario trae su título, sus objetivos y lo que dura", async () => {
    render(await NewPracticePage(props({ template: TEMPLATE_ID })));

    expect(formProps().template).toEqual({ id: TEMPLATE_ID });
    expect(formProps().initial).toMatchObject({
      title: "Salida de presión",
      durationMinutes: "45",
      primaryFocusId: "f-1",
      secondaryFocusId: "",
    });
  });

  it("dice qué plantilla es, con lo que dura y sus ejercicios, y vuelve a «Plantillas»", async () => {
    render(await NewPracticePage(props({ template: TEMPLATE_ID })));

    expect(screen.getByText("Salida de presión")).toBeInTheDocument();
    expect(screen.getByText("45 min · 4 ejercicios · Rebote")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plantillas" })).toHaveAttribute(
      "href",
      "/c/club-a/train?scope=templates",
    );
  });

  it("ofrece borrarla", async () => {
    render(await NewPracticePage(props({ template: TEMPLATE_ID })));

    expect(JSON.parse(screen.getByTestId("template-delete").getAttribute("data-props") ?? "{}")).toEqual({
      clubSlug: "club-a",
      templateId: TEMPLATE_ID,
    });
  });

  it("una plantilla que dura más de lo que se puede programar deja la duración del equipo", async () => {
    mocks.getTemplate.mockResolvedValue({ ...TEMPLATE, totalMinutes: 300 });

    render(await NewPracticePage(props({ template: TEMPLATE_ID })));

    expect(formProps().initial.durationMinutes).toBe("75");
  });

  it("una plantilla que no existe o no es mía da el 404, sin leer las opciones", async () => {
    mocks.getTemplate.mockResolvedValue(null);

    await expect(NewPracticePage(props({ template: TEMPLATE_ID }))).rejects.toThrow("NOT_FOUND");

    expect(mocks.getPracticeFormOptions).not.toHaveBeenCalled();
  });

  it("el parámetro repetido no es una plantilla: 404 sin consultarla", async () => {
    await expect(NewPracticePage(props({ template: [TEMPLATE_ID, TEMPLATE_ID] }))).rejects.toThrow("NOT_FOUND");

    expect(mocks.getTemplate).not.toHaveBeenCalled();
  });

  it("sin el parámetro no hay plantilla, ni aviso, ni borrado", async () => {
    render(await NewPracticePage(props()));

    expect(mocks.getTemplate).not.toHaveBeenCalled();
    expect(screen.queryByTestId("template-delete")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sesiones" })).toBeInTheDocument();
  });
});

describe("/train/new, sin equipos", () => {
  beforeEach(() => {
    mocks.getPracticeFormOptions.mockResolvedValue({ teams: [], focusAreas: FOCUS_AREAS });
  });

  it("dice que aún no está en ningún equipo y ofrece volver a Sesiones, sin formulario", async () => {
    render(await NewPracticePage(props()));

    expect(screen.getByRole("heading", { level: 2, name: "Aún no estás en ningún equipo" })).toBeInTheDocument();
    expect(screen.getByText("Cuando dirección te asigne un equipo, podrás crear sus sesiones.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Sesiones" })).toHaveAttribute("href", "/c/club-a/train");
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });

  it("sigue teniendo un solo <h1>, «Nueva sesión», con su vuelta a Sesiones", async () => {
    render(await NewPracticePage(props()));

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Nueva sesión" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sesiones" })).toHaveAttribute("href", "/c/club-a/train");
  });
});
