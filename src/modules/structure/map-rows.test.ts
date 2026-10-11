import { describe, expect, it } from "vitest";
import {
  ADMIN_TEAM_COLUMNS,
  CATEGORY_COLUMNS,
  PERSON_COLUMNS,
  PERSON_DETAIL_COLUMNS,
  SEASON_COLUMNS,
  SEASON_TEAM_COLUMNS,
  toAdminTeam,
  toCategory,
  toPersonDetail,
  toPersonSummary,
  toSeasonDetail,
  toSeasonSummary,
  toSeasonTeams,
  type AdminTeamRow,
  type PersonDetailRow,
  type PersonRow,
  type SeasonRow,
  type SeasonTeamRow,
} from "./map-rows";
import type { StaffRole } from "./types";

// Datos neutros y ficticios: los tests de `src/` no nombran a ningún club (pnpm check:guards).
// De las personas, solo el año de nacimiento.
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const SEASON: SeasonRow = {
  id: uuid(1),
  name: "2026/27",
  starts_on: "2026-09-01",
  ends_on: "2027-06-30",
  is_current: true,
};

const teamRow = (
  n: number,
  name: string,
  category: { id: number; name: string; sort: number },
  overrides: Partial<SeasonTeamRow> = {},
): SeasonTeamRow => ({
  id: uuid(n),
  name,
  category_id: uuid(category.id),
  categories: { name: category.name, sort: category.sort },
  team_players: [{ count: 0 }],
  team_staff: [{ count: 0 }],
  ...overrides,
});

const SMALL = { id: 100, name: "Pequeños", sort: 10 };
const BIG = { id: 200, name: "Mayores", sort: 20 };

describe("las columnas que se piden", () => {
  it("de una persona solo el año de nacimiento, nunca una fecha", () => {
    for (const columns of [PERSON_COLUMNS, PERSON_DETAIL_COLUMNS, ADMIN_TEAM_COLUMNS]) {
      expect(columns).toContain("birth_year");
      expect(columns).not.toMatch(/birth_?date|birthday|date_of_birth/i);
    }
  });

  it("el detalle de una persona suma su acceso a lo de la lista", () => {
    expect(PERSON_DETAIL_COLUMNS).toBe(`${PERSON_COLUMNS}, memberships(role, status)`);
  });

  it("los recuentos se piden como `tabla(count)`", () => {
    expect(SEASON_TEAM_COLUMNS).toContain("team_players(count)");
    expect(SEASON_TEAM_COLUMNS).toContain("team_staff(count)");
    expect(CATEGORY_COLUMNS).toContain("teams(count)");
  });

  it("la temporada lleva sus fechas y si es la actual", () => {
    expect(SEASON_COLUMNS).toBe("id, name, starts_on, ends_on, is_current");
  });
});

describe("toSeasonSummary", () => {
  it("pasa la fila a camelCase, con las fechas como días de calendario", () => {
    expect(toSeasonSummary(SEASON)).toEqual({
      id: uuid(1),
      name: "2026/27",
      startsOn: "2026-09-01",
      endsOn: "2027-06-30",
      isCurrent: true,
    });
  });

  it("una temporada que no es la actual lo dice", () => {
    expect(toSeasonSummary({ ...SEASON, is_current: false }).isCurrent).toBe(false);
  });
});

describe("toSeasonTeams", () => {
  it("cada equipo con su categoría y sus recuentos", () => {
    const rows = [teamRow(1, "Equipo A", SMALL, { team_players: [{ count: 12 }], team_staff: [{ count: 2 }] })];

    expect(toSeasonTeams(rows)).toEqual([
      {
        id: uuid(1),
        name: "Equipo A",
        categoryId: uuid(100),
        categoryName: "Pequeños",
        categorySort: 10,
        players: 12,
        staff: 2,
      },
    ]);
  });

  it("la categoría embebida se lee igual si llega como objeto o como lista de un elemento", () => {
    const asObject = teamRow(1, "Equipo A", SMALL);
    const asList = { ...asObject, categories: [{ name: "Pequeños", sort: 10 }] };

    expect(toSeasonTeams([asList])).toEqual(toSeasonTeams([asObject]));
  });

  it("sin categoría (null o lista vacía): nombre vacío y orden 0", () => {
    const rows = [
      teamRow(1, "Sin categoría", SMALL, { categories: null }),
      teamRow(2, "Lista vacía", SMALL, { categories: [] }),
    ];

    expect(toSeasonTeams(rows).map((team) => [team.categoryName, team.categorySort])).toEqual([
      ["", 0],
      ["", 0],
    ]);
  });

  it("un recuento que no llega (null o lista vacía) es 0", () => {
    const rows = [
      teamRow(1, "A", SMALL, { team_players: null, team_staff: null }),
      teamRow(2, "B", SMALL, { team_players: [], team_staff: [] }),
    ];

    expect(toSeasonTeams(rows).map((team) => [team.players, team.staff])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it("ordena por el orden de la categoría y, dentro, por nombre", () => {
    const rows = [
      teamRow(1, "Mayores B", BIG),
      teamRow(2, "Pequeños B", SMALL),
      teamRow(3, "Mayores A", BIG),
      teamRow(4, "Pequeños A", SMALL),
    ];

    expect(toSeasonTeams(rows).map((team) => team.name)).toEqual([
      "Pequeños A",
      "Pequeños B",
      "Mayores A",
      "Mayores B",
    ]);
  });

  it("dos categorías con el mismo orden no se mezclan: van por su nombre, cada una con sus equipos seguidos", () => {
    const first = { id: 300, name: "Alfa", sort: 10 };
    const second = { id: 400, name: "Beta", sort: 10 };
    const rows = [
      teamRow(1, "Equipo Z", first),
      teamRow(2, "Equipo A", second),
      teamRow(3, "Equipo A", first),
      teamRow(4, "Equipo Z", second),
    ];

    expect(toSeasonTeams(rows).map((team) => `${team.categoryName} · ${team.name}`)).toEqual([
      "Alfa · Equipo A",
      "Alfa · Equipo Z",
      "Beta · Equipo A",
      "Beta · Equipo Z",
    ]);
  });

  it("los nombres se ordenan como se leen en español", () => {
    const rows = [teamRow(1, "Zeta", SMALL), teamRow(2, "Águilas", SMALL), teamRow(3, "Bravo", SMALL)];

    expect(toSeasonTeams(rows).map((team) => team.name)).toEqual(["Águilas", "Bravo", "Zeta"]);
  });

  it("a igualdad de todo, por id: el orden no baila", () => {
    const rows = [teamRow(3, "Equipo", SMALL), teamRow(1, "Equipo", SMALL), teamRow(2, "Equipo", SMALL)];

    expect(toSeasonTeams(rows).map((team) => team.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
  });

  it("no cambia la lista que recibe", () => {
    const rows = [teamRow(2, "B", BIG), teamRow(1, "A", SMALL)];

    toSeasonTeams(rows);

    expect(rows.map((row) => row.name)).toEqual(["B", "A"]);
  });
});

describe("toSeasonDetail", () => {
  it("la temporada con sus equipos ya ordenados", () => {
    const detail = toSeasonDetail(SEASON, [teamRow(1, "Mayores A", BIG), teamRow(2, "Pequeños A", SMALL)]);

    expect(detail).toMatchObject({ id: uuid(1), name: "2026/27", isCurrent: true });
    expect(detail.teams.map((team) => team.name)).toEqual(["Pequeños A", "Mayores A"]);
  });

  it("sin equipos, la lista vacía", () => {
    expect(toSeasonDetail(SEASON, []).teams).toEqual([]);
  });
});

describe("toCategory", () => {
  const row = { id: uuid(1), name: "Pequeños", age_band: "U12", sort: 10, teams: [{ count: 2 }] };

  it("pasa la fila a camelCase, y la lleva algún equipo", () => {
    expect(toCategory(row)).toEqual({ id: uuid(1), name: "Pequeños", ageBand: "U12", sort: 10, inUse: true });
  });

  it.each([
    ["cero equipos", [{ count: 0 }]],
    ["sin recuento", null],
    ["lista vacía", []],
  ])("con %s no está en uso: se puede borrar", (_case, teams) => {
    expect(toCategory({ ...row, teams }).inUse).toBe(false);
  });
});

// ── Un equipo con su gente ──────────────────────────────────────────────────────────────

const person = (n: number, first: string, last: string) => ({ id: uuid(n), first_name: first, last_name: last });
const playerPerson = (n: number, first: string, last: string, birthYear: number | null = 2014) => ({
  ...person(n, first, last),
  birth_year: birthYear,
});

function adminTeamRow(overrides: Partial<AdminTeamRow> = {}): AdminTeamRow {
  return {
    id: uuid(1),
    name: "Equipo A",
    category_id: uuid(100),
    categories: { name: "Pequeños" },
    seasons: SEASON,
    team_staff: [],
    team_players: [],
    ...overrides,
  };
}

/** `toAdminTeam` de una fila que tiene temporada. */
function adminTeam(overrides: Partial<AdminTeamRow> = {}) {
  const team = toAdminTeam(adminTeamRow(overrides));
  if (!team) throw new Error("el equipo tenía que salir");
  return team;
}

describe("toAdminTeam", () => {
  it("el equipo con su categoría y su temporada", () => {
    expect(adminTeam()).toEqual({
      id: uuid(1),
      name: "Equipo A",
      categoryId: uuid(100),
      categoryName: "Pequeños",
      season: { id: uuid(1), name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: true },
      staff: [],
      players: [],
    });
  });

  it("sin temporada (RLS no la deja ver) no hay equipo: null", () => {
    expect(toAdminTeam(adminTeamRow({ seasons: null }))).toBeNull();
    expect(toAdminTeam(adminTeamRow({ seasons: [] }))).toBeNull();
  });

  it("la temporada y la categoría se leen igual como objeto que como lista de un elemento", () => {
    const asList = adminTeam({ seasons: [SEASON], categories: [{ name: "Pequeños" }] });

    expect(asList).toEqual(adminTeam());
  });

  it("un equipo de otra temporada sale igual, y dice que no es la actual", () => {
    const team = adminTeam({ seasons: { ...SEASON, id: uuid(2), name: "2025/26", is_current: false } });

    expect(team.season).toMatchObject({ id: uuid(2), name: "2025/26", isCurrent: false });
  });

  it("sin categoría, nombre vacío", () => {
    expect(adminTeam({ categories: null }).categoryName).toBe("");
  });

  it("sin cuerpo técnico ni plantilla (null), listas vacías", () => {
    const team = adminTeam({ team_staff: null, team_players: null });

    expect(team.staff).toEqual([]);
    expect(team.players).toEqual([]);
  });

  it("el cuerpo técnico: el principal primero y, dentro de cada papel, por apellidos", () => {
    const team = adminTeam({
      team_staff: [
        { staff_role: "assistant", people: person(20, "Ana", "Zamora") },
        { staff_role: "assistant", people: person(21, "Blas", "Arco") },
        { staff_role: "head_coach", people: [person(22, "Cruz", "Vidal")] },
        { staff_role: "head_coach", people: person(23, "Dora", "Álvarez") },
      ],
    });

    expect(team.staff.map((member) => [member.role, member.lastName])).toEqual([
      ["head_coach", "Álvarez"],
      ["head_coach", "Vidal"],
      ["assistant", "Arco"],
      ["assistant", "Zamora"],
    ]);
    expect(team.staff[0]).toEqual({
      personId: uuid(23),
      firstName: "Dora",
      lastName: "Álvarez",
      role: "head_coach",
    });
  });

  it("la plantilla: por dorsal, y sin dorsal al final, por apellidos", () => {
    const team = adminTeam({
      team_players: [
        { jersey_number: 12, position: "Pívot", people: playerPerson(30, "Ciro", "Luna") },
        { jersey_number: null, position: null, people: playerPerson(31, "Dani", "Sol") },
        { jersey_number: 4, position: "Base", people: [playerPerson(32, "Eloy", "Mar", 2013)] },
        { jersey_number: null, position: "Alero", people: playerPerson(33, "Fran", "Alba") },
      ],
    });

    expect(team.players.map((player) => [player.jerseyNumber, player.lastName])).toEqual([
      [4, "Mar"],
      [12, "Luna"],
      [null, "Alba"],
      [null, "Sol"],
    ]);
    expect(team.players[0]).toEqual({
      personId: uuid(32),
      firstName: "Eloy",
      lastName: "Mar",
      birthYear: 2013,
      jerseyNumber: 4,
      position: "Base",
    });
  });

  it("el dorsal 0 es el primero y el 99 va antes que quien no tiene dorsal", () => {
    const team = adminTeam({
      team_players: [
        { jersey_number: null, position: null, people: playerPerson(30, "Ana", "Abad") },
        { jersey_number: 99, position: null, people: playerPerson(31, "Bea", "Zurita") },
        { jersey_number: 0, position: null, people: playerPerson(32, "Cai", "Mora") },
      ],
    });

    expect(team.players.map((player) => player.jerseyNumber)).toEqual([0, 99, null]);
  });

  it("de un jugador sale el año de nacimiento, o null si no lo tiene", () => {
    const team = adminTeam({
      team_players: [
        { jersey_number: 1, position: null, people: playerPerson(30, "Ana", "Abad", 2015) },
        { jersey_number: 2, position: null, people: playerPerson(31, "Bea", "Zurita", null) },
      ],
    });

    expect(team.players.map((player) => player.birthYear)).toEqual([2015, null]);
  });

  it("una fila sin persona (RLS no la deja ver) no sale, ni en el cuerpo técnico ni en la plantilla", () => {
    const team = adminTeam({
      team_staff: [
        { staff_role: "head_coach", people: null },
        { staff_role: "assistant", people: [] },
      ],
      team_players: [
        { jersey_number: 5, position: null, people: null },
        { jersey_number: 6, position: null, people: [] },
      ],
    });

    expect(team.staff).toEqual([]);
    expect(team.players).toEqual([]);
  });

  it("quien entrena y juega en el mismo equipo sale en las dos listas", () => {
    const team = adminTeam({
      team_staff: [{ staff_role: "assistant", people: person(30, "Ana", "Abad") }],
      team_players: [{ jersey_number: 9, position: null, people: playerPerson(30, "Ana", "Abad", 2008) }],
    });

    expect(team.staff.map((member) => member.personId)).toEqual([uuid(30)]);
    expect(team.players.map((player) => player.personId)).toEqual([uuid(30)]);
  });
});

// ── Una persona y sus equipos ───────────────────────────────────────────────────────────

type SeasonOfTeam = { name: string; is_current: boolean; starts_on: string };

const CURRENT: SeasonOfTeam = { name: "2026/27", is_current: true, starts_on: "2026-09-01" };
const LAST: SeasonOfTeam = { name: "2025/26", is_current: false, starts_on: "2025-09-01" };
const OLDER: SeasonOfTeam = { name: "2024/25", is_current: false, starts_on: "2024-09-01" };
const NEXT: SeasonOfTeam = { name: "2027/28", is_current: false, starts_on: "2027-09-01" };

const seat = (n: number, name: string, season: SeasonOfTeam | null) => ({
  teams: { id: uuid(n), name, seasons: season },
});
const staffSeat = (n: number, name: string, season: SeasonOfTeam | null, role: StaffRole = "assistant") => ({
  ...seat(n, name, season),
  staff_role: role,
});

function personRow(overrides: Partial<PersonRow> = {}): PersonRow {
  return {
    id: uuid(50),
    first_name: "Ana",
    last_name: "García López",
    birth_year: 2014,
    archived_at: null,
    team_players: [],
    team_staff: [],
    ...overrides,
  };
}

function personDetailRow(overrides: Partial<PersonDetailRow> = {}): PersonDetailRow {
  return { ...personRow(), memberships: [], ...overrides };
}

describe("toPersonSummary", () => {
  it("la persona, con solo su año de nacimiento, y sin equipos", () => {
    expect(toPersonSummary(personRow())).toEqual({
      id: uuid(50),
      firstName: "Ana",
      lastName: "García López",
      birthYear: 2014,
      archived: false,
      teams: [],
    });
  });

  it("sin año de nacimiento, null", () => {
    expect(toPersonSummary(personRow({ birth_year: null })).birthYear).toBeNull();
  });

  it("archivada si tiene fecha de archivo", () => {
    expect(toPersonSummary(personRow({ archived_at: "2026-10-01T10:00:00+00:00" })).archived).toBe(true);
    expect(toPersonSummary(personRow({ archived_at: null })).archived).toBe(false);
  });

  it("solo los equipos de la temporada actual: los de otras temporadas no salen", () => {
    const summary = toPersonSummary(
      personRow({
        team_players: [seat(1, "Equipo A", CURRENT), seat(2, "Equipo viejo", LAST), seat(3, "Equipo futuro", NEXT)],
        team_staff: [staffSeat(4, "Equipo B", CURRENT), staffSeat(5, "Otro viejo", OLDER)],
      }),
    );

    expect(summary.teams).toEqual(["Equipo A", "Equipo B"]);
  });

  it("quien entrena y juega en el mismo equipo lo lleva una sola vez", () => {
    const summary = toPersonSummary(
      personRow({
        team_players: [seat(1, "Equipo A", CURRENT)],
        team_staff: [staffSeat(1, "Equipo A", CURRENT), staffSeat(2, "Equipo B", CURRENT)],
      }),
    );

    expect(summary.teams).toEqual(["Equipo A", "Equipo B"]);
  });

  it("los equipos salen por nombre", () => {
    const summary = toPersonSummary(
      personRow({
        team_players: [seat(1, "Zeta", CURRENT), seat(2, "Águilas", CURRENT), seat(3, "Bravo", CURRENT)],
      }),
    );

    expect(summary.teams).toEqual(["Águilas", "Bravo", "Zeta"]);
  });

  it("los equipos embebidos se leen igual como objeto que como lista", () => {
    const summary = toPersonSummary(
      personRow({
        team_players: [{ teams: [{ id: uuid(1), name: "Equipo A", seasons: [CURRENT] }] }],
      }),
    );

    expect(summary.teams).toEqual(["Equipo A"]);
  });

  it("un equipo o una temporada que no llegan no cuentan", () => {
    const summary = toPersonSummary(
      personRow({
        team_players: [{ teams: null }, seat(1, "Sin temporada", null), { teams: [] }],
        team_staff: null,
      }),
    );

    expect(summary.teams).toEqual([]);
  });

  it("sin filas de plantilla ni de cuerpo técnico (null), sin equipos", () => {
    expect(toPersonSummary(personRow({ team_players: null, team_staff: null })).teams).toEqual([]);
  });
});

describe("toPersonDetail", () => {
  it("la persona, con solo su año de nacimiento, sin equipos y sin acceso", () => {
    expect(toPersonDetail(personDetailRow())).toEqual({
      id: uuid(50),
      firstName: "Ana",
      lastName: "García López",
      birthYear: 2014,
      archived: false,
      teams: [],
      access: null,
    });
  });

  it("archivada si tiene fecha de archivo", () => {
    expect(toPersonDetail(personDetailRow({ archived_at: "2026-10-01T10:00:00+00:00" })).archived).toBe(true);
  });

  it("sus equipos de cualquier temporada: la actual primero y luego las más recientes", () => {
    const detail = toPersonDetail(
      personDetailRow({
        team_players: [seat(3, "De hace dos", OLDER), seat(1, "De ahora", CURRENT), seat(2, "Del año pasado", LAST)],
      }),
    );

    expect(detail.teams.map((team) => [team.seasonName, team.teamName])).toEqual([
      ["2026/27", "De ahora"],
      ["2025/26", "Del año pasado"],
      ["2024/25", "De hace dos"],
    ]);
  });

  it("la actual va primero aunque haya una temporada que empieza después", () => {
    const detail = toPersonDetail(
      personDetailRow({ team_players: [seat(1, "Futuro", NEXT), seat(2, "Ahora", CURRENT), seat(3, "Pasado", LAST)] }),
    );

    expect(detail.teams.map((team) => [team.teamName, team.isCurrent])).toEqual([
      ["Ahora", true],
      ["Futuro", false],
      ["Pasado", false],
    ]);
  });

  it("dentro de una temporada, por nombre de equipo", () => {
    const detail = toPersonDetail(
      personDetailRow({
        team_players: [seat(1, "Zeta", CURRENT)],
        team_staff: [staffSeat(2, "Águilas", CURRENT), staffSeat(3, "Bravo", CURRENT)],
      }),
    );

    expect(detail.teams.map((team) => team.teamName)).toEqual(["Águilas", "Bravo", "Zeta"]);
  });

  it("cada equipo dice qué hace en él: en la plantilla, o su papel en el cuerpo técnico", () => {
    const detail = toPersonDetail(
      personDetailRow({
        team_players: [seat(1, "Equipo A", CURRENT)],
        team_staff: [staffSeat(2, "Equipo B", CURRENT, "head_coach"), staffSeat(3, "Equipo C", CURRENT, "assistant")],
      }),
    );

    expect(detail.teams).toEqual([
      { teamId: uuid(1), teamName: "Equipo A", seasonName: "2026/27", isCurrent: true, as: "player" },
      { teamId: uuid(2), teamName: "Equipo B", seasonName: "2026/27", isCurrent: true, as: "head_coach" },
      { teamId: uuid(3), teamName: "Equipo C", seasonName: "2026/27", isCurrent: true, as: "assistant" },
    ]);
  });

  it("quien entrena y juega en el mismo equipo lo lleva dos veces, una por cada cosa", () => {
    const detail = toPersonDetail(
      personDetailRow({
        team_players: [seat(1, "Equipo A", CURRENT)],
        team_staff: [staffSeat(1, "Equipo A", CURRENT, "assistant")],
      }),
    );

    expect(detail.teams.map((team) => [team.teamId, team.as])).toEqual([
      [uuid(1), "assistant"],
      [uuid(1), "player"],
    ]);
  });

  it("no enseña cuándo empieza la temporada: solo sirve para ordenar", () => {
    const detail = toPersonDetail(personDetailRow({ team_players: [seat(1, "Equipo A", CURRENT)] }));

    expect(detail.teams[0]).not.toHaveProperty("startsOn");
  });

  it("un equipo o una temporada que no llegan no cuentan", () => {
    const detail = toPersonDetail(
      personDetailRow({ team_players: [{ teams: null }, seat(1, "Sin temporada", null)], team_staff: null }),
    );

    expect(detail.teams).toEqual([]);
  });

  it.each(["admin", "coach", "player", "guardian"] as const)("con una membresía activa, su acceso es el rol %s", (role) => {
    expect(toPersonDetail(personDetailRow({ memberships: [{ role, status: "active" }] })).access).toBe(role);
  });

  it("una membresía que no está activa no da acceso", () => {
    for (const status of ["invited", "revoked", "disabled", ""]) {
      expect(toPersonDetail(personDetailRow({ memberships: [{ role: "coach", status }] })).access).toBeNull();
    }
  });

  it("entre varias membresías, cuenta la activa", () => {
    const detail = toPersonDetail(
      personDetailRow({
        memberships: [
          { role: "admin", status: "revoked" },
          { role: "coach", status: "active" },
        ],
      }),
    );

    expect(detail.access).toBe("coach");
  });

  it("sin membresías (null o ninguna) no tiene acceso", () => {
    expect(toPersonDetail(personDetailRow({ memberships: null })).access).toBeNull();
    expect(toPersonDetail(personDetailRow({ memberships: [] })).access).toBeNull();
  });
});
