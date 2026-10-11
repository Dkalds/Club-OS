import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamSchedule, Venue } from "@/modules/calendar/types";
import type { AdminTeam, Category, PersonSummary } from "@/modules/structure/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  getAdminTeam: vi.fn(),
  listCategories: vi.fn(),
  listPeople: vi.fn(),
  listTeamSchedules: vi.fn(),
  listVenues: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/calendar/queries", () => ({
  listTeamSchedules: mocks.listTeamSchedules,
  listVenues: mocks.listVenues,
}));
vi.mock("@/modules/calendar/actions", () => ({
  createTeamSchedule: vi.fn(),
  updateTeamSchedule: vi.fn(),
  deleteTeamSchedule: vi.fn(),
}));
vi.mock("@/modules/structure/queries", () => ({
  getAdminTeam: mocks.getAdminTeam,
  listCategories: mocks.listCategories,
  listPeople: mocks.listPeople,
}));
// Los formularios llaman a estas acciones; aquí solo se pintan.
vi.mock("@/modules/structure/actions", () => ({
  addNewPlayer: vi.fn(),
  addPlayer: vi.fn(),
  addStaff: vi.fn(),
  deleteTeam: vi.fn(),
  removePlayer: vi.fn(),
  removeStaff: vi.fn(),
  setStaffRole: vi.fn(),
  updatePlayer: vi.fn(),
  updateTeam: vi.fn(),
}));
// Como los de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
}));

import AdminTeamPage from "./[teamId]/page";

// Datos neutros y ficticios: los tests de `src/` no pueden nombrar a ningún club (pnpm
// check:guards). De las personas, solo el año de nacimiento.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM_ID = uuid(1);
const SEASON_ID = uuid(2);

const teamParams = (teamId: string) => ({ params: Promise.resolve({ club: "club-a", teamId }) });

const CATEGORIES: Category[] = [
  { id: uuid(11), name: "Categoría menor", ageBand: "U10", sort: 10, inUse: false },
  { id: uuid(12), name: "Categoría mayor", ageBand: "U12", sort: 20, inUse: true },
];

function summary(n: number, firstName: string, lastName: string, overrides: Partial<PersonSummary> = {}): PersonSummary {
  return { id: uuid(n), firstName, lastName, birthYear: null, archived: false, teams: [], ...overrides };
}

/** Quien entrena, quien juega, alguien sin equipo y alguien archivado. */
const PEOPLE: PersonSummary[] = [
  summary(21, "Cruz", "Vidal"),
  summary(22, "Ana", "Alonso", { birthYear: 2014 }),
  summary(23, "Luis", "Libre", { birthYear: 2013 }),
  summary(24, "Eva", "Archivada", { birthYear: 2013, archived: true }),
];

function team(overrides: Partial<AdminTeam> = {}): AdminTeam {
  return {
    id: TEAM_ID,
    name: "Equipo A",
    categoryId: uuid(12),
    categoryName: "Categoría mayor",
    season: { id: SEASON_ID, name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: true },
    staff: [{ personId: uuid(21), firstName: "Cruz", lastName: "Vidal", role: "head_coach" }],
    players: [
      { personId: uuid(22), firstName: "Ana", lastName: "Alonso", birthYear: 2014, jerseyNumber: 4, position: "Base" },
    ],
    ...overrides,
  };
}

const VENUES: Venue[] = [
  { id: uuid(31), name: "Pista 1", usedBy: ["Equipo A"] },
  { id: uuid(32), name: "Pista 2", usedBy: [] },
];

/** Martes y jueves, como los entrega `listTeamSchedules`: de lunes a domingo. */
const SCHEDULES: TeamSchedule[] = [
  { id: uuid(41), teamId: TEAM_ID, weekday: 2, startTime: "18:00", durationMinutes: 75, venueId: uuid(31), venueName: "Pista 1" },
  { id: uuid(42), teamId: TEAM_ID, weekday: 4, startTime: "19:30", durationMinutes: 60, venueId: null, venueName: null },
];

let consoleErrors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getClubContext.mockResolvedValue(clubContext("admin"));
  mocks.getAdminTeam.mockResolvedValue(team());
  mocks.listCategories.mockResolvedValue(CATEGORIES);
  mocks.listPeople.mockResolvedValue(PEOPLE);
  mocks.listTeamSchedules.mockResolvedValue([]);
  mocks.listVenues.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  expect(consoleErrors).not.toHaveBeenCalled();
  vi.restoreAllMocks();
});

/** El bloque que encabeza un `<h3>`: el alta del cuerpo técnico o de la plantilla. */
const block = (heading: string) => screen.getByRole("heading", { level: 3, name: heading }).parentElement as HTMLElement;
const searchIn = (scope: HTMLElement, text: string) =>
  fireEvent.change(within(scope).getByLabelText("Persona"), { target: { value: text } });

describe("quién entra", () => {
  it("quien no dirige el club recibe el 404 y no se lee nada, ni siendo de ese equipo", async () => {
    for (const role of ["coach", "player", "guardian"] as const) {
      mocks.getClubContext.mockResolvedValue(clubContext(role));

      await expect(AdminTeamPage(teamParams(TEAM_ID))).rejects.toThrow("NOT_FOUND");
    }
    expect(mocks.getAdminTeam).not.toHaveBeenCalled();
    expect(mocks.listPeople).not.toHaveBeenCalled();
    expect(mocks.listCategories).not.toHaveBeenCalled();
    expect(mocks.listTeamSchedules).not.toHaveBeenCalled();
    expect(mocks.listVenues).not.toHaveBeenCalled();
  });

  it("sin club recibe el mismo 404", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(AdminTeamPage(teamParams(TEAM_ID))).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.getAdminTeam).not.toHaveBeenCalled();
  });
});

describe("/admin/teams/[teamId] · qué equipo", () => {
  it("lee el equipo de la URL con el contexto del club de quien administra", async () => {
    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(mocks.getAdminTeam).toHaveBeenCalledTimes(1);
    expect(mocks.getAdminTeam.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
    expect(mocks.getAdminTeam.mock.calls[0][1]).toBe(TEAM_ID);
  });

  it.each([
    ["que no existe o es de otro club", uuid(77)],
    ["cuyo id no tiene forma de uuid", "no-es-un-id"],
    ["buscado por su nombre en vez de por su id", "equipo-a"],
  ])("un equipo %s es el 404", async (_case, teamId) => {
    // `getAdminTeam` devuelve null para lo que no existe, lo que no es un id y lo de otro club.
    mocks.getAdminTeam.mockResolvedValue(null);

    await expect(AdminTeamPage(teamParams(teamId))).rejects.toThrow("NOT_FOUND");
    expect(mocks.getAdminTeam.mock.calls[0][1]).toBe(teamId);
  });
});

describe("/admin/teams/[teamId] · lo que pinta", () => {
  it("su nombre es el título, con su categoría y su temporada, y se vuelve a esa temporada", async () => {
    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Equipo A");
    expect(screen.getByText("Categoría mayor · 2026/27")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Temporada 2026/27" })).toHaveAttribute(
      "href",
      `/c/club-a/admin/season/${SEASON_ID}`,
    );
    // De la temporada actual no hay nada más que decir.
    expect(screen.queryByText("Otra temporada")).not.toBeInTheDocument();
  });

  it("un nombre largo y sin espacios se parte en vez de ensanchar la pantalla", async () => {
    mocks.getAdminTeam.mockResolvedValue(team({ name: "x".repeat(60) }));
    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("min-w-0", "wrap-break-word");
  });

  it("un equipo de una temporada que no es la actual lo dice", async () => {
    const past = team().season;
    mocks.getAdminTeam.mockResolvedValue(team({ season: { ...past, name: "2025/26", isCurrent: false } }));
    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(screen.getByText("Otra temporada")).toBeInTheDocument();
    expect(screen.getByText("Categoría mayor · 2025/26")).toBeInTheDocument();
  });

  it("enseña su horario semanal, su cuerpo técnico, su plantilla, sus datos y borrarlo, en ese orden", async () => {
    render(await AdminTeamPage(teamParams(TEAM_ID)));

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Horario semanal", "Cuerpo técnico", "Plantilla", "Datos del equipo"]);
    expect(screen.getByLabelText("Papel de Cruz Vidal")).toHaveValue("head_coach");
    expect(screen.getByText("Alonso, Ana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Borrar equipo" })).toBeInTheDocument();
  });

  it("los datos del equipo se editan con las categorías del club, y la suya elegida", async () => {
    render(await AdminTeamPage(teamParams(TEAM_ID)));

    const category = screen.getByLabelText("Categoría");
    expect(category).toHaveValue(uuid(12));
    expect(within(category).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Categoría menor",
      "Categoría mayor",
    ]);
  });
});

describe("/admin/teams/[teamId] · horario semanal", () => {
  /** La card de «Horario semanal»: de su `<h2>` hacia arriba. */
  const scheduleCard = () => screen.getByRole("heading", { level: 2, name: "Horario semanal" }).parentElement as HTMLElement;
  /** La fecha de hoy para la página, que solo mira el reloj para saber si la temporada acabó. */
  const today = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };

  it("lee los horarios del equipo de la URL y las pistas del club, con el contexto de quien administra", async () => {
    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(mocks.listTeamSchedules).toHaveBeenCalledTimes(1);
    expect(mocks.listTeamSchedules.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
    expect(mocks.listTeamSchedules.mock.calls[0][1]).toBe(TEAM_ID);
    expect(mocks.listVenues).toHaveBeenCalledTimes(1);
    expect(mocks.listVenues.mock.calls[0][0]).toMatchObject({ org: { slug: "club-a" } });
  });

  it("sin horarios lo dice, y ofrece añadir el primero", async () => {
    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(
      within(scheduleCard()).getByText("Aún no tiene horarios. Con uno, sus entrenamientos de la temporada se crean solos."),
    ).toBeInTheDocument();
    expect(within(scheduleCard()).getByRole("button", { name: "Añadir horario" })).toBeInTheDocument();
  });

  it("cada horario dice su día, su franja y su pista, en el orden en que llegan", async () => {
    mocks.listTeamSchedules.mockResolvedValue(SCHEDULES);
    mocks.listVenues.mockResolvedValue(VENUES);

    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(
      within(scheduleCard())
        .getAllByRole("listitem")
        .map((row) => row.querySelector("summary")?.textContent),
    ).toEqual(["Martes · 18:00–19:15 · Pista 1", "Jueves · 19:30–20:30"]);
  });

  it("el alta ofrece las pistas del club, y «Sin pista»", async () => {
    mocks.listVenues.mockResolvedValue(VENUES);

    render(await AdminTeamPage(teamParams(TEAM_ID)));

    const add = block("Añadir un horario");
    expect(within(within(add).getByLabelText("Pista")).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Sin pista",
      "Pista 1",
      "Pista 2",
    ]);
  });

  it("el alta es para este equipo y este club: lo que se manda lleva su id", async () => {
    const { createTeamSchedule } = await import("@/modules/calendar/actions");
    vi.mocked(createTeamSchedule).mockResolvedValue({ ok: true, data: { id: uuid(43), created: 0 } });

    render(await AdminTeamPage(teamParams(TEAM_ID)));
    fireEvent.click(within(block("Añadir un horario")).getByRole("button", { name: "Añadir horario" }));

    await screen.findByText("Horario creado. No había entrenamientos que crear.");
    expect(createTeamSchedule).toHaveBeenCalledWith("club-a", expect.objectContaining({ teamId: TEAM_ID }));
  });

  // La temporada del equipo acaba el 30 jun 2027.
  it("el último día de la temporada todavía se añaden horarios", async () => {
    today("2027-06-30T12:00:00.000Z");

    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(within(scheduleCard()).getByRole("button", { name: "Añadir horario" })).toBeInTheDocument();
  });

  it("con la temporada acabada ya no se añaden: lo dice, y los que tenía se siguen viendo", async () => {
    today("2027-07-01T12:00:00.000Z");
    mocks.listTeamSchedules.mockResolvedValue(SCHEDULES);

    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(
      within(scheduleCard()).getByText("La temporada de este equipo ya ha acabado: no se añaden horarios."),
    ).toBeInTheDocument();
    expect(within(scheduleCard()).queryByRole("button", { name: "Añadir horario" })).not.toBeInTheDocument();
    expect(within(scheduleCard()).getAllByRole("listitem")).toHaveLength(2);
  });

  // Regla 7: hoy es el día del reloj del club (Madrid), como lo cuenta `create_team_schedule`.
  it("el día que cuenta es el del reloj del club, no el de UTC: pasada su medianoche, la temporada ha acabado", async () => {
    // Las 22:30 UTC del 30 jun son las 00:30 del 1 jul en Madrid.
    today("2027-06-30T22:30:00.000Z");

    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(within(scheduleCard()).queryByRole("button", { name: "Añadir horario" })).not.toBeInTheDocument();
    expect(
      within(scheduleCard()).getByText("La temporada de este equipo ya ha acabado: no se añaden horarios."),
    ).toBeInTheDocument();
  });

  it("y hasta su medianoche, el último día sigue contando", async () => {
    // Las 21:30 UTC del 30 jun son las 23:30 del 30 jun en Madrid.
    today("2027-06-30T21:30:00.000Z");

    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(within(scheduleCard()).getByRole("button", { name: "Añadir horario" })).toBeInTheDocument();
  });

  it("en un club de otra zona, el día es el suyo", async () => {
    const ctx = clubContext("admin");
    mocks.getClubContext.mockResolvedValue({ ...ctx, org: { ...ctx.org, timezone: "America/Mexico_City" } });
    // Las 03:00 UTC del 1 jul son aún las 21:00 del 30 jun en Ciudad de México.
    today("2027-07-01T03:00:00.000Z");

    render(await AdminTeamPage(teamParams(TEAM_ID)));

    expect(within(scheduleCard()).getByRole("button", { name: "Añadir horario" })).toBeInTheDocument();
  });

  it("si los horarios no se pueden leer, lanza: lo recoge `error.tsx`", async () => {
    mocks.listTeamSchedules.mockRejectedValue(new Error("calendar.team-schedules: no se pudo leer de la base de datos"));

    await expect(AdminTeamPage(teamParams(TEAM_ID))).rejects.toThrow("calendar.team-schedules");
  });
});

describe("/admin/teams/[teamId] · a quién se puede añadir", () => {
  it("el buscador ofrece a quien está en el club, con su año, y no a quien está archivado", async () => {
    render(await AdminTeamPage(teamParams(TEAM_ID)));
    const add = block("Añadir a alguien del club");

    searchIn(add, "li");
    expect(within(add).getByRole("button", { name: /Libre, Luis/ })).toHaveTextContent("2013");

    searchIn(add, "archivada");
    expect(within(add).queryByRole("button", { name: /Archivada, Eva/ })).not.toBeInTheDocument();
    expect(within(add).getByText(/^Nadie con ese nombre\./)).toHaveAttribute("role", "status");
  });

  it("a la plantilla no se ofrece a quien ya está en ella; al cuerpo técnico, sí", async () => {
    render(await AdminTeamPage(teamParams(TEAM_ID)));

    const roster = block("Añadir a alguien del club");
    searchIn(roster, "alonso");
    expect(within(roster).queryByRole("button", { name: /Alonso, Ana/ })).not.toBeInTheDocument();

    const staff = block("Añadir al cuerpo técnico");
    searchIn(staff, "alonso");
    expect(within(staff).getByRole("button", { name: /Alonso, Ana/ })).toBeInTheDocument();
  });

  it("al cuerpo técnico no se ofrece a quien ya está en él", async () => {
    render(await AdminTeamPage(teamParams(TEAM_ID)));
    const staff = block("Añadir al cuerpo técnico");

    searchIn(staff, "vidal");

    expect(within(staff).queryByRole("button", { name: /Vidal, Cruz/ })).not.toBeInTheDocument();
  });

  it("a los buscadores no viaja de cada persona más que su id, su nombre y su año de nacimiento", async () => {
    // Si la lista llevara más (sus equipos, si está archivada), acabaría en el HTML de la página.
    mocks.listPeople.mockResolvedValue([summary(23, "Luis", "Libre", { birthYear: 2013, teams: ["Equipo secreto"] })]);
    const { container } = render(await AdminTeamPage(teamParams(TEAM_ID)));

    searchIn(block("Añadir a alguien del club"), "libre");

    expect(container).not.toHaveTextContent("Equipo secreto");
  });
});
