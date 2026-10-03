import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_BRAND_COLORS } from "@/modules/tenancy/branding";
import type { ClubContext } from "@/modules/tenancy/queries";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { getHomeData } from "./queries";

// ── Un doble mínimo de la base de datos ──────────────────────────────────────────────
// No ejecuta SQL ni mira la cadena del `select` (de eso se encarga el tipado de supabase-js
// contra `Database`, que `pnpm typecheck` comprueba). Guarda filas ya con la forma que
// devuelve PostgREST y aplica de verdad los filtros, el orden y el límite que pide la
// consulta: así se ve qué filas salen y qué filtros llegaron, y que la consulta nunca
// pregunta por todo el club.
//
// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

type Row = Record<string, unknown>;
type Failure = { name: string; code: string; message: string };
type Result = { data: Row[] | Row | null; error: Failure | null };
type Call = {
  table: string;
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
  gt: Record<string, string>;
  order: string[];
  limit: number | null;
};

class FakeQuery implements PromiseLike<Result> {
  private readonly call: Call;
  private readonly filters: Array<(row: Row) => boolean> = [];
  private readonly sorts: Array<{ column: string; ascending: boolean }> = [];

  constructor(
    table: string,
    private readonly rows: Row[],
    private readonly failure: Failure | null,
    calls: Call[],
  ) {
    this.call = { table, eq: {}, in: {}, gt: {}, order: [], limit: null };
    calls.push(this.call);
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.call.eq[column] = value;
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.call.in[column] = values;
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  gt(column: string, value: string) {
    this.call.gt[column] = value;
    this.filters.push((row) => new Date(String(row[column])).getTime() > new Date(value).getTime());
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.call.order.push(column);
    this.sorts.push({ column, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number) {
    this.call.limit = count;
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.run()).then(({ data, error }) => ({
      data: Array.isArray(data) ? (data[0] ?? null) : data,
      error,
    }));
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private run(): { data: Row[] | null; error: Failure | null } {
    if (this.failure) return { data: null, error: this.failure };

    let result = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    for (const { column, ascending } of [...this.sorts].reverse()) {
      result = [...result].sort((a, b) => {
        const left = String(a[column]);
        const right = String(b[column]);
        const byTime = new Date(left).getTime() - new Date(right).getTime();
        const order = byTime || (left < right ? -1 : left > right ? 1 : 0);
        return ascending ? order : -order;
      });
    }
    if (this.call.limit !== null) result = result.slice(0, this.call.limit);
    return { data: result, error: null };
  }
}

type Store = Partial<Record<"people" | "team_staff" | "events", Row[]>>;

function installDatabase(store: Store, failing: Partial<Record<keyof Store, Failure>> = {}) {
  const calls: Call[] = [];
  mocks.createClient.mockResolvedValue({
    from: (table: keyof Store) => new FakeQuery(table, store[table] ?? [], failing[table] ?? null, calls),
  });
  return calls;
}

// ── Datos ────────────────────────────────────────────────────────────────────────────
const NOW = "2026-10-02T10:00:00.000Z"; // viernes 2 oct, 12:00 en Madrid

const ORG = "org-a";
const OTHER_ORG = "org-b";
const ME = "person-me";
const OTHER_PERSON = "person-other";

const CTX: ClubContext = {
  org: { id: ORG, slug: "club-a", name: "Club A", timezone: "Europe/Madrid" },
  branding: {
    displayName: "Club A",
    wordmarkSub: null,
    shortName: "CLA",
    wayName: "The Way",
    tagline: null,
    colors: { ...PLATFORM_BRAND_COLORS },
    terminology: {},
  },
  membership: { role: "coach", personId: ME },
};

const FAILURE: Failure = { name: "PostgrestError", code: "42501", message: "fila de ana@club-a.test" };

function staffRow(organization_id: string, person_id: string, team: { id: string; name: string }): Row {
  return { organization_id, person_id, teams: { ...team, seasons: { name: "2026-27" } } };
}

function eventRow(id: string, team_id: string, startsAt: string, endsAt: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id: ORG,
    team_id,
    kind: "practice",
    status: "scheduled",
    starts_at: startsAt,
    ends_at: endsAt,
    location: "Pabellón 2",
    practice_plans: [
      {
        title: "Transición + rebote defensivo",
        primary_focus: { name: "Defensa" },
        secondary_focus: null,
        practice_items: [
          { sort: 1, minutes: 25 },
          { sort: 0, minutes: 20 },
        ],
      },
    ],
    games: [],
    ...overrides,
  };
}

function fullStore(): Store {
  return {
    people: [
      { id: ME, organization_id: ORG, first_name: "Ana" },
      { id: OTHER_PERSON, organization_id: ORG, first_name: "Otra" },
      { id: ME, organization_id: OTHER_ORG, first_name: "Mismo id, otro club" },
    ],
    team_staff: [
      staffRow(ORG, ME, { id: "team-a", name: "Equipo A" }),
      staffRow(ORG, OTHER_PERSON, { id: "team-b", name: "Equipo B" }),
      staffRow(OTHER_ORG, ME, { id: "team-c", name: "Equipo C" }),
    ],
    events: [
      eventRow("mine", "team-a", "2026-10-06T16:00:00+00:00", "2026-10-06T17:15:00+00:00"),
      eventRow("other-team", "team-b", "2026-10-03T16:00:00+00:00", "2026-10-03T17:15:00+00:00"),
      eventRow("other-club", "team-c", "2026-10-03T08:00:00+00:00", "2026-10-03T09:15:00+00:00", {
        organization_id: OTHER_ORG,
      }),
    ],
  };
}

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.logError.mockReset();
});

describe("getHomeData", () => {
  it("devuelve el nombre, los equipos y los eventos de la persona, y nada de otros equipos ni clubes", async () => {
    installDatabase(fullStore());

    const home = await getHomeData(CTX, NOW);

    expect(home).toEqual({
      greeting: "Buenos días",
      firstName: "Ana",
      kicker: "Equipo A · Temporada 2026-27",
      nextPractice: {
        eventId: "mine",
        teamName: "Equipo A",
        slotLabel: "Martes 6 oct · 18:00–19:15",
        title: "Transición + rebote defensivo",
        totalMinutes: 45,
        drillCount: 2,
        focus: ["Defensa"],
        location: "Pabellón 2",
      },
      nextGame: null,
      week: [
        {
          eventId: "mine",
          kind: "practice",
          dow: "Mar",
          day: "6",
          title: "Entrenamiento",
          subtitle: "Transición + rebote defensivo",
          time: "18:00",
        },
      ],
      hasTeams: true,
    });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("filtra siempre por club y por persona o por equipos: nunca pregunta por todo el club", async () => {
    const calls = installDatabase(fullStore());

    await getHomeData(CTX, NOW);

    const call = (table: string) => calls.find((entry) => entry.table === table);
    expect(call("people")?.eq).toEqual({ organization_id: ORG, id: ME });
    expect(call("team_staff")?.eq).toEqual({ organization_id: ORG, person_id: ME });
    expect(call("events")?.eq).toMatchObject({ organization_id: ORG, status: "scheduled" });
    expect(call("events")?.in).toEqual({ team_id: ["team-a"] });
  });

  it("pide solo lo que no ha terminado, ordenado por inicio y con límite", async () => {
    const calls = installDatabase(fullStore());

    await getHomeData(CTX, NOW);

    const events = calls.find((entry) => entry.table === "events");
    expect(events?.gt).toEqual({ ends_at: NOW });
    expect(events?.order).toEqual(["starts_at", "id"]);
    expect(events?.limit).toBe(30);
  });

  it("con varios equipos, trae los eventos de todos ellos", async () => {
    const store = fullStore();
    store.team_staff = [
      staffRow(ORG, ME, { id: "team-a", name: "Equipo A" }),
      staffRow(ORG, ME, { id: "team-b", name: "Equipo B" }),
    ];
    const calls = installDatabase(store);

    const home = await getHomeData(CTX, NOW);

    expect(calls.find((entry) => entry.table === "events")?.in).toEqual({ team_id: ["team-a", "team-b"] });
    expect(home.kicker).toBe("2 equipos · Temporada 2026-27");
    expect(home.week.map((item) => item.eventId)).toEqual(["other-team", "mine"]);
    expect(home.week.map((item) => item.subtitle)).toEqual([
      "Equipo B · Transición + rebote defensivo",
      "Equipo A · Transición + rebote defensivo",
    ]);
  });

  it("sin equipos no consulta los eventos y devuelve el estado vacío", async () => {
    const store = fullStore();
    store.team_staff = [];
    const calls = installDatabase(store);

    const home = await getHomeData(CTX, NOW);

    expect(calls.map((entry) => entry.table)).not.toContain("events");
    expect(home).toMatchObject({
      firstName: "Ana",
      hasTeams: false,
      kicker: null,
      nextPractice: null,
      nextGame: null,
      week: [],
    });
  });

  it("una membresía sin persona no consulta nada: nombre vacío y sin equipos", async () => {
    const calls = installDatabase(fullStore());

    const home = await getHomeData({ ...CTX, membership: { role: "admin", personId: null } }, NOW);

    expect(calls).toEqual([]);
    expect(home).toMatchObject({ firstName: "", hasTeams: false, week: [] });
  });

  it("si no se lee la persona, el nombre queda vacío y la pantalla sigue", async () => {
    const store = fullStore();
    store.people = [];
    installDatabase(store);

    const home = await getHomeData(CTX, NOW);

    expect(home.firstName).toBe("");
    expect(home.hasTeams).toBe(true);
  });

  it("lee un partido con su rival, su competición y dónde se juega", async () => {
    const store = fullStore();
    store.events = [
      eventRow("match", "team-a", "2026-10-10T08:30:00+00:00", "2026-10-10T10:00:00+00:00", {
        kind: "game",
        practice_plans: [],
        games: [{ opponent_name: "Rival C", competition_name: "Liga base", home_away: "away" }],
      }),
    ];
    installDatabase(store);

    const home = await getHomeData(CTX, NOW);

    expect(home.nextGame).toEqual({
      eventId: "match",
      teamName: "Equipo A",
      slotLabel: "Sábado 10 oct · 10:30 · Visitante",
      opponent: "Rival C",
      competition: "Liga base",
    });
  });

  it("usa la zona horaria del club", async () => {
    installDatabase(fullStore());

    const home = await getHomeData(
      { ...CTX, org: { ...CTX.org, timezone: "America/Mexico_City" } },
      NOW,
    );

    expect(home.nextPractice?.slotLabel).toBe("Martes 6 oct · 10:00–11:15");
    expect(home.greeting).toBe("Buenas noches"); // 04:00 en México
  });

  describe.each(["people", "team_staff", "events"] as const)("si falla la consulta de %s", (table) => {
    it("lo registra sin datos personales y lanza, en vez de enseñar datos vacíos", async () => {
      installDatabase(fullStore(), { [table]: FAILURE });

      const error = await getHomeData(CTX, NOW).then(
        () => null,
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).message)).not.toContain("ana@club-a.test");
      expect(mocks.logError).toHaveBeenCalledTimes(1);
      const [tag, logged] = mocks.logError.mock.calls[0] as [string, unknown];
      expect(tag).toMatch(/^home\./);
      expect(logged).toBe(FAILURE);
    });
  });
});
