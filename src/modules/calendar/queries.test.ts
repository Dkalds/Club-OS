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

import { listSeasonSchedules, listTeamSchedules, listVenueNames, listVenues } from "./queries";

// Las lecturas del calendario del club, contra el doble de la base de datos de
// `@/lib/test-support`: aplica de verdad los filtros y el orden que pide cada consulta. Cada
// una filtra por el club: no depende de RLS para no recorrer ni devolver filas de otro club.
//
// Datos neutros y ficticios (pnpm check:guards).

/** Quien consulta Gestión: la dirección del club. Las pistas sugeridas las lee quien entrena (`CTX`). */
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
const NOT_UUIDS = ["no-es-un-id", "", "1", `${uuid(1)}0`, ` ${uuid(1)}`, "equipo-a", "id.eq.1,or(1)"];

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.logError.mockReset();
});

// ── Filas, ya con la forma que devuelve PostgREST ────────────────────────────────────────

const V_ONE = uuid(1);
const V_TWO = uuid(2);
const V_OTHER_CLUB = uuid(9);

/** Una pista; `teams` son los equipos de los horarios que la llevan, uno por horario. */
function venueRow(id: string, organization_id: string, name: string, teams: string[] = []): Row {
  return { id, organization_id, name, team_schedules: teams.map((team) => ({ teams: { name: team } })) };
}

const T_A = uuid(11);
const T_B = uuid(12);
const T_OTHER_CLUB = uuid(19);

function scheduleRow(n: number, organization_id: string, team_id: string, weekday: number, start_time: string, overrides: Row = {}): Row {
  return {
    id: uuid(n),
    organization_id,
    team_id,
    weekday,
    start_time,
    duration_minutes: 75,
    venue_id: null,
    venues: null,
    ...overrides,
  };
}

function teamRow(id: string, organization_id: string, name: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id,
    name,
    categories: { name: "Categoría A", sort: 10 },
    seasons: [{ is_current: true }],
    team_schedules: [],
    ...overrides,
  };
}

// ── Pistas ──────────────────────────────────────────────────────────────────────────────

describe("listVenues", () => {
  it("las pistas del club, por nombre, y ninguna de otro club", async () => {
    const calls = install({
      venues: [
        venueRow(V_TWO, ORG, "Pista 2"),
        venueRow(V_OTHER_CLUB, OTHER_ORG, "Pista de otro club", ["Equipo de otro club"]),
        venueRow(V_ONE, ORG, "Pista 1"),
      ],
    });

    const venues = await listVenues(ADMIN);

    expect(venues.map((venue) => venue.name)).toEqual(["Pista 1", "Pista 2"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "venues", eq: { organization_id: ORG }, order: ["name", "id"] });
  });

  it("cada una dice qué equipos tienen algún horario en ella, sin repetir y por nombre", async () => {
    install({
      venues: [venueRow(V_ONE, ORG, "Pista 1", ["Equipo B", "Equipo A", "Equipo B"]), venueRow(V_TWO, ORG, "Pista 2")],
    });

    expect(await listVenues(ADMIN)).toEqual([
      { id: V_ONE, name: "Pista 1", usedBy: ["Equipo A", "Equipo B"] },
      { id: V_TWO, name: "Pista 2", usedBy: [] },
    ]);
  });

  it("el orden es el del español, no el de los bytes de la base", async () => {
    install({
      venues: [
        venueRow(uuid(1), ORG, "Zona norte"),
        venueRow(uuid(2), ORG, "pista b"),
        venueRow(uuid(3), ORG, "Ágora"),
        venueRow(uuid(4), ORG, "Pista A"),
      ],
    });

    expect((await listVenues(ADMIN)).map((venue) => venue.name)).toEqual(["Ágora", "Pista A", "pista b", "Zona norte"]);
  });

  it("dos que se leen igual salen por id: el orden es estable", async () => {
    install({ venues: [venueRow(uuid(7), ORG, "Pista 1"), venueRow(uuid(3), ORG, "Pista 1")] });

    expect((await listVenues(ADMIN)).map((venue) => venue.id)).toEqual([uuid(3), uuid(7)]);
  });

  it("sin pistas, una lista vacía", async () => {
    install({ venues: [venueRow(V_OTHER_CLUB, OTHER_ORG, "Pista de otro club")] });

    expect(await listVenues(ADMIN)).toEqual([]);
  });

  it("si la lectura falla, lo registra y lanza en vez de enseñar un club sin pistas", async () => {
    install({}, { venues: FAILURE });

    await expectReadError(() => listVenues(ADMIN), "calendar.venues");
  });
});

describe("listVenueNames", () => {
  it("los nombres de las pistas del club, como se leen en español, y ninguno de otro club", async () => {
    const calls = install({
      venues: [
        venueRow(uuid(1), ORG, "Zona norte"),
        venueRow(V_OTHER_CLUB, OTHER_ORG, "Pista de otro club"),
        venueRow(uuid(3), ORG, "Ágora"),
        venueRow(uuid(4), ORG, "Pista 1"),
      ],
    });

    expect(await listVenueNames(CTX)).toEqual(["Ágora", "Pista 1", "Zona norte"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "venues", eq: { organization_id: ORG } });
  });

  it("solo son textos: ni ids ni recuentos", async () => {
    install({ venues: [venueRow(V_ONE, ORG, "Pista 1", ["Equipo A"])] });

    expect(await listVenueNames(CTX)).toEqual(["Pista 1"]);
  });

  it("sin pistas, una lista vacía", async () => {
    install({});

    expect(await listVenueNames(CTX)).toEqual([]);
  });

  it("si la lectura falla, lo registra y lanza", async () => {
    install({}, { venues: FAILURE });

    await expectReadError(() => listVenueNames(CTX), "calendar.venue-names");
  });
});

// ── Horarios semanales ──────────────────────────────────────────────────────────────────

describe("listTeamSchedules", () => {
  function store(): Store {
    return {
      team_schedules: [
        scheduleRow(21, ORG, T_A, 4, "19:30:00"),
        scheduleRow(22, ORG, T_A, 2, "18:00:00", { venue_id: V_ONE, venues: { name: "Pista 1" } }),
        scheduleRow(23, ORG, T_B, 1, "17:00:00"),
        // El mismo id de equipo en otro club: sin el filtro de club, saldría.
        scheduleRow(29, OTHER_ORG, T_A, 3, "10:00:00"),
      ],
    };
  }

  it("los horarios de ese equipo de este club, de lunes a domingo, y ninguno de otro equipo ni de otro club", async () => {
    const calls = install(store());

    const schedules = await listTeamSchedules(ADMIN, T_A);

    expect(schedules).toEqual([
      { id: uuid(22), teamId: T_A, weekday: 2, startTime: "18:00", durationMinutes: 75, venueId: V_ONE, venueName: "Pista 1" },
      { id: uuid(21), teamId: T_A, weekday: 4, startTime: "19:30", durationMinutes: 75, venueId: null, venueName: null },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "team_schedules", eq: { organization_id: ORG, team_id: T_A } });
  });

  it("un equipo sin horarios, o que no es de este club, da una lista vacía", async () => {
    install(store());

    expect(await listTeamSchedules(ADMIN, uuid(77))).toEqual([]);
    expect(await listTeamSchedules(ADMIN, T_OTHER_CLUB)).toEqual([]);
  });

  it.each(NOT_UUIDS)("un id que no tiene forma de uuid (%j) ni se consulta", async (teamId) => {
    const calls = install(store());

    expect(await listTeamSchedules(ADMIN, teamId)).toEqual([]);
    expect(calls).toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("si la lectura falla, lo registra y lanza en vez de enseñar un equipo sin horarios", async () => {
    install(store(), { team_schedules: FAILURE });

    await expectReadError(() => listTeamSchedules(ADMIN, T_A), "calendar.team-schedules");
  });
});

describe("listSeasonSchedules", () => {
  function store(): Store {
    return {
      teams: [
        teamRow(T_B, ORG, "Equipo B", {
          categories: { name: "Categoría mayor", sort: 20 },
          team_schedules: [scheduleRow(31, ORG, T_B, 3, "17:00:00")],
        }),
        teamRow(T_A, ORG, "Equipo A", {
          team_schedules: [
            scheduleRow(33, ORG, T_A, 4, "19:30:00"),
            scheduleRow(32, ORG, T_A, 2, "18:00:00", { venue_id: V_ONE, venues: { name: "Pista 1" } }),
          ],
        }),
        // De una temporada pasada: el `!inner` con `is_current` lo deja fuera.
        teamRow(uuid(13), ORG, "Equipo de la temporada pasada", { seasons: [{ is_current: false }] }),
        teamRow(T_OTHER_CLUB, OTHER_ORG, "Equipo de otro club", {
          team_schedules: [scheduleRow(39, OTHER_ORG, T_OTHER_CLUB, 1, "09:00:00")],
        }),
      ],
    };
  }

  it("los equipos de la temporada actual de este club, por categoría, cada uno con sus horarios ordenados", async () => {
    install(store());

    const teams = await listSeasonSchedules(ADMIN);

    expect(teams.map((team) => [team.teamName, team.categoryName])).toEqual([
      ["Equipo A", "Categoría A"],
      ["Equipo B", "Categoría mayor"],
    ]);
    expect(teams[0]?.schedules.map((schedule) => `${schedule.weekday} ${schedule.startTime} ${schedule.venueName}`)).toEqual([
      "2 18:00 Pista 1",
      "4 19:30 null",
    ]);
    expect(teams[1]?.schedules).toHaveLength(1);
  });

  it("filtra por club y por temporada actual", async () => {
    const calls = install(store());

    await listSeasonSchedules(ADMIN);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "teams",
      eq: { organization_id: ORG },
      embedded: { seasons: { eq: { is_current: true } } },
    });
  });

  it("ni los equipos de otras temporadas ni los de otro club", async () => {
    install(store());

    const names = (await listSeasonSchedules(ADMIN)).map((team) => team.teamName);

    expect(names).not.toContain("Equipo de la temporada pasada");
    expect(names).not.toContain("Equipo de otro club");
  });

  it("un equipo sin horarios también sale: es al que hay que dárselos", async () => {
    install({ teams: [teamRow(T_A, ORG, "Equipo A")] });

    expect(await listSeasonSchedules(ADMIN)).toEqual([
      { teamId: T_A, teamName: "Equipo A", categoryName: "Categoría A", schedules: [] },
    ]);
  });

  it("sin temporada actual, o sin equipos en ella, una lista vacía", async () => {
    install({ teams: [teamRow(T_A, ORG, "Equipo A", { seasons: [{ is_current: false }] })] });

    expect(await listSeasonSchedules(ADMIN)).toEqual([]);
  });

  it("si la lectura falla, lo registra y lanza", async () => {
    install(store(), { teams: FAILURE });

    await expectReadError(() => listSeasonSchedules(ADMIN), "calendar.season-schedules");
  });
});
