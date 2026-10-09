import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { getGoalFormOptions, getPlayerProfile } from "./queries";

// Un doble mínimo de la base de datos: aplica los `eq` (también anidados, como el `!inner` de
// PostgREST) y apunta qué llegó. RLS no se simula: lo prueban pgTAP y la integración.
// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).

type Row = Record<string, unknown>;
type Failure = { name: string; code: string; message: string };
type Call = { table: string; eq: Record<string, unknown>; order: string[] };

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
    this.call = { table, eq: {}, order: [] };
    calls.push(this.call);
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.call.eq[column] = value;
    return this;
  }

  order(column: string) {
    this.call.order.push(column);
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

type Table = "team_players" | "player_goals" | "coach_notes" | "focus_areas" | "standards";

function installDatabase(
  store: Partial<Record<Table, Row[]>>,
  failing: Partial<Record<Table, Failure>> = {},
  userId = ME_USER,
) {
  const calls: Call[] = [];
  mocks.createClient.mockResolvedValue({
    from: (table: Table) => new FakeQuery(table, store[table] ?? [], failing[table] ?? null, calls),
    auth: { getClaims: async () => ({ data: { claims: { sub: userId } }, error: null }) },
  });
  return calls;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CTX = clubContext("coach");
const ORG = CTX.org.id;
const TEAM = uuid(1);
const PLAYER = uuid(2);
const ME_USER = uuid(900);
const FAILURE: Failure = { name: "PostgrestError", code: "42501", message: "fila con datos" };

const rosterRow = (current = true) => ({
  organization_id: ORG,
  team_id: TEAM,
  person_id: PLAYER,
  jersey_number: 4,
  position: "Base",
  people: { id: PLAYER, first_name: "Ana", last_name: "Pino" },
  teams: { id: TEAM, name: "Equipo A", categories: { name: "Categoría" }, seasons: { is_current: current } },
});

const scoped = (extra: Row) => ({ organization_id: ORG, team_id: TEAM, person_id: PLAYER, ...extra });

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.logError.mockReset();
});

describe("getPlayerProfile", () => {
  it("lee el jugador, sus objetivos y sus notas acotados al club, al equipo y al jugador", async () => {
    const calls = installDatabase({
      team_players: [rosterRow()],
      player_goals: [
        scoped({
          id: uuid(10), title: "Mío", description: null, status: "active", achieved_at: null,
          created_at: "2026-10-01T10:00:00Z", focus_areas: null, standards: null,
        }),
        { ...scoped({ id: uuid(11), title: "De otro equipo", status: "active" }), team_id: uuid(99) },
      ],
      coach_notes: [
        scoped({
          id: uuid(20), body: "Nota", visibility: "private", created_at: "2026-10-01T10:00:00Z",
          updated_at: "2026-10-01T10:00:00Z", author_id: ME_USER, author: null,
        }),
      ],
    });

    const profile = await getPlayerProfile(CTX, TEAM, PLAYER);

    expect(profile?.activeGoals.map((g) => g.title)).toEqual(["Mío"]);
    expect(profile?.notes).toMatchObject([{ body: "Nota", isMine: true }]);
    const scope = { organization_id: ORG, team_id: TEAM, person_id: PLAYER };
    expect(calls.find((c) => c.table === "team_players")?.eq).toEqual({
      ...scope,
      "teams.seasons.is_current": true,
    });
    expect(calls.find((c) => c.table === "player_goals")?.eq).toEqual(scope);
    expect(calls.find((c) => c.table === "coach_notes")?.eq).toEqual(scope);
  });

  it("si el jugador no está en la plantilla de ese equipo de esta temporada: null, sin leer más", async () => {
    const calls = installDatabase({ team_players: [rosterRow(false)] });

    expect(await getPlayerProfile(CTX, TEAM, PLAYER)).toBeNull();
    expect(calls.map((c) => c.table)).toEqual(["team_players"]);
  });

  it("ids que no son uuid: null sin consultar", async () => {
    const calls = installDatabase({});

    expect(await getPlayerProfile(CTX, "equipo", PLAYER)).toBeNull();
    expect(await getPlayerProfile(CTX, TEAM, "Ana")).toBeNull();
    expect(calls).toEqual([]);
  });

  it.each(["team_players", "player_goals", "coach_notes"] as const)(
    "si falla la lectura de %s, se registra y lanza sin el contenido",
    async (table) => {
      installDatabase({ team_players: [rosterRow()] }, { [table]: FAILURE });

      const error = await getPlayerProfile(CTX, TEAM, PLAYER).then(
        () => null,
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).message)).not.toContain("fila con datos");
      expect(mocks.logError).toHaveBeenCalledTimes(1);
    },
  );
});

describe("getGoalFormOptions", () => {
  it("los focos del club y sus Standards publicados", async () => {
    const calls = installDatabase({
      focus_areas: [{ organization_id: ORG, id: uuid(1), name: "Técnica" }],
      standards: [
        { organization_id: ORG, status: "published", id: uuid(3), number: 3, title: "Tres" },
        { organization_id: ORG, status: "draft", id: uuid(4), number: 1, title: "Borrador" },
      ],
    });

    expect(await getGoalFormOptions(CTX)).toEqual({
      focusAreas: [{ id: uuid(1), name: "Técnica" }],
      standards: [{ id: uuid(3), number: 3, title: "Tres" }],
    });
    expect(calls.find((c) => c.table === "standards")?.eq).toEqual({
      organization_id: ORG,
      status: "published",
    });
  });
});
