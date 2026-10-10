import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { PROPOSAL_SCAN_LIMIT, RECENT_SESSIONS, ageOfBand, getProposalInput } from "./proposal-queries";

// ── Un doble pequeño de la base de datos, por tabla ──────────────────────────────────────
// No ejecuta SQL ni aplica los filtros: cada tabla responde con lo que el test le prepara y
// cada consulta apunta lo que se le pidió. Así se ve qué filtros viajan (que ninguna lectura
// pregunta por todo el club) y qué sale de lo que vuelve. La cadena del `select` la comprueba
// el tipado de supabase-js contra `Database` (`pnpm typecheck`).
//
// `events` se lee dos veces: primero el entreno (con `maybeSingle`) y después las sesiones
// recientes del equipo. Sus respuestas van en ese orden.
//
// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

type Failure = { name: string; code: string; message: string };
type Reply = { data: unknown; error: Failure | null; count?: number | null };
type Call = { method: string; args: unknown[] };

class FakeQuery implements PromiseLike<Reply> {
  readonly calls: Call[] = [];

  constructor(
    readonly table: string,
    private readonly reply: Reply,
  ) {}

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  select = (...args: unknown[]) => this.record("select", args);
  eq = (...args: unknown[]) => this.record("eq", args);
  neq = (...args: unknown[]) => this.record("neq", args);
  in = (...args: unknown[]) => this.record("in", args);
  lt = (...args: unknown[]) => this.record("lt", args);
  order = (...args: unknown[]) => this.record("order", args);
  limit = (...args: unknown[]) => this.record("limit", args);
  maybeSingle = (...args: unknown[]) => this.record("maybeSingle", args);

  then<A = Reply, B = never>(
    onfulfilled?: ((value: Reply) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.reply).then(onfulfilled, onrejected);
  }

  /** Los argumentos de cada llamada a `method`, en orden. */
  sent(method: string): unknown[][] {
    return this.calls.filter((call) => call.method === method).map((call) => call.args);
  }
}

class FakeDb {
  readonly queries: FakeQuery[] = [];

  constructor(private readonly replies: Record<string, Reply[]>) {}

  from(table: string): FakeQuery {
    const reply = this.replies[table]?.shift();
    if (!reply) throw new Error(`lectura de «${table}» sin respuesta preparada`);

    const query = new FakeQuery(table, reply);
    this.queries.push(query);
    return query;
  }

  /** Las consultas hechas a `table`, en orden. */
  of(table: string): FakeQuery[] {
    return this.queries.filter((query) => query.table === table);
  }

  /** La única consulta hecha a `table`. */
  only(table: string): FakeQuery {
    const queries = this.of(table);
    if (queries.length !== 1) throw new Error(`se esperaba una lectura de «${table}» y hubo ${queries.length}`);
    return queries[0];
  }
}

const reply = (data: unknown): Reply => ({ data, error: null });
/** La cuenta de una lectura con `head: true`: sin filas, solo el número. */
const counted = (count: number | null): Reply => ({ data: null, error: null, count });
const failure = (code = "XX000"): Reply => ({
  data: null,
  error: { name: "PostgrestError", code, message: 'fila con "texto del club"' },
});

const ctx = clubContext("coach");
const ORG = ctx.org.id;
const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const TEAM = "00000000-0000-4000-8000-0000000000e1";
const F1 = "00000000-0000-4000-8000-0000000000f1";
const F2 = "00000000-0000-4000-8000-0000000000f2";
const D1 = "00000000-0000-4000-8000-0000000000d1";
const D2 = "00000000-0000-4000-8000-0000000000d2";
const D3 = "00000000-0000-4000-8000-0000000000d3";
const STARTS = "2026-11-17T17:00:00+00:00";
const ENDS = "2026-11-17T18:15:00+00:00";

type EventRow = {
  id: string;
  team_id: string;
  starts_at: string;
  ends_at: string;
  practice_plans: unknown;
};

/** El entreno como lo devuelve PostgREST: con su plan como lista de un elemento. */
function eventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: EVENT,
    team_id: TEAM,
    starts_at: STARTS,
    ends_at: ENDS,
    practice_plans: [{ primary_focus_id: F1, secondary_focus_id: F2 }],
    ...overrides,
  };
}

type DrillRow = {
  id: string;
  title: string;
  min_age: number;
  max_age: number | null;
  min_players: number;
  max_players: number;
  min_minutes: number;
  max_minutes: number;
  drill_focus_areas: Array<{ focus_areas: { slug: string; name: string; sort: number } | null }>;
  drill_coaching_points: Array<{ is_key: boolean }>;
  drill_variants: Array<{ id: string }>;
};

function drillRow(overrides: Partial<DrillRow> = {}): DrillRow {
  return {
    id: D1,
    title: "Rebote y salida",
    min_age: 10,
    max_age: null,
    min_players: 6,
    max_players: 12,
    min_minutes: 10,
    max_minutes: 15,
    drill_focus_areas: [],
    drill_coaching_points: [],
    drill_variants: [],
    ...overrides,
  };
}

/** Las seis lecturas, cada una con una respuesta corriente que el test puede cambiar. */
type Replies = {
  event: Reply;
  team: Reply;
  roster: Reply;
  focus: Reply;
  drills: Reply;
  recent: Reply;
};

function useDb(overrides: Partial<Replies> = {}): FakeDb {
  const replies: Replies = {
    event: reply(eventRow()),
    team: reply({ id: TEAM, categories: { age_band: "U12" } }),
    roster: counted(9),
    focus: reply([
      { id: F1, slug: "objetivo-a", name: "Objetivo A" },
      { id: F2, slug: "objetivo-b", name: "Objetivo B" },
    ]),
    drills: reply([]),
    recent: reply([]),
    ...overrides,
  };
  const db = new FakeDb({
    events: [replies.event, replies.recent],
    teams: [replies.team],
    team_players: [replies.roster],
    focus_areas: [replies.focus],
    drills: [replies.drills],
  });
  mocks.createClient.mockResolvedValue(db);
  return db;
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ── ageOfBand ────────────────────────────────────────────────────────────────────────────

describe("ageOfBand", () => {
  it.each([
    ["U8", 8],
    ["U12", 12],
    ["U18", 18],
  ])("«%s» es %i", (band, age) => {
    expect(ageOfBand(band)).toBe(age);
  });

  it.each([
    ["sin categoría (null)", null],
    ["sin categoría (undefined)", undefined],
    ["un texto vacío", ""],
    ["un nombre", "Senior"],
    ["la U sola", "U"],
    ["minúscula", "u12"],
    ["tres cifras", "U123"],
    ["con espacios", " U12 "],
    ["con algo detrás", "U12 femenino"],
    ["solo el número", "12"],
  ])("%s no dice ninguna edad", (_name, band) => {
    expect(ageOfBand(band)).toBeNull();
  });
});

// ── getProposalInput ─────────────────────────────────────────────────────────────────────

describe("getProposalInput", () => {
  describe("qué entreno", () => {
    it("un id que no es un uuid es null sin consultar nada", async () => {
      const db = useDb();

      await expect(getProposalInput(ctx, "no-es-un-uuid")).resolves.toBeNull();

      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(db.queries).toEqual([]);
    });

    it("lee el entreno de este club, y solo si es un entreno", async () => {
      const db = useDb();

      await getProposalInput(ctx, EVENT);

      const [event] = db.of("events");
      expect(event.sent("select")).toEqual([
        ["id, team_id, starts_at, ends_at, practice_plans(primary_focus_id, secondary_focus_id)"],
      ]);
      expect(event.sent("eq")).toEqual([
        ["organization_id", ORG],
        ["id", EVENT],
        ["kind", "practice"],
      ]);
      expect(event.sent("maybeSingle")).toHaveLength(1);
    });

    it("un entreno que no llega (no existe, es de otro club o no se ve) es null y no lee nada más", async () => {
      const db = useDb({ event: reply(null) });

      await expect(getProposalInput(ctx, EVENT)).resolves.toBeNull();

      expect(db.queries.map((query) => query.table)).toEqual(["events"]);
    });

    it.each([
      ["una lista vacía", []],
      ["null", null],
    ])("un entreno sin plan (%s) es null y no lee nada más", async (_name, plans) => {
      const db = useDb({ event: reply(eventRow({ practice_plans: plans })) });

      await expect(getProposalInput(ctx, EVENT)).resolves.toBeNull();

      expect(db.queries.map((query) => query.table)).toEqual(["events"]);
    });

    it("vale el plan como objeto, no solo como lista", async () => {
      useDb({ event: reply(eventRow({ practice_plans: { primary_focus_id: F1, secondary_focus_id: null } })) });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.primaryFocus).toEqual({ slug: "objetivo-a", name: "Objetivo A" });
      expect(input?.secondaryFocus).toBeNull();
    });

    it("con el entreno y su plan hace las otras cinco lecturas, una por tabla", async () => {
      const db = useDb();

      await getProposalInput(ctx, EVENT);

      expect(db.queries.map((query) => query.table).sort()).toEqual([
        "drills",
        "events",
        "events",
        "focus_areas",
        "team_players",
        "teams",
      ]);
    });

    it("todas las lecturas van acotadas al club", async () => {
      const db = useDb();

      await getProposalInput(ctx, EVENT);

      expect(db.queries).toHaveLength(6);
      for (const query of db.queries) {
        expect(query.sent("eq"), query.table).toContainEqual(["organization_id", ORG]);
      }
    });
  });

  describe("la franja", () => {
    it("son los minutos de principio a fin", async () => {
      useDb();

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.minutes).toBe(75);
    });

    it("se cuentan entre instantes, vengan con el desfase que vengan", async () => {
      useDb({
        event: reply(eventRow({ starts_at: "2026-11-17T18:00:00+01:00", ends_at: "2026-11-17T18:30:00+00:00" })),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.minutes).toBe(90);
    });

    it("una franja con segundos se redondea al minuto", async () => {
      useDb({
        event: reply(eventRow({ starts_at: "2026-11-17T17:00:00+00:00", ends_at: "2026-11-17T17:59:40+00:00" })),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.minutes).toBe(60);
    });

    it("nunca sale un negativo", async () => {
      useDb({ event: reply(eventRow({ starts_at: ENDS, ends_at: STARTS })) });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.minutes).toBe(0);
    });
  });

  describe("el equipo", () => {
    it("lee el equipo del entreno y su categoría", async () => {
      const db = useDb();

      await getProposalInput(ctx, EVENT);

      const team = db.only("teams");
      expect(team.sent("select")).toEqual([["id, categories(age_band)"]]);
      expect(team.sent("eq")).toEqual([
        ["organization_id", ORG],
        ["id", TEAM],
      ]);
      expect(team.sent("maybeSingle")).toHaveLength(1);
    });

    it("la edad sale de la categoría: «U12» es 12", async () => {
      useDb();

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.age).toBe(12);
    });

    it("vale la categoría como lista de un elemento", async () => {
      useDb({ team: reply({ id: TEAM, categories: [{ age_band: "U14" }] }) });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.age).toBe(14);
    });

    it.each([
      ["el equipo no llega", null],
      ["el equipo no tiene categoría", { id: TEAM, categories: null }],
      ["la categoría llega como lista vacía", { id: TEAM, categories: [] }],
      ["la categoría no tiene forma de edad", { id: TEAM, categories: { age_band: "Senior" } }],
    ])("si %s, la edad es null", async (_name, team) => {
      useDb({ team: reply(team) });

      const input = await getProposalInput(ctx, EVENT);

      expect(input).not.toBeNull();
      expect(input?.age).toBeNull();
    });

    it("cuenta los jugadores del equipo sin traer sus filas", async () => {
      const db = useDb();

      const input = await getProposalInput(ctx, EVENT);

      const roster = db.only("team_players");
      expect(roster.sent("select")).toEqual([["person_id", { count: "exact", head: true }]]);
      expect(roster.sent("eq")).toEqual([
        ["organization_id", ORG],
        ["team_id", TEAM],
      ]);
      expect(input?.players).toBe(9);
    });

    it.each([
      ["0 jugadores", 0],
      ["una cuenta que no llega", null],
    ])("con %s no se sabe cuántos entrenan: null", async (_name, count) => {
      useDb({ roster: counted(count) });

      const input = await getProposalInput(ctx, EVENT);

      expect(input).not.toBeNull();
      expect(input?.players).toBeNull();
    });
  });

  describe("los objetivos de la sesión", () => {
    it("los busca por id en este club y los devuelve con su slug y su nombre", async () => {
      const db = useDb();

      const input = await getProposalInput(ctx, EVENT);

      const focus = db.only("focus_areas");
      expect(focus.sent("select")).toEqual([["id, slug, name"]]);
      expect(focus.sent("eq")).toEqual([["organization_id", ORG]]);
      expect(focus.sent("in")).toEqual([["id", [F1, F2]]]);
      expect(input?.primaryFocus).toEqual({ slug: "objetivo-a", name: "Objetivo A" });
      expect(input?.secondaryFocus).toEqual({ slug: "objetivo-b", name: "Objetivo B" });
    });

    it("cada uno sale por su id, lleguen en el orden que lleguen", async () => {
      useDb({
        focus: reply([
          { id: F2, slug: "objetivo-b", name: "Objetivo B" },
          { id: F1, slug: "objetivo-a", name: "Objetivo A" },
        ]),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.primaryFocus).toEqual({ slug: "objetivo-a", name: "Objetivo A" });
      expect(input?.secondaryFocus).toEqual({ slug: "objetivo-b", name: "Objetivo B" });
    });

    it("con solo el principal pregunta solo por él", async () => {
      const db = useDb({
        event: reply(eventRow({ practice_plans: [{ primary_focus_id: F1, secondary_focus_id: null }] })),
        focus: reply([{ id: F1, slug: "objetivo-a", name: "Objetivo A" }]),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(db.only("focus_areas").sent("in")).toEqual([["id", [F1]]]);
      expect(input?.primaryFocus).toEqual({ slug: "objetivo-a", name: "Objetivo A" });
      expect(input?.secondaryFocus).toBeNull();
    });

    it("una sesión sin objetivos no los consulta", async () => {
      const db = useDb({
        event: reply(eventRow({ practice_plans: [{ primary_focus_id: null, secondary_focus_id: null }] })),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(db.of("focus_areas")).toEqual([]);
      expect(input?.primaryFocus).toBeNull();
      expect(input?.secondaryFocus).toBeNull();
    });

    it("un objetivo que no llega (ya no existe o no se ve) queda en null", async () => {
      useDb({ focus: reply([{ id: F2, slug: "objetivo-b", name: "Objetivo B" }]) });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.primaryFocus).toBeNull();
      expect(input?.secondaryFocus).toEqual({ slug: "objetivo-b", name: "Objetivo B" });
    });
  });

  describe("los ejercicios de la biblioteca", () => {
    it("solo los publicados de este club, por título, con el tope de lectura", async () => {
      const db = useDb();

      await getProposalInput(ctx, EVENT);

      const drills = db.only("drills");
      expect(drills.sent("eq")).toEqual([
        ["organization_id", ORG],
        ["status", "published"],
      ]);
      expect(drills.sent("order")).toEqual([
        ["title", { ascending: true }],
        ["id", { ascending: true }],
      ]);
      expect(drills.sent("limit")).toEqual([[PROPOSAL_SCAN_LIMIT]]);
      expect(PROPOSAL_SCAN_LIMIT).toBe(500);
    });

    it("pide de cada ejercicio sus rangos, sus objetivos, sus puntos y sus variantes", async () => {
      const db = useDb();

      await getProposalInput(ctx, EVENT);

      const [[columns]] = db.only("drills").sent("select");
      for (const column of [
        "id",
        "title",
        "min_age",
        "max_age",
        "min_players",
        "max_players",
        "min_minutes",
        "max_minutes",
        "drill_focus_areas(focus_areas(slug, name, sort))",
        "drill_coaching_points(is_key)",
        "drill_variants(id)",
      ]) {
        expect(String(columns)).toContain(column);
      }
    });

    it("convierte cada fila en lo que mira la propuesta", async () => {
      useDb({
        drills: reply([
          drillRow({
            id: D1,
            title: "Rebote y salida",
            min_age: 10,
            max_age: 14,
            min_players: 6,
            max_players: 12,
            min_minutes: 10,
            max_minutes: 15,
            drill_focus_areas: [{ focus_areas: { slug: "objetivo-a", name: "Objetivo A", sort: 10 } }],
            drill_coaching_points: [{ is_key: true }, { is_key: false }, { is_key: true }],
            drill_variants: [{ id: "00000000-0000-4000-8000-0000000000a1" }],
          }),
        ]),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.drills).toEqual([
        {
          id: D1,
          title: "Rebote y salida",
          minAge: 10,
          maxAge: 14,
          minPlayers: 6,
          maxPlayers: 12,
          minMinutes: 10,
          maxMinutes: 15,
          focus: [{ slug: "objetivo-a", name: "Objetivo A" }],
          keyPoints: 2,
          variants: 1,
        },
      ]);
    });

    it("los objetivos de un ejercicio van por su orden y, a igual orden, por slug; sin el orden en la salida", async () => {
      useDb({
        drills: reply([
          drillRow({
            drill_focus_areas: [
              { focus_areas: { slug: "objetivo-c", name: "Objetivo C", sort: 30 } },
              { focus_areas: { slug: "objetivo-b", name: "Objetivo B", sort: 10 } },
              { focus_areas: { slug: "objetivo-a", name: "Objetivo A", sort: 10 } },
              { focus_areas: { slug: "objetivo-d", name: "Objetivo D", sort: 20 } },
            ],
          }),
        ]),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.drills[0].focus).toStrictEqual([
        { slug: "objetivo-a", name: "Objetivo A" },
        { slug: "objetivo-b", name: "Objetivo B" },
        { slug: "objetivo-d", name: "Objetivo D" },
        { slug: "objetivo-c", name: "Objetivo C" },
      ]);
    });

    it("un enlace cuyo objetivo no llega se ignora", async () => {
      useDb({
        drills: reply([
          drillRow({
            drill_focus_areas: [
              { focus_areas: null },
              { focus_areas: { slug: "objetivo-a", name: "Objetivo A", sort: 10 } },
            ],
          }),
        ]),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.drills[0].focus).toEqual([{ slug: "objetivo-a", name: "Objetivo A" }]);
    });

    it("sin puntos clave ni variantes cuenta cero", async () => {
      useDb({
        drills: reply([drillRow({ drill_coaching_points: [{ is_key: false }], drill_variants: [] })]),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.drills[0]).toMatchObject({ keyPoints: 0, variants: 0, focus: [] });
    });

    it("respeta el orden en que llegan y no pierde ninguno", async () => {
      useDb({
        drills: reply([
          drillRow({ id: D2, title: "Pase y va" }),
          drillRow({ id: D1, title: "Rebote y salida" }),
          drillRow({ id: D3, title: "Tres contra dos" }),
        ]),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.drills.map((drill) => drill.id)).toEqual([D2, D1, D3]);
    });

    it("con la biblioteca vacía, una lista vacía", async () => {
      useDb();

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.drills).toEqual([]);
    });
  });

  describe("lo usado hace poco", () => {
    it("son las tres últimas sesiones del equipo anteriores a esta que no se cancelaron", async () => {
      const db = useDb();

      await getProposalInput(ctx, EVENT);

      const recent = db.of("events")[1];
      expect(recent.sent("select")).toEqual([["id, practice_plans(practice_items(drill_id))"]]);
      expect(recent.sent("eq")).toEqual([
        ["organization_id", ORG],
        ["team_id", TEAM],
        ["kind", "practice"],
      ]);
      expect(recent.sent("neq")).toEqual([["status", "cancelled"]]);
      // Anteriores a esta: con el inicio tal cual vino de la base, sin pasar por `Date`.
      expect(recent.sent("lt")).toEqual([["starts_at", STARTS]]);
      expect(recent.sent("order")).toEqual([
        ["starts_at", { ascending: false }],
        ["id", { ascending: true }],
      ]);
      expect(recent.sent("limit")).toEqual([[RECENT_SESSIONS]]);
      expect(RECENT_SESSIONS).toBe(3);
      expect(recent.sent("maybeSingle")).toEqual([]);
    });

    it("junta los ejercicios de esas sesiones, sin repetidos ni títulos libres", async () => {
      useDb({
        recent: reply([
          // El plan como lista de un elemento...
          { id: "s1", practice_plans: [{ practice_items: [{ drill_id: D1 }, { drill_id: null }, { drill_id: D2 }] }] },
          // ...o como objeto.
          { id: "s2", practice_plans: { practice_items: [{ drill_id: D2 }, { drill_id: D3 }, { drill_id: D1 }] } },
        ]),
      });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.recentDrillIds).toEqual([D1, D2, D3]);
    });

    it.each([
      ["sin plan (lista vacía)", { id: "s1", practice_plans: [] }],
      ["sin plan (null)", { id: "s1", practice_plans: null }],
      ["con el plan vacío", { id: "s1", practice_plans: [{ practice_items: [] }] }],
      ["solo con títulos libres", { id: "s1", practice_plans: [{ practice_items: [{ drill_id: null }] }] }],
    ])("una sesión %s no aporta nada", async (_name, session) => {
      useDb({ recent: reply([session]) });

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.recentDrillIds).toEqual([]);
    });

    it("sin sesiones anteriores, una lista vacía", async () => {
      useDb();

      const input = await getProposalInput(ctx, EVENT);

      expect(input?.recentDrillIds).toEqual([]);
    });
  });

  it("devuelve justo lo que pide la propuesta, sin nada de más", async () => {
    useDb({
      drills: reply([drillRow()]),
      recent: reply([{ id: "s1", practice_plans: [{ practice_items: [{ drill_id: D1 }] }] }]),
    });

    const input = await getProposalInput(ctx, EVENT);

    expect(input).toStrictEqual({
      minutes: 75,
      age: 12,
      players: 9,
      primaryFocus: { slug: "objetivo-a", name: "Objetivo A" },
      secondaryFocus: { slug: "objetivo-b", name: "Objetivo B" },
      drills: [
        {
          id: D1,
          title: "Rebote y salida",
          minAge: 10,
          maxAge: null,
          minPlayers: 6,
          maxPlayers: 12,
          minMinutes: 10,
          maxMinutes: 15,
          focus: [],
          keyPoints: 0,
          variants: 0,
        },
      ],
      recentDrillIds: [D1],
    });
  });

  describe("una lectura que falla", () => {
    it("la del entreno lanza y se registra, sin leer nada más", async () => {
      const failed = failure();
      const db = useDb({ event: failed });

      await expect(getProposalInput(ctx, EVENT)).rejects.toThrow(
        "practice.proposal-event: no se pudo leer de la base de datos",
      );

      expect(mocks.logError.mock.calls).toEqual([["practice.proposal-event", failed.error]]);
      expect(db.queries.map((query) => query.table)).toEqual(["events"]);
    });

    it.each([
      ["team", "practice.proposal-team"],
      ["roster", "practice.proposal-roster"],
      ["focus", "practice.proposal-focus"],
      ["drills", "practice.proposal-drills"],
      ["recent", "practice.proposal-recent"],
    ] as const)("la de %s lanza y se registra con su etiqueta", async (which, tag) => {
      const failed = failure("57014");
      useDb({ [which]: failed });

      await expect(getProposalInput(ctx, EVENT)).rejects.toThrow(
        `${tag}: no se pudo leer de la base de datos`,
      );

      expect(mocks.logError.mock.calls).toEqual([[tag, failed.error]]);
    });

    it("lo que lanza no lleva el mensaje de la base de datos", async () => {
      useDb({ drills: failure() });

      const thrown: unknown = await getProposalInput(ctx, EVENT).catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(Error);
      expect(String(thrown)).not.toContain("texto del club");
      expect((thrown as Error).cause).toBeUndefined();
    });

    it("sin errores no registra nada", async () => {
      useDb();

      await getProposalInput(ctx, EVENT);

      expect(mocks.logError).not.toHaveBeenCalled();
    });
  });
});
