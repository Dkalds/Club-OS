import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CTX,
  fakeSupabase,
  FAILURE,
  ORG,
  OTHER_ORG,
  uuid,
  type Failure,
  type Row,
  type Store,
} from "@/lib/test-support";
import type { ClubContext } from "@/modules/tenancy/queries";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import {
  defaultSeason,
  getAdminTeam,
  getPerson,
  getSeason,
  listCategories,
  listPeople,
  listSeasons,
  PEOPLE_LIMIT,
} from "./queries";
import type { SeasonSummary } from "./types";

// Las lecturas de la estructura del club para Gestión, contra el doble de la base de datos de
// `@/lib/test-support`: aplica de verdad los filtros y el orden que pide cada consulta. Quien
// llama ya ha pasado por `adminPage`, y aun así cada consulta filtra por el club: no depende de
// RLS para no recorrer ni devolver filas de otro club.
//
// Datos neutros y ficticios (pnpm check:guards); de las personas, solo el año de nacimiento.

/** Quien consulta: la dirección del club. */
const ADMIN: ClubContext = { ...CTX, membership: { role: "admin", personId: null } };

type Calls = ReturnType<typeof fakeSupabase>["calls"];

function install(store: Store, failing: Record<string, Failure> = {}): Calls {
  const fake = fakeSupabase(store, failing);
  mocks.createClient.mockResolvedValue(fake.client);
  return fake.calls;
}

/** Que una lectura que falla se registra con su etiqueta, sin datos personales, y lanza. */
async function expectReadError(run: () => Promise<unknown>, expectedTag: string) {
  const error = await run().then(
    () => null,
    (thrown: unknown) => thrown,
  );

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(`${expectedTag}: no se pudo leer de la base de datos`);
  expect((error as Error).cause).toBeUndefined();
  expect(mocks.logError).toHaveBeenCalledTimes(1);
  expect(mocks.logError).toHaveBeenCalledWith(expectedTag, FAILURE);
}

/** Lo que llega de la URL y no puede ser un id. */
const NOT_UUIDS = ["no-es-un-id", "", "1", `${uuid(1)}0`, ` ${uuid(1)}`, "categories", "id.eq.1,or(1)"];

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.logError.mockReset();
});

// ── Filas, ya con la forma que devuelve PostgREST ────────────────────────────────────────

const S_CURRENT = uuid(1);
const S_LAST = uuid(2);
const S_NEXT = uuid(3);
const S_OTHER_CLUB = uuid(9);

function seasonRow(id: string, organization_id: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id,
    name: "2026/27",
    starts_on: "2026-09-01",
    ends_on: "2027-06-30",
    is_current: false,
    ...overrides,
  };
}

function seasonsStore(): Row[] {
  return [
    seasonRow(S_LAST, ORG, { name: "2025/26", starts_on: "2025-09-01", ends_on: "2026-06-30" }),
    seasonRow(S_NEXT, ORG, { name: "2027/28", starts_on: "2027-09-01", ends_on: "2028-06-30" }),
    seasonRow(S_CURRENT, ORG, { is_current: true }),
    seasonRow(S_OTHER_CLUB, OTHER_ORG, { name: "De otro club", starts_on: "2029-09-01", is_current: true }),
  ];
}

const C_SMALL = uuid(100);
const C_BIG = uuid(200);

function teamRow(id: string, organization_id: string, season_id: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id,
    season_id,
    name: "Equipo",
    category_id: C_SMALL,
    categories: { name: "Pequeños", sort: 10 },
    team_players: [{ count: 0 }],
    team_staff: [{ count: 0 }],
    ...overrides,
  };
}

function personRow(id: string, organization_id: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id,
    first_name: "Ana",
    last_name: "Vega",
    birth_year: 2014,
    archived_at: null,
    team_players: [],
    team_staff: [],
    memberships: [],
    ...overrides,
  };
}

const CURRENT_SEASON = { name: "2026/27", is_current: true, starts_on: "2026-09-01" };
const LAST_SEASON = { name: "2025/26", is_current: false, starts_on: "2025-09-01" };

// ── Temporadas ──────────────────────────────────────────────────────────────────────────

describe("listSeasons", () => {
  it("las temporadas del club, de la más reciente a la más antigua, y ninguna de otro club", async () => {
    const calls = install({ seasons: seasonsStore() });

    const seasons = await listSeasons(ADMIN);

    expect(seasons.map((season) => season.id)).toEqual([S_NEXT, S_CURRENT, S_LAST]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "seasons",
      eq: { organization_id: ORG },
      order: ["starts_on", "id"],
    });
  });

  it("cada una con su nombre, sus fechas como días de calendario y si es la actual", async () => {
    install({ seasons: [seasonRow(S_CURRENT, ORG, { is_current: true })] });

    await expect(listSeasons(ADMIN)).resolves.toEqual([
      { id: S_CURRENT, name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: true },
    ]);
  });

  it("dos que empiezan el mismo día salen por id: el orden no baila", async () => {
    install({ seasons: [seasonRow(uuid(7), ORG), seasonRow(uuid(5), ORG), seasonRow(uuid(6), ORG)] });

    expect((await listSeasons(ADMIN)).map((season) => season.id)).toEqual([uuid(5), uuid(6), uuid(7)]);
  });

  it("un club sin temporadas: lista vacía", async () => {
    install({ seasons: [seasonRow(S_OTHER_CLUB, OTHER_ORG)] });

    await expect(listSeasons(ADMIN)).resolves.toEqual([]);
  });

  it("filtra por el club de quien pregunta, no por uno fijo", async () => {
    const calls = install({ seasons: seasonsStore() });

    const seasons = await listSeasons({ ...ADMIN, org: { ...ADMIN.org, id: OTHER_ORG } });

    expect(seasons.map((season) => season.id)).toEqual([S_OTHER_CLUB]);
    expect(calls[0].eq).toEqual({ organization_id: OTHER_ORG });
  });

  it("un error de lectura se registra y lanza: no es una lista vacía", async () => {
    install({ seasons: seasonsStore() }, { seasons: FAILURE });

    await expectReadError(() => listSeasons(ADMIN), "structure.seasons");
  });
});

describe("defaultSeason", () => {
  const season = (id: string, isCurrent: boolean): SeasonSummary => ({
    id,
    name: "Temporada",
    startsOn: "2026-09-01",
    endsOn: "2027-06-30",
    isCurrent,
  });

  it("la actual, aunque no sea la más reciente", () => {
    const seasons = [season(S_NEXT, false), season(S_CURRENT, true), season(S_LAST, false)];

    expect(defaultSeason(seasons)?.id).toBe(S_CURRENT);
  });

  it("sin ninguna actual, la primera de la lista: la más reciente", () => {
    expect(defaultSeason([season(S_NEXT, false), season(S_LAST, false)])?.id).toBe(S_NEXT);
  });

  it("sin temporadas, null", () => {
    expect(defaultSeason([])).toBeNull();
  });
});

describe("getSeason", () => {
  function store(): Store {
    return {
      seasons: seasonsStore(),
      teams: [
        teamRow(uuid(11), ORG, S_CURRENT, {
          name: "Mayores A",
          category_id: C_BIG,
          categories: { name: "Mayores", sort: 20 },
          team_players: [{ count: 12 }],
          team_staff: [{ count: 2 }],
        }),
        teamRow(uuid(12), ORG, S_CURRENT, { name: "Pequeños A" }),
        teamRow(uuid(13), ORG, S_LAST, { name: "De la temporada pasada" }),
        // No debería existir (la clave compuesta lo impide), y aun así no se cuela.
        teamRow(uuid(14), OTHER_ORG, S_CURRENT, { name: "De otro club" }),
      ],
    };
  }

  it("la temporada con sus equipos, por categoría, y solo los suyos", async () => {
    const calls = install(store());

    const season = await getSeason(ADMIN, S_CURRENT);

    expect(season).toEqual({
      id: S_CURRENT,
      name: "2026/27",
      startsOn: "2026-09-01",
      endsOn: "2027-06-30",
      isCurrent: true,
      teams: [
        {
          id: uuid(12),
          name: "Pequeños A",
          categoryId: C_SMALL,
          categoryName: "Pequeños",
          categorySort: 10,
          players: 0,
          staff: 0,
        },
        {
          id: uuid(11),
          name: "Mayores A",
          categoryId: C_BIG,
          categoryName: "Mayores",
          categorySort: 20,
          players: 12,
          staff: 2,
        },
      ],
    });
    expect(calls).toHaveLength(2);
    expect(calls.find((call) => call.table === "seasons")?.eq).toEqual({ organization_id: ORG, id: S_CURRENT });
    expect(calls.find((call) => call.table === "teams")?.eq).toEqual({
      organization_id: ORG,
      season_id: S_CURRENT,
    });
  });

  it("vale para cualquier temporada del club, no solo la actual", async () => {
    install(store());

    const season = await getSeason(ADMIN, S_LAST);

    expect(season).toMatchObject({ id: S_LAST, isCurrent: false });
    expect(season?.teams.map((team) => team.name)).toEqual(["De la temporada pasada"]);
  });

  it("una temporada sin equipos sale con la lista vacía", async () => {
    install(store());

    expect((await getSeason(ADMIN, S_NEXT))?.teams).toEqual([]);
  });

  it("la de otro club es null, aunque exista", async () => {
    install(store());

    await expect(getSeason(ADMIN, S_OTHER_CLUB)).resolves.toBeNull();
  });

  it("una que no existe es null", async () => {
    install(store());

    await expect(getSeason(ADMIN, uuid(77))).resolves.toBeNull();
  });

  it.each(NOT_UUIDS)("un id que no es un uuid («%s»): null sin consultar", async (id) => {
    const calls = install(store());

    await expect(getSeason(ADMIN, id)).resolves.toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("un error al leer la temporada se registra y lanza", async () => {
    install(store(), { seasons: FAILURE });

    await expectReadError(() => getSeason(ADMIN, S_CURRENT), "structure.season");
  });

  it("un error al leer sus equipos se registra y lanza: no es una temporada sin equipos", async () => {
    install(store(), { teams: FAILURE });

    await expectReadError(() => getSeason(ADMIN, S_CURRENT), "structure.season-teams");
  });
});

// ── Categorías ──────────────────────────────────────────────────────────────────────────

describe("listCategories", () => {
  const categoryRow = (id: string, organization_id: string, overrides: Row = {}): Row => ({
    id,
    organization_id,
    name: "Categoría",
    age_band: "U12",
    sort: 10,
    teams: [{ count: 0 }],
    ...overrides,
  });

  function store(): Store {
    return {
      categories: [
        categoryRow(uuid(3), ORG, { name: "Mayores", age_band: "U16", sort: 20, teams: [{ count: 2 }] }),
        categoryRow(uuid(2), ORG, { name: "Pequeños B", sort: 10 }),
        categoryRow(uuid(1), ORG, { name: "Pequeños A", sort: 10 }),
        categoryRow(uuid(9), OTHER_ORG, { name: "De otro club", sort: 0 }),
      ],
    };
  }

  it("las categorías del club en su orden (y por nombre a igualdad), ninguna de otro club", async () => {
    const calls = install(store());

    const categories = await listCategories(ADMIN);

    expect(categories.map((category) => category.name)).toEqual(["Pequeños A", "Pequeños B", "Mayores"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "categories",
      eq: { organization_id: ORG },
      order: ["sort", "name", "id"],
    });
  });

  it("cada una con su edad y si algún equipo la lleva", async () => {
    install(store());

    const categories = await listCategories(ADMIN);

    expect(categories[2]).toEqual({ id: uuid(3), name: "Mayores", ageBand: "U16", sort: 20, inUse: true });
    expect(categories[0]).toEqual({ id: uuid(1), name: "Pequeños A", ageBand: "U12", sort: 10, inUse: false });
  });

  it("un club sin categorías: lista vacía", async () => {
    install({ categories: [categoryRow(uuid(9), OTHER_ORG)] });

    await expect(listCategories(ADMIN)).resolves.toEqual([]);
  });

  it("un error de lectura se registra y lanza", async () => {
    install(store(), { categories: FAILURE });

    await expectReadError(() => listCategories(ADMIN), "structure.categories");
  });
});

// ── Un equipo ───────────────────────────────────────────────────────────────────────────

describe("getAdminTeam", () => {
  const T_CURRENT = uuid(21);
  const T_OLD = uuid(22);
  const T_OTHER_CLUB = uuid(29);

  const adminTeamRow = (id: string, organization_id: string, overrides: Row = {}): Row => ({
    id,
    organization_id,
    name: "Equipo A",
    category_id: C_SMALL,
    categories: { name: "Pequeños" },
    seasons: { id: S_CURRENT, name: "2026/27", starts_on: "2026-09-01", ends_on: "2027-06-30", is_current: true },
    team_staff: [],
    team_players: [],
    ...overrides,
  });

  function store(): Store {
    return {
      teams: [
        adminTeamRow(T_CURRENT, ORG, {
          team_staff: [
            { staff_role: "assistant", people: { id: uuid(31), first_name: "Blas", last_name: "Arco" } },
            { staff_role: "head_coach", people: { id: uuid(32), first_name: "Cruz", last_name: "Vidal" } },
          ],
          team_players: [
            {
              jersey_number: null,
              position: null,
              people: { id: uuid(41), first_name: "Dani", last_name: "Sol", birth_year: 2014 },
            },
            {
              jersey_number: 4,
              position: "Base",
              people: { id: uuid(42), first_name: "Eloy", last_name: "Mar", birth_year: 2013 },
            },
          ],
        }),
        adminTeamRow(T_OLD, ORG, {
          name: "Equipo viejo",
          seasons: { id: S_LAST, name: "2025/26", starts_on: "2025-09-01", ends_on: "2026-06-30", is_current: false },
        }),
        adminTeamRow(T_OTHER_CLUB, OTHER_ORG, { name: "De otro club" }),
      ],
    };
  }

  it("un equipo del club con su cuerpo técnico (el principal primero) y su plantilla (por dorsal)", async () => {
    const calls = install(store());

    const team = await getAdminTeam(ADMIN, T_CURRENT);

    expect(team).toEqual({
      id: T_CURRENT,
      name: "Equipo A",
      categoryId: C_SMALL,
      categoryName: "Pequeños",
      season: { id: S_CURRENT, name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: true },
      staff: [
        { personId: uuid(32), firstName: "Cruz", lastName: "Vidal", role: "head_coach" },
        { personId: uuid(31), firstName: "Blas", lastName: "Arco", role: "assistant" },
      ],
      players: [
        { personId: uuid(42), firstName: "Eloy", lastName: "Mar", birthYear: 2013, jerseyNumber: 4, position: "Base" },
        { personId: uuid(41), firstName: "Dani", lastName: "Sol", birthYear: 2014, jerseyNumber: null, position: null },
      ],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "teams", eq: { organization_id: ORG, id: T_CURRENT } });
  });

  it("de la temporada que sea: no filtra por la actual, a diferencia de «mis equipos»", async () => {
    const calls = install(store());

    const team = await getAdminTeam(ADMIN, T_OLD);

    expect(team).toMatchObject({ id: T_OLD, season: { id: S_LAST, isCurrent: false } });
    expect(calls[0].eq).toEqual({ organization_id: ORG, id: T_OLD });
    expect(calls[0].embedded).toEqual({});
  });

  it("el de otro club es null, aunque exista", async () => {
    install(store());

    await expect(getAdminTeam(ADMIN, T_OTHER_CLUB)).resolves.toBeNull();
  });

  it("uno que no existe es null", async () => {
    install(store());

    await expect(getAdminTeam(ADMIN, uuid(77))).resolves.toBeNull();
  });

  it("uno cuya temporada no llega es null", async () => {
    install({ teams: [adminTeamRow(T_CURRENT, ORG, { seasons: null })] });

    await expect(getAdminTeam(ADMIN, T_CURRENT)).resolves.toBeNull();
  });

  it.each(NOT_UUIDS)("un id que no es un uuid («%s»): null sin consultar", async (id) => {
    const calls = install(store());

    await expect(getAdminTeam(ADMIN, id)).resolves.toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("un error de lectura se registra y lanza: no es un 404", async () => {
    install(store(), { teams: FAILURE });

    await expectReadError(() => getAdminTeam(ADMIN, T_CURRENT), "structure.team");
  });
});

// ── Personas ────────────────────────────────────────────────────────────────────────────

describe("listPeople", () => {
  function store(): Store {
    return {
      people: [
        personRow(uuid(1), ORG, { first_name: "Eva", last_name: "Zamora" }),
        personRow(uuid(2), ORG, {
          first_name: "Luis",
          last_name: "Álvarez",
          birth_year: null,
          archived_at: "2026-10-01T10:00:00+00:00",
        }),
        personRow(uuid(3), ORG, {
          first_name: "Ana",
          last_name: "Alonso",
          team_players: [
            { teams: { id: uuid(21), name: "Equipo A", seasons: CURRENT_SEASON } },
            { teams: { id: uuid(22), name: "Equipo viejo", seasons: LAST_SEASON } },
          ],
          team_staff: [{ staff_role: "assistant", teams: { id: uuid(23), name: "Equipo B", seasons: CURRENT_SEASON } }],
        }),
        personRow(uuid(4), ORG, { first_name: "Bea", last_name: "Alonso" }),
        personRow(uuid(9), OTHER_ORG, { first_name: "De", last_name: "Aaaotro club" }),
      ],
    };
  }

  it("las personas del club, archivadas incluidas, y ninguna de otro club", async () => {
    const calls = install(store());

    const people = await listPeople(ADMIN);

    expect(people.map((person) => person.id).sort()).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)]);
    expect(people.find((person) => person.id === uuid(2))?.archived).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "people",
      eq: { organization_id: ORG },
      order: ["last_name", "first_name", "id"],
      limit: PEOPLE_LIMIT,
    });
  });

  it("por apellidos y nombre como se leen en español: la «Á» junto a la «A», no al final", async () => {
    install(store());

    const people = await listPeople(ADMIN);

    // La base ordena por bytes («Álvarez» detrás de «Zamora»); la lista, no.
    expect(people.map((person) => `${person.lastName}, ${person.firstName}`)).toEqual([
      "Alonso, Ana",
      "Alonso, Bea",
      "Álvarez, Luis",
      "Zamora, Eva",
    ]);
  });

  it("cada una con su año de nacimiento (y nada más de su fecha) y sus equipos de la temporada actual", async () => {
    install(store());

    const people = await listPeople(ADMIN);

    expect(people[0]).toEqual({
      id: uuid(3),
      firstName: "Ana",
      lastName: "Alonso",
      birthYear: 2014,
      archived: false,
      teams: ["Equipo A", "Equipo B"],
    });
    expect(people[2]).toEqual({
      id: uuid(2),
      firstName: "Luis",
      lastName: "Álvarez",
      birthYear: null,
      archived: true,
      teams: [],
    });
  });

  it("lee como mucho mil personas de una vez", async () => {
    const calls = install(store());

    await listPeople(ADMIN);

    expect(PEOPLE_LIMIT).toBe(1000);
    expect(calls[0].limit).toBe(1000);
  });

  it("un club sin personas: lista vacía", async () => {
    install({ people: [personRow(uuid(9), OTHER_ORG)] });

    await expect(listPeople(ADMIN)).resolves.toEqual([]);
  });

  it("un error de lectura se registra y lanza: no es una lista vacía", async () => {
    install(store(), { people: FAILURE });

    await expectReadError(() => listPeople(ADMIN), "structure.people");
  });
});

describe("getPerson", () => {
  const P_MINE = uuid(51);
  const P_OTHER_CLUB = uuid(59);

  function store(): Store {
    return {
      people: [
        personRow(P_MINE, ORG, {
          first_name: "Ana",
          last_name: "Alonso",
          team_players: [
            { teams: { id: uuid(22), name: "Equipo viejo", seasons: LAST_SEASON } },
            { teams: { id: uuid(21), name: "Equipo A", seasons: CURRENT_SEASON } },
          ],
          team_staff: [{ staff_role: "head_coach", teams: { id: uuid(23), name: "Equipo B", seasons: CURRENT_SEASON } }],
          memberships: [
            { role: "admin", status: "revoked" },
            { role: "coach", status: "active" },
          ],
        }),
        personRow(P_OTHER_CLUB, OTHER_ORG, { first_name: "De", last_name: "Otro club" }),
      ],
    };
  }

  it("una persona del club con sus equipos de cualquier temporada (la actual primero) y su acceso", async () => {
    const calls = install(store());

    const person = await getPerson(ADMIN, P_MINE);

    expect(person).toEqual({
      id: P_MINE,
      firstName: "Ana",
      lastName: "Alonso",
      birthYear: 2014,
      archived: false,
      teams: [
        { teamId: uuid(21), teamName: "Equipo A", seasonName: "2026/27", isCurrent: true, as: "player" },
        { teamId: uuid(23), teamName: "Equipo B", seasonName: "2026/27", isCurrent: true, as: "head_coach" },
        { teamId: uuid(22), teamName: "Equipo viejo", seasonName: "2025/26", isCurrent: false, as: "player" },
      ],
      access: "coach",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "people", eq: { organization_id: ORG, id: P_MINE } });
  });

  it("una archivada también se lee: se puede recuperar", async () => {
    install({ people: [personRow(P_MINE, ORG, { archived_at: "2026-10-01T10:00:00+00:00" })] });

    await expect(getPerson(ADMIN, P_MINE)).resolves.toMatchObject({ id: P_MINE, archived: true, access: null });
  });

  it("la de otro club es null, aunque exista", async () => {
    install(store());

    await expect(getPerson(ADMIN, P_OTHER_CLUB)).resolves.toBeNull();
  });

  it("una que no existe es null", async () => {
    install(store());

    await expect(getPerson(ADMIN, uuid(77))).resolves.toBeNull();
  });

  it.each(NOT_UUIDS)("un id que no es un uuid («%s»): null sin consultar", async (id) => {
    const calls = install(store());

    await expect(getPerson(ADMIN, id)).resolves.toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("un error de lectura se registra y lanza: no es un 404", async () => {
    install(store(), { people: FAILURE });

    await expectReadError(() => getPerson(ADMIN, P_MINE), "structure.person");
  });
});
