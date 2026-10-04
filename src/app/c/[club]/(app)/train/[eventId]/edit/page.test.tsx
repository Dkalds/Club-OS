import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeDetail } from "@/modules/practice/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  getPractice: vi.fn(),
  getPracticeFormOptions: vi.fn(),
  getFocusAreas: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/practice/queries", () => ({
  getPractice: mocks.getPractice,
  getPracticeFormOptions: mocks.getPracticeFormOptions,
}));
vi.mock("@/modules/drills/queries", () => ({ getFocusAreas: mocks.getFocusAreas }));
// Como los de verdad: `notFound()` y `redirect()` cortan el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
// El editor es de cliente y tiene su propio test: aquí solo importa qué recibe.
vi.mock("../../_components/practice-editor", () => ({
  PracticeEditor: (props: unknown) => <div data-testid="editor" data-props={JSON.stringify(props)} />,
}));

import EditPracticePage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TEAMS = [{ id: "t-1", name: "Equipo A" }];
const FOCUS_AREAS = [
  { id: "f-1", name: "Rebote" },
  { id: "f-2", name: "Transición" },
];

/** Los objetivos como los lee la biblioteca: con su slug, que es lo que filtra el selector de ejercicios. */
const DRILL_FOCUS_AREAS = [
  { id: "f-1", slug: "rebote", name: "Rebote" },
  { id: "f-2", slug: "transicion", name: "Transición" },
];

function practice(overrides: Partial<PracticeDetail> = {}): PracticeDetail {
  return {
    eventId: "e-1",
    planId: "p-1",
    teamId: "t-1",
    teamName: "Equipo A",
    status: "scheduled",
    // Martes 6 oct, de 18:00 a 19:15 en Madrid (CEST).
    startsAt: "2026-10-06T16:00:00.000Z",
    endsAt: "2026-10-06T17:15:00.000Z",
    slotLabel: "Martes 6 oct · 18:00–19:15",
    location: "Pabellón 2",
    title: "Salida de presión",
    primaryFocus: { id: "f-1", name: "Rebote" },
    secondaryFocus: { id: "f-2", name: "Transición" },
    notes: "Llevar los petos azules.",
    items: [
      { id: "i-1", drillId: null, drillVisible: false, title: "Calentamiento", phase: "Activación", minutes: 10, notes: null },
    ],
    standards: [],
    updatedAt: "2026-10-04T10:00:00.123456+00:00",
    canEdit: true,
    ...overrides,
  };
}

function props(eventId = "e-1") {
  return { params: Promise.resolve({ club: "club-a", eventId }), searchParams: Promise.resolve({}) };
}

/** Lo que la página le pasó al editor. */
function editorProps() {
  return JSON.parse(screen.getByTestId("editor").getAttribute("data-props") ?? "{}");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getPractice.mockResolvedValue(practice());
  mocks.getPracticeFormOptions.mockResolvedValue({ teams: TEAMS, focusAreas: FOCUS_AREAS });
  mocks.getFocusAreas.mockResolvedValue(DRILL_FOCUS_AREAS);
});

describe("/train/[eventId]/edit, acceso", () => {
  it("sin club recibe el 404 y no lee ninguna sesión", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(EditPracticePage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getPractice).not.toHaveBeenCalled();
    expect(mocks.getPracticeFormOptions).not.toHaveBeenCalled();
    expect(mocks.getFocusAreas).not.toHaveBeenCalled();
  });

  // Review Focus 1: una sesión de otro equipo o de otro club no llega (RLS): el mismo 404.
  it("una sesión que no existe, o que no se ve, es el 404, sin leer las opciones", async () => {
    mocks.getPractice.mockResolvedValue(null);

    await expect(EditPracticePage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getPracticeFormOptions).not.toHaveBeenCalled();
  });

  it.each(["player", "guardian"] as const)("un %s no gestiona sesiones: 404, aunque la vea", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));
    mocks.getPractice.mockResolvedValue(practice({ canEdit: false }));

    await expect(EditPracticePage(props())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getPracticeFormOptions).not.toHaveBeenCalled();
  });

  // Review Focus 5: una sesión hecha o cancelada no se edita.
  it.each(["done", "cancelled"] as const)("una sesión %s lleva a su detalle, sin editor", async (status) => {
    mocks.getPractice.mockResolvedValue(practice({ status, canEdit: false }));

    await expect(EditPracticePage(props())).rejects.toThrow("REDIRECT /c/club-a/train/e-1");

    expect(mocks.getPracticeFormOptions).not.toHaveBeenCalled();
  });

  it("quien no gestiona sesiones recibe el 404 también ante una sesión cerrada: no se le dice que existe", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("player"));
    mocks.getPractice.mockResolvedValue(practice({ status: "done", canEdit: false }));

    await expect(EditPracticePage(props())).rejects.toThrow("NOT_FOUND");
  });

  it("si no se puede leer, lanza: lo recoge `error.tsx`", async () => {
    mocks.getPractice.mockRejectedValue(new Error("practice.detail: fallo"));

    await expect(EditPracticePage(props())).rejects.toThrow("practice.detail: fallo");
  });

  it("si no se pueden leer las opciones, lanza también", async () => {
    mocks.getPracticeFormOptions.mockRejectedValue(new Error("practice.focus-areas: fallo"));

    await expect(EditPracticePage(props())).rejects.toThrow("practice.focus-areas: fallo");
  });

  it("si no se pueden leer los objetivos del selector de ejercicios, lanza también", async () => {
    mocks.getFocusAreas.mockRejectedValue(new Error("drills.focus-areas: fallo"));

    await expect(EditPracticePage(props())).rejects.toThrow("drills.focus-areas: fallo");
  });
});

describe("/train/[eventId]/edit, editor", () => {
  it.each(["coach", "admin"] as const)("un %s abre el editor de la sesión de la URL", async (role) => {
    const ctx = clubContext(role);
    mocks.getClubContext.mockResolvedValue(ctx);

    render(await EditPracticePage(props("e-9")));

    expect(mocks.getPractice).toHaveBeenCalledWith(ctx, "e-9");
    expect(mocks.getPracticeFormOptions).toHaveBeenCalledWith(ctx);
    expect(screen.getByTestId("editor")).toBeInTheDocument();
  });

  it("le da el club, la sesión entera y lo que el formulario ofrece para elegir", async () => {
    render(await EditPracticePage(props()));

    expect(editorProps().clubSlug).toBe("club-a");
    expect(editorProps().practice).toEqual(practice());
    expect(editorProps().options).toEqual({ teams: TEAMS, focusAreas: FOCUS_AREAS });
  });

  it("le da al selector de ejercicios los objetivos del club con su slug, leídos con el contexto del club", async () => {
    const ctx = clubContext("coach");
    mocks.getClubContext.mockResolvedValue(ctx);

    render(await EditPracticePage(props()));

    expect(mocks.getFocusAreas).toHaveBeenCalledWith(ctx);
    expect(editorProps().drillFocusAreas).toEqual(DRILL_FOCUS_AREAS);
  });

  it("los datos del formulario salen de la sesión, con la fecha y la hora en el reloj del club", async () => {
    render(await EditPracticePage(props()));

    expect(editorProps().initialValues).toEqual({
      teamId: "t-1",
      title: "Salida de presión",
      date: "2026-10-06",
      time: "18:00",
      durationMinutes: "75",
      primaryFocusId: "f-1",
      secondaryFocusId: "f-2",
      location: "Pabellón 2",
      notes: "Llevar los petos azules.",
    });
  });

  it("la duración es la de la franja, no la suma de los ejercicios", async () => {
    mocks.getPractice.mockResolvedValue(
      practice({ startsAt: "2026-10-06T16:00:00.000Z", endsAt: "2026-10-06T17:00:00.000Z" }),
    );

    render(await EditPracticePage(props()));

    // La sesión tiene un ejercicio de 10 minutos y una franja de una hora.
    expect(editorProps().initialValues.durationMinutes).toBe("60");
  });

  it("una sesión de última hora del día sale en el día del club, no en el de UTC", async () => {
    // 22:30 UTC del 6 de octubre: en Madrid ya es el 7, a las 00:30.
    mocks.getPractice.mockResolvedValue(
      practice({ startsAt: "2026-10-06T22:30:00.000Z", endsAt: "2026-10-06T23:30:00.000Z" }),
    );

    render(await EditPracticePage(props()));

    expect(editorProps().initialValues).toMatchObject({ date: "2026-10-07", time: "00:30" });
  });

  it("sin objetivos, lugar ni notas, esos campos van vacíos", async () => {
    mocks.getPractice.mockResolvedValue(
      practice({ primaryFocus: null, secondaryFocus: null, location: null, notes: null }),
    );

    render(await EditPracticePage(props()));

    expect(editorProps().initialValues).toMatchObject({
      primaryFocusId: "",
      secondaryFocusId: "",
      location: "",
      notes: "",
    });
  });
});
