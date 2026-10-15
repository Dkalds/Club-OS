import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubContext } from "@/modules/tenancy/queries";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { getTeam, listMyTeams, listStaffTeams, listTeamsForAdmin } from "./queries";

// Un doble mínimo de la base de datos, como el de `practice/queries.test.ts`: aplica de verdad
// los `eq` (también sobre columnas anidadas, como hace PostgREST con `!inner`) y apunta qué
// llegó. Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).

type Row = Record<string, unknown>;
type Failure = { name: string; code: string; message: string };
type Call = { table: string; select: string | null; eq: Record<string, unknown> };

function valueAt(row: Row, path: string): unknown {
  let current: unknown = row;
  for (const key of path.split(".")) {
    if (Array.isArray(current)) current = current[0];
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Row)[key];
  }
  return current;
}

class FakeQuery implements PromiseLike<{ data: Row[] | null; error: Failure | null }> {
  private readonly call: Call;

  constructor(
    table: string,
    private readonly rows: Row[],
    private readonly failure: Failure | null,
    calls: Call[],
  ) {
    this.call = { table, select: null, eq: {} };
    calls.push(this.call);
  }

  select(columns: string) {
    this.call.select = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.call.eq[column] = value;
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.run()).then(({ data, error }) => ({ data: data?.[0] ?? null, error }));
  }

  then<T1, T2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: Failure | null }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private run() {
    if (this.failure) return { data: null, error: this.failure };
    const data = this.rows.filter((row) =>
      Object.entries(this.call.eq).every(([column, value]) => valueAt(row, column) === value),
    );
    return { data, error: null };
  }
}

type Table = "teams" | "team_staff";

function installDatabase(store: Partial<Record<Table, Row[]>>, failing: Partial<Record<Table, Failure>> = {}) {
  const calls: Call[] = [];
  mocks.createClient.mockResolvedValue({
    from: (table: Table) => new FakeQuery(table, store[table] ?? [], failing[table] ?? null, calls),
  });
  return calls;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const COACH = clubContext("coach");
const ADMIN: ClubContext = { ...COACH, membership: { role: "admin", personId: null } };
const ORG = COACH.org.id;
const ME = COACH.membership.personId as string;

const TEAM_A = uuid(1);
const TEAM_B = uuid(2);
const TEAM_OLD = uuid(3);

const team = (id: string, name: string, current: boolean, organizationId = ORG) => ({
  id,
  name,
  organization_id: organizationId,
  categories: { name: "Categoría", sort: 10 },
  seasons: { name: current ? "2026/27" : "2025/26", is_current: current },
});

function store() {
  const a = team(TEAM_A, "Equipo A", true);
  const b = team(TEAM_B, "Equipo B", true);
  const old = team(TEAM_OLD, "Equipo viejo", false);
  return {
    teams: [a, b, old, team(uuid(9), "De otro club", true, uuid(900))],
    team_staff: [
      { organization_id: ORG, person_id: ME, teams: a },
      { organization_id: ORG, person_id: ME, teams: old },
    ],
  };
}

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.logError.mockReset();
});

describe("listTeamsForAdmin", () => {
  it("todos los equipos del club de la temporada actual, para un select de Gestión", async () => {
    installDatabase(store());

    const teams = await listTeamsForAdmin(ADMIN);

    expect(teams.map((t) => t.id)).toEqual([TEAM_A, TEAM_B]);
  });
});

describe("listMyTeams", () => {
  it("la dirección: todos los equipos del club de la temporada actual", async () => {
    const calls = installDatabase(store());

    const teams = await listMyTeams(ADMIN);

    expect(teams.map((t) => t.id)).toEqual([TEAM_A, TEAM_B]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "teams",
      eq: { organization_id: ORG, "seasons.is_current": true },
    });
  });

  it("quien entrena: los de su cuerpo técnico de la temporada actual, no los de la pasada", async () => {
    const calls = installDatabase(store());

    const teams = await listMyTeams(COACH);

    expect(teams).toEqual([
      { id: TEAM_A, name: "Equipo A", categoryName: "Categoría", seasonName: "2026/27" },
    ]);
    expect(calls[0]).toMatchObject({
      table: "team_staff",
      eq: { organization_id: ORG, person_id: ME, "teams.seasons.is_current": true },
    });
  });

  it("sin persona asociada y sin ser dirección: ninguno, sin consultar", async () => {
    const calls = installDatabase(store());

    expect(await listMyTeams({ ...COACH, membership: { role: "coach", personId: null } })).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("un error de lectura se registra y lanza, no es una lista vacía", async () => {
    installDatabase(store(), { team_staff: { name: "PostgrestError", code: "XX000", message: "boom" } });

    await expect(listMyTeams(COACH)).rejects.toThrow();
    expect(mocks.logError).toHaveBeenCalled();
  });
});

describe("listStaffTeams", () => {
  it("los equipos del cuerpo técnico de la temporada actual, también para la dirección", async () => {
    installDatabase(store());

    expect((await listStaffTeams(ADMIN.org.id, ME)).map((t) => t.id)).toEqual([TEAM_A]);
  });
});

describe("getTeam", () => {
  it("un equipo del club de la temporada actual, con su plantilla", async () => {
    const calls = installDatabase({
      teams: [{ ...team(TEAM_A, "Equipo A", true), team_staff: [], team_players: [] }],
    });

    const detail = await getTeam(COACH, TEAM_A);

    expect(detail).toMatchObject({ id: TEAM_A, name: "Equipo A", players: [], staff: [] });
    expect(calls[0]).toMatchObject({
      table: "teams",
      eq: { organization_id: ORG, id: TEAM_A, "seasons.is_current": true },
    });
  });

  it("de la temporada pasada, de otro club o que no se ve: null", async () => {
    installDatabase({
      teams: [
        { ...team(TEAM_OLD, "Viejo", false), team_staff: [], team_players: [] },
        { ...team(uuid(9), "Ajeno", true, uuid(900)), team_staff: [], team_players: [] },
      ],
    });

    expect(await getTeam(COACH, TEAM_OLD)).toBeNull();
    expect(await getTeam(COACH, uuid(9))).toBeNull();
    expect(await getTeam(COACH, uuid(77))).toBeNull();
  });

  it("un id que no es un uuid: null sin consultar", async () => {
    const calls = installDatabase({});

    expect(await getTeam(COACH, "no-es-un-id")).toBeNull();
    expect(calls).toEqual([]);
  });
});
