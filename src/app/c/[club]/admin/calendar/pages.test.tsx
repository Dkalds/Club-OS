import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamSchedule, TeamSchedules, Venue } from "@/modules/calendar/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  listSeasonSchedules: vi.fn(),
  listVenues: vi.fn(),
}));

vi.mock("@/modules/consents/queries", () => ({
  getConsentStatus: async () => ({ needsTerms: false, pendingGuardianships: [] }),
}));
vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/calendar/queries", () => ({
  listSeasonSchedules: mocks.listSeasonSchedules,
  listVenues: mocks.listVenues,
}));
// Los formularios llaman a estas acciones; aquí solo se pintan.
vi.mock("@/modules/calendar/actions", () => ({
  createVenue: vi.fn(),
  renameVenue: vi.fn(),
  deleteVenue: vi.fn(),
}));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
}));

import AdminCalendarPage from "./page";

// Datos neutros y ficticios: los tests de `src/` no pueden nombrar a ningún club (pnpm
// check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM_A = uuid(1);
const TEAM_B = uuid(2);
const TEAM_C = uuid(3);

const PARAMS = { params: Promise.resolve({ club: "club-a" }) };

function schedule(n: number, teamId: string, weekday: number, startTime: string, overrides: Partial<TeamSchedule> = {}): TeamSchedule {
  return { id: uuid(n), teamId, weekday, startTime, durationMinutes: 75, venueId: null, venueName: null, ...overrides };
}

/** Un equipo con dos horarios (uno con pista), otro con uno y otro sin ninguno. */
const TEAMS: TeamSchedules[] = [
  {
    teamId: TEAM_A,
    teamName: "Equipo A",
    categoryName: "Categoría menor",
    schedules: [
      schedule(11, TEAM_A, 2, "18:00", { venueId: uuid(31), venueName: "Pista 1" }),
      schedule(12, TEAM_A, 4, "19:30", { durationMinutes: 60 }),
    ],
  },
  { teamId: TEAM_B, teamName: "Equipo B", categoryName: "Categoría mayor", schedules: [schedule(13, TEAM_B, 6, "10:00")] },
  { teamId: TEAM_C, teamName: "Equipo C", categoryName: "Categoría mayor", schedules: [] },
];

const VENUES: Venue[] = [
  { id: uuid(31), name: "Pista 1", usedBy: ["Equipo A"] },
  { id: uuid(32), name: "Pista 2", usedBy: [] },
];

let consoleErrors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  // React avisa por consola de las claves repetidas de una lista: la salida tiene que quedar limpia.
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getClubContext.mockResolvedValue(clubContext("admin"));
  mocks.listSeasonSchedules.mockResolvedValue(TEAMS);
  mocks.listVenues.mockResolvedValue(VENUES);
});

afterEach(() => {
  expect(consoleErrors).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

/** La sección que encabeza un `<h2>` de la página. */
const section = (name: string) => screen.getByRole("heading", { level: 2, name }).closest("section") as HTMLElement;
/** La fila de un equipo: un enlace a su página en Gestión. */
const teamRow = (name: string) => within(section("Horarios de la temporada")).getByRole("link", { name: new RegExp(`^${name}`) });

describe("quién entra", () => {
  it("quien no dirige el club recibe el 404 y no se lee nada", async () => {
    for (const role of ["coach", "player", "guardian"] as const) {
      mocks.getClubContext.mockResolvedValue(clubContext(role));

      await expect(AdminCalendarPage(PARAMS)).rejects.toThrow("NOT_FOUND");
    }
    expect(mocks.listSeasonSchedules).not.toHaveBeenCalled();
    expect(mocks.listVenues).not.toHaveBeenCalled();
  });

  it("sin club recibe el mismo 404 y no se lee nada", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(AdminCalendarPage(PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.listSeasonSchedules).not.toHaveBeenCalled();
    expect(mocks.listVenues).not.toHaveBeenCalled();
  });
});

describe("/admin/calendar", () => {
  it("lee los horarios de la temporada y las pistas del club de quien administra", async () => {
    render(await AdminCalendarPage(PARAMS));

    expect(mocks.listSeasonSchedules).toHaveBeenCalledTimes(1);
    expect(mocks.listSeasonSchedules.mock.calls[0][0]).toMatchObject({
      org: { slug: "club-a" },
      membership: { role: "admin" },
    });
    expect(mocks.listVenues).toHaveBeenCalledTimes(1);
    expect(mocks.listVenues.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
  });

  it("«Calendario» es el único <h1> y dice qué recoge", async () => {
    render(await AdminCalendarPage(PARAMS));

    expect(screen.getByRole("heading", { level: 1, name: "Calendario" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByText("Los horarios de cada equipo y las pistas donde se entrena y se juega."),
    ).toBeInTheDocument();
  });

  it("tiene dos apartados, en este orden: los horarios de la temporada y las pistas", async () => {
    render(await AdminCalendarPage(PARAMS));

    const sections = screen.getAllByRole("region").map((region) => region.getAttribute("aria-labelledby"));
    expect(sections).toEqual(["calendar-schedules", "calendar-venues"]);
    expect(screen.getByRole("region", { name: "Horarios de la temporada" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pistas" })).toBeInTheDocument();
  });

  it("si los horarios no se pueden leer, lanza: lo recoge `error.tsx`", async () => {
    mocks.listSeasonSchedules.mockRejectedValue(new Error("calendar.season-schedules: no se pudo leer de la base de datos"));

    await expect(AdminCalendarPage(PARAMS)).rejects.toThrow("calendar.season-schedules");
  });

  it("si las pistas no se pueden leer, lanza también", async () => {
    mocks.listVenues.mockRejectedValue(new Error("calendar.venues: no se pudo leer de la base de datos"));

    await expect(AdminCalendarPage(PARAMS)).rejects.toThrow("calendar.venues");
  });
});

describe("/admin/calendar · horarios de la temporada", () => {
  it("una fila por equipo, en el orden en que llegan, cada una con su enlace a la página del equipo", async () => {
    render(await AdminCalendarPage(PARAMS));

    const rows = within(section("Horarios de la temporada")).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByRole("link").getAttribute("href"))).toEqual([
      `/c/club-a/admin/teams/${TEAM_A}`,
      `/c/club-a/admin/teams/${TEAM_B}`,
      `/c/club-a/admin/teams/${TEAM_C}`,
    ]);
    expect(rows.map((row) => row.querySelector(".text-body-strong")?.textContent)).toEqual([
      "Equipo A",
      "Equipo B",
      "Equipo C",
    ]);
  });

  it("los horarios de cada equipo van en su fila, una línea por horario, con el día, la franja y la pista", async () => {
    render(await AdminCalendarPage(PARAMS));

    const lines = (name: string) => [...teamRow(name).querySelectorAll(".text-body-s")].map((line) => line.textContent);
    expect(lines("Equipo A")).toEqual(["Martes · 18:00–19:15 · Pista 1", "Jueves · 19:30–20:30"]);
    expect(lines("Equipo B")).toEqual(["Sábado · 10:00–11:15"]);
  });

  it("las líneas van enteras: se parten en vez de cortarse", async () => {
    render(await AdminCalendarPage(PARAMS));

    const line = within(teamRow("Equipo A")).getByText("Martes · 18:00–19:15 · Pista 1");
    expect(line).toHaveClass("wrap-break-word");
    expect(line).not.toHaveClass("truncate");
  });

  it("la fila entera es un único enlace, con el alto de un área táctil", async () => {
    render(await AdminCalendarPage(PARAMS));

    for (const row of within(section("Horarios de la temporada")).getAllByRole("listitem")) {
      expect(within(row).getAllByRole("link")).toHaveLength(1);
      expect(within(row).getByRole("link")).toHaveClass("min-h-14");
    }
  });

  it("un equipo sin horarios dice «Sin horario»", async () => {
    render(await AdminCalendarPage(PARAMS));

    expect([...teamRow("Equipo C").querySelectorAll(".text-body-s")].map((line) => line.textContent)).toEqual([
      "Sin horario",
    ]);
    expect(teamRow("Equipo A")).not.toHaveTextContent("Sin horario");
  });

  it("dice dónde se cambian y de qué reloj son las horas", async () => {
    render(await AdminCalendarPage(PARAMS));

    expect(
      within(section("Horarios de la temporada")).getByText(
        "El horario de un equipo se añade y se cambia en su página. Las horas son las del reloj del club.",
      ),
    ).toBeInTheDocument();
  });

  it("la URL de cada equipo lleva su id, nunca su nombre", async () => {
    render(await AdminCalendarPage(PARAMS));

    for (const link of within(section("Horarios de la temporada")).getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^\/c\/club-a\/admin\/teams\/[0-9a-f-]{36}$/);
    }
  });

  it("sin equipos esta temporada lo dice y lleva a Temporada a crearlos, sin lista", async () => {
    mocks.listSeasonSchedules.mockResolvedValue([]);

    render(await AdminCalendarPage(PARAMS));

    const schedules = section("Horarios de la temporada");
    expect(
      within(schedules).getByText("Aún no hay equipos esta temporada. Créalos en Temporada para darles su horario."),
    ).toBeInTheDocument();
    // Ni otro encabezado dentro del apartado ni un segundo botón principal junto a «Crear pista».
    expect(within(schedules).getAllByRole("heading")).toHaveLength(1);
    const link = within(schedules).getByRole("link", { name: "Ir a Temporada" });
    expect(link).toHaveAttribute("href", "/c/club-a/admin/season");
    expect(link).toHaveClass("border-line-strong");
    expect(within(schedules).queryByRole("list")).not.toBeInTheDocument();
    expect(within(schedules).queryByText(/se añade y se cambia en su página/)).not.toBeInTheDocument();
  });

  it("sin equipos, las pistas siguen ahí", async () => {
    mocks.listSeasonSchedules.mockResolvedValue([]);

    render(await AdminCalendarPage(PARAMS));

    expect(within(section("Pistas")).getByRole("heading", { level: 3, name: "Pista 1" })).toBeInTheDocument();
  });
});

describe("/admin/calendar · pistas", () => {
  it("dice para qué sirven", async () => {
    render(await AdminCalendarPage(PARAMS));

    expect(
      within(section("Pistas")).getByText("Son las que se sugieren al escribir el lugar de una sesión o de un partido."),
    ).toBeInTheDocument();
  });

  it("una card por pista, en el orden en que llegan, cada una con su nombre para cambiarlo", async () => {
    render(await AdminCalendarPage(PARAMS));

    const venues = section("Pistas");
    // Las pistas y, al final, el alta: todas bajo el `<h2>` «Pistas».
    expect(within(venues).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Pista 1",
      "Pista 2",
      "Nueva pista",
    ]);
    const cards = within(within(venues).getByRole("list")).getAllByRole("listitem");
    expect(cards.map((card) => (within(card).getByLabelText("Nombre") as HTMLInputElement).value)).toEqual([
      "Pista 1",
      "Pista 2",
    ]);
  });

  it("la que usa algún horario no se puede borrar, y dice de qué equipo; la que no, sí", async () => {
    render(await AdminCalendarPage(PARAMS));

    const [used, free] = within(within(section("Pistas")).getByRole("list")).getAllByRole("listitem");
    expect(
      within(used as HTMLElement).getByText(
        "No se puede borrar: la usa el horario de Equipo A. Quítaselo o cámbiale la pista en la página del equipo.",
      ),
    ).toBeInTheDocument();
    expect(within(used as HTMLElement).queryByRole("button", { name: "Borrar pista" })).not.toBeInTheDocument();
    expect(within(free as HTMLElement).getByRole("button", { name: "Borrar pista" })).toBeInTheDocument();
  });

  it("debajo de las pistas va el alta de una nueva, con el único botón principal de la página", async () => {
    render(await AdminCalendarPage(PARAMS));

    const form = within(section("Pistas")).getByRole("form", { name: "Nueva pista" });
    expect(within(form).getByLabelText("Nombre")).toHaveValue("");
    const create = within(form).getByRole("button", { name: "Crear pista" });
    expect(create).toHaveClass("bg-brand-accent");
    const last = screen.getByRole("heading", { level: 3, name: "Pista 2" });
    expect(last.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("button").filter((button) => button.classList.contains("bg-brand-accent"))).toEqual([
      create,
    ]);
  });

  it("sin pistas lo dice, y el alta sigue ahí", async () => {
    mocks.listVenues.mockResolvedValue([]);

    render(await AdminCalendarPage(PARAMS));

    const venues = section("Pistas");
    expect(within(venues).getByText("Aún no hay pistas.")).toBeInTheDocument();
    expect(within(venues).queryByRole("list")).not.toBeInTheDocument();
    expect(within(venues).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Nueva pista",
    ]);
    expect(within(venues).getByRole("form", { name: "Nueva pista" })).toBeInTheDocument();
  });

  it("los encabezados bajan en orden: la página, sus dos apartados y, dentro de «Pistas», cada pista y el alta", async () => {
    render(await AdminCalendarPage(PARAMS));

    expect(screen.getAllByRole("heading").map((heading) => `${heading.tagName} ${heading.textContent}`)).toEqual([
      "H1 Calendario",
      "H2 Horarios de la temporada",
      "H2 Pistas",
      "H3 Pista 1",
      "H3 Pista 2",
      "H3 Nueva pista",
    ]);
  });

  it("con pistas no dice que no las hay", async () => {
    render(await AdminCalendarPage(PARAMS));

    expect(screen.queryByText("Aún no hay pistas.")).not.toBeInTheDocument();
  });
});
