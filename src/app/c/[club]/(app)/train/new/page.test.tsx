import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), getPracticeFormOptions: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/practice/queries", () => ({ getPracticeFormOptions: mocks.getPracticeFormOptions }));
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

import NewPracticePage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TEAMS = [
  { id: "t-1", name: "Equipo A" },
  { id: "t-2", name: "Equipo B" },
];
const FOCUS_AREAS = [{ id: "f-1", name: "Rebote" }];

function props() {
  return { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve({}) };
}

/** Lo que la página le pasó al formulario. */
function formProps() {
  return JSON.parse(screen.getByTestId("form").getAttribute("data-props") ?? "{}");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getPracticeFormOptions.mockResolvedValue({ teams: TEAMS, focusAreas: FOCUS_AREAS });
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
  it("el único <h1> es «Nueva sesión», y va después de la vuelta a Entrenar", async () => {
    render(await NewPracticePage(props()));

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const title = screen.getByRole("heading", { level: 1, name: "Nueva sesión" });
    const back = screen.getByRole("link", { name: "Entrenar" });
    expect(back).toHaveAttribute("href", "/c/club-a/train");
    expect(back.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(title.compareDocumentPosition(screen.getByTestId("form"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("le da al formulario el club, los equipos y los objetivos que leyó", async () => {
    render(await NewPracticePage(props()));

    expect(formProps().clubSlug).toBe("club-a");
    expect(formProps().options).toEqual({ teams: TEAMS, focusAreas: FOCUS_AREAS });
    expect(formProps().edit).toBeUndefined();
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
});

describe("/train/new, sin equipos", () => {
  beforeEach(() => {
    mocks.getPracticeFormOptions.mockResolvedValue({ teams: [], focusAreas: FOCUS_AREAS });
  });

  it("dice que aún no está en ningún equipo y ofrece volver a Entrenar, sin formulario", async () => {
    render(await NewPracticePage(props()));

    expect(screen.getByRole("heading", { level: 2, name: "Aún no estás en ningún equipo" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Entrenar" })).toHaveAttribute("href", "/c/club-a/train");
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });

  it("sigue teniendo un solo <h1>, «Nueva sesión», con su vuelta a Entrenar", async () => {
    render(await NewPracticePage(props()));

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Nueva sesión" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrenar" })).toHaveAttribute("href", "/c/club-a/train");
  });
});
