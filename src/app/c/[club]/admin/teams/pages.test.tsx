import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminTeam, Category, PersonSummary } from "@/modules/structure/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  getAdminTeam: vi.fn(),
  listCategories: vi.fn(),
  listPeople: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
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

let consoleErrors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  consoleErrors = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getClubContext.mockResolvedValue(clubContext("admin"));
  mocks.getAdminTeam.mockResolvedValue(team());
  mocks.listCategories.mockResolvedValue(CATEGORIES);
  mocks.listPeople.mockResolvedValue(PEOPLE);
});

afterEach(() => {
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

  it("enseña su cuerpo técnico, su plantilla, sus datos y borrarlo, en ese orden", async () => {
    render(await AdminTeamPage(teamParams(TEAM_ID)));

    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Cuerpo técnico", "Plantilla", "Datos del equipo"]);
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
