import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubContext } from "@/modules/tenancy/queries";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

// La cookie del equipo activo (`getTeamScope`): sin ella se ven todos «mis equipos».
const activeTeam = vi.hoisted(() => ({ id: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (activeTeam.id === undefined ? undefined : { value: activeTeam.id }) }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { getPractice, getPracticeFormOptions, listManageableTeams, listPractices } from "./queries";

// ── Un doble mínimo de la base de datos ──────────────────────────────────────────────
// Como el de `home/queries.test.ts`: no ejecuta SQL ni mira la cadena del `select` (de eso se
// encarga el tipado de supabase-js contra `Database`, que `pnpm typecheck` comprueba). Guarda
// filas ya con la forma que devuelve PostgREST y aplica de verdad los filtros, el orden y el
// límite que pide la consulta, y apunta qué llegó: así se ve qué filas salen y que ninguna
// consulta pregunta por todo el club.
//
// Un filtro sobre una columna anidada (`seasons.is_current`) deja fuera la fila de la consulta
// cuando la anidada no lo cumple: es lo que hace PostgREST con `!inner`.
//
// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

type Row = Record<string, unknown>;
type Failure = { name: string; code: string; message: string };
type Result = { data: Row[] | null; error: Failure | null };
type Call = {
  table: string;
  select: string | null;
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
  gt: Record<string, string>;
  or: string | null;
  order: Array<{ column: string; ascending: boolean }>;
  limit: number | null;
};

/** El valor de `row` en una ruta como `teams.seasons.is_current`; una lista cuenta por su primer elemento. */
function valueAt(row: Row, path: string): unknown {
  let current: unknown = row;
  for (const key of path.split(".")) {
    if (Array.isArray(current)) current = current[0];
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Row)[key];
  }
  return current;
}

function instant(value: unknown): number {
  return new Date(String(value)).getTime();
}

/** Una condición de `or()`: `columna.operador.valor` (solo los operadores que usan las consultas). */
function orCondition(condition: string): (row: Row) => boolean {
  const [column, operator, ...rest] = condition.split(".");
  const value = rest.join(".");
  if (operator === "neq") return (row) => row[column] !== value;
  if (operator === "lte") return (row) => instant(row[column]) <= instant(value);
  throw new Error(`El doble no entiende el operador «${operator}» de or()`);
}

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
    this.call = { table, select: null, eq: {}, in: {}, gt: {}, or: null, order: [], limit: null };
    calls.push(this.call);
  }

  select(columns?: string) {
    this.call.select = columns ?? null;
    return this;
  }

  eq(column: string, value: unknown) {
    this.call.eq[column] = value;
    this.filters.push((row) => valueAt(row, column) === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.call.in[column] = values;
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  gt(column: string, value: string) {
    this.call.gt[column] = value;
    this.filters.push((row) => instant(row[column]) > instant(value));
    return this;
  }

  or(expression: string) {
    this.call.or = expression;
    const conditions = expression.split(",").map(orCondition);
    this.filters.push((row) => conditions.some((condition) => condition(row)));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    const ascending = options?.ascending ?? true;
    this.call.order.push({ column, ascending });
    this.sorts.push({ column, ascending });
    return this;
  }

  limit(count: number) {
    this.call.limit = count;
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.run()).then(({ data, error }) => ({ data: data?.[0] ?? null, error }));
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }

  private run(): Result {
    if (this.failure) return { data: null, error: this.failure };

    let result = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    for (const { column, ascending } of [...this.sorts].reverse()) {
      result = [...result].sort((a, b) => {
        const left = String(a[column]);
        const right = String(b[column]);
        const byTime = instant(left) - instant(right);
        const order = byTime || (left < right ? -1 : left > right ? 1 : 0);
        return ascending ? order : -order;
      });
    }
    if (this.call.limit !== null) result = result.slice(0, this.call.limit);
    return { data: result, error: null };
  }
}

type Table = "teams" | "team_staff" | "focus_areas" | "events";
type Store = Partial<Record<Table, Row[]>>;

function installDatabase(store: Store, failing: Partial<Record<Table, Failure>> = {}) {
  const calls: Call[] = [];
  mocks.createClient.mockResolvedValue({
    from: (table: Table) => new FakeQuery(table, store[table] ?? [], failing[table] ?? null, calls),
  });
  return calls;
}

// ── Datos ────────────────────────────────────────────────────────────────────────────
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const NOW = "2026-10-02T10:00:00.000Z"; // viernes 2 oct, 12:00 en Madrid

const COACH = clubContext("coach");
const ADMIN: ClubContext = { ...COACH, membership: { role: "admin", personId: null } };
const PLAYER: ClubContext = { ...COACH, membership: { role: "player", personId: COACH.membership.personId } };
const ORG = COACH.org.id;
const OTHER_ORG = uuid(900);
const ME = COACH.membership.personId as string;
const SOMEONE = uuid(901);

const TEAM_A = uuid(1);
const TEAM_B = uuid(2);
const TEAM_C = uuid(3); // del club, pero la entrenadora no está en su cuerpo técnico
const TEAM_OLD = uuid(4); // de la temporada pasada, donde sí estuvo
const TEAM_X = uuid(5); // de otro club

const FAILURE: Failure = { name: "PostgrestError", code: "42501", message: "fila de ana@club-a.test" };

function teamRow(id: string, organization_id: string, name: string, isCurrent = true): Row {
  return { id, organization_id, name, seasons: { is_current: isCurrent } };
}

function staffRow(organization_id: string, person_id: string, team: Row): Row {
  return { organization_id, person_id, teams: team };
}

function teamStore(): Pick<Store, "teams" | "team_staff"> {
  const a = teamRow(TEAM_A, ORG, "Equipo A");
  const b = teamRow(TEAM_B, ORG, "Equipo B");
  const c = teamRow(TEAM_C, ORG, "Equipo C");
  const old = teamRow(TEAM_OLD, ORG, "Equipo antiguo", false);
  const x = teamRow(TEAM_X, OTHER_ORG, "Equipo X");
  return {
    // A propósito en desorden: salen por nombre.
    teams: [b, old, x, c, a],
    team_staff: [
      staffRow(ORG, ME, b),
      staffRow(ORG, ME, old),
      staffRow(ORG, ME, a),
      staffRow(ORG, SOMEONE, c),
      staffRow(OTHER_ORG, ME, x),
    ],
  };
}

const PLAN_ITEMS = [{ minutes: 20 }, { minutes: 25 }];

function eventRow(
  id: string,
  team_id: string,
  startsAt: string,
  endsAt: string,
  overrides: Row = {},
): Row {
  return {
    id,
    organization_id: ORG,
    team_id,
    kind: "practice",
    status: "scheduled",
    starts_at: startsAt,
    ends_at: endsAt,
    location: "Pabellón 2",
    practice_plans: [{ title: `Plan ${id}`, practice_items: PLAN_ITEMS }],
    ...overrides,
  };
}

/** Eventos para probar los dos alcances; todos de `ORG` salvo el último. */
function listStore(): Store {
  return {
    ...teamStore(),
    events: [
      // Próximas: una en curso (ya empezó, no ha terminado), una de B y una de A más tarde.
      eventRow("up-late", TEAM_A, "2026-10-08T16:00:00+00:00", "2026-10-08T17:15:00+00:00"),
      eventRow("up-soon", TEAM_B, "2026-10-06T16:00:00+00:00", "2026-10-06T17:15:00+00:00"),
      eventRow("ongoing", TEAM_A, "2026-10-02T09:30:00+00:00", "2026-10-02T10:45:00+00:00"),
      // Histórico: una programada que ya terminó, una hecha y una cancelada futura.
      eventRow("past-scheduled", TEAM_A, "2026-10-01T16:00:00+00:00", "2026-10-01T17:15:00+00:00"),
      eventRow("done", TEAM_B, "2026-09-29T16:00:00+00:00", "2026-09-29T17:15:00+00:00", {
        status: "done",
      }),
      // Un entreno sin plan: no se lista (su detalle sería un 404).
      eventRow("no-plan", TEAM_A, "2026-09-28T16:00:00+00:00", "2026-09-28T17:15:00+00:00", {
        status: "done",
        practice_plans: [],
      }),
      eventRow("cancelled", TEAM_A, "2026-10-09T16:00:00+00:00", "2026-10-09T17:15:00+00:00", {
        status: "cancelled",
      }),
      // Lo que no debe salir: un partido, un equipo ajeno, uno de la temporada pasada y otro club.
      eventRow("game", TEAM_A, "2026-10-07T16:00:00+00:00", "2026-10-07T17:30:00+00:00", {
        kind: "game",
        practice_plans: [],
      }),
      eventRow("other-team", TEAM_C, "2026-10-05T16:00:00+00:00", "2026-10-05T17:15:00+00:00"),
      eventRow("old-season", TEAM_OLD, "2026-10-04T16:00:00+00:00", "2026-10-04T17:15:00+00:00"),
      eventRow("other-club", TEAM_X, "2026-10-03T16:00:00+00:00", "2026-10-03T17:15:00+00:00", {
        organization_id: OTHER_ORG,
      }),
    ],
  };
}

const EVENT = uuid(10);

const STANDARD = { id: uuid(30), number: 4, title: "COMUNICAR", description: "Se habla.", status: "published" };

/** Un entrenamiento tal como lo devuelve la lectura del detalle. */
function detailEvent(overrides: Row = {}): Row {
  return {
    id: EVENT,
    organization_id: ORG,
    team_id: TEAM_A,
    kind: "practice",
    status: "scheduled",
    starts_at: "2026-11-17T17:00:00+00:00",
    ends_at: "2026-11-17T18:15:00+00:00",
    location: "Pabellón 2",
    teams: { name: "Equipo A" },
    practice_plans: [
      {
        id: uuid(20),
        title: "Transición + rebote defensivo",
        notes: null,
        updated_at: "2026-11-10T09:30:00.123456+00:00",
        actual_minutes: null,
        live_started_at: null,
        live_position: null,
        primary_focus: { id: uuid(40), name: "Defensa" },
        secondary_focus: null,
        practice_items: [
          {
            id: uuid(51),
            sort: 0,
            phase: "Técnica",
            drill_id: uuid(60),
            title_override: null,
            minutes: 20,
            notes: null,
            completed: null,
            actual_minutes: null,
            drills: { title: "Rueda de tiros", drill_standards: [{ standards: STANDARD }] },
          },
        ],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.logError.mockReset();
  activeTeam.id = undefined;
});

describe("listManageableTeams", () => {
  it("la dirección ve todos los equipos de la temporada actual del club, por nombre", async () => {
    const calls = installDatabase(teamStore());

    const teams = await listManageableTeams(ADMIN);

    expect(teams).toEqual([
      { id: TEAM_A, name: "Equipo A" },
      { id: TEAM_B, name: "Equipo B" },
      { id: TEAM_C, name: "Equipo C" },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("teams");
    expect(calls[0]?.eq).toEqual({ organization_id: ORG, "seasons.is_current": true });
  });

  it("quien entrena ve solo los equipos de su cuerpo técnico en la temporada actual, por nombre", async () => {
    const calls = installDatabase(teamStore());

    const teams = await listManageableTeams(COACH);

    expect(teams).toEqual([
      { id: TEAM_A, name: "Equipo A" },
      { id: TEAM_B, name: "Equipo B" },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("team_staff");
    expect(calls[0]?.eq).toEqual({
      organization_id: ORG,
      person_id: ME,
      "teams.seasons.is_current": true,
    });
  });

  it("sin persona asociada y sin ser dirección no hay equipos, y no se consulta nada", async () => {
    const calls = installDatabase(teamStore());

    const teams = await listManageableTeams({ ...COACH, membership: { role: "coach", personId: null } });

    expect(teams).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("quien no está en ningún cuerpo técnico (una jugadora, por ejemplo) no gestiona ningún equipo", async () => {
    installDatabase({ ...teamStore(), team_staff: [] });

    expect(await listManageableTeams(PLAYER)).toEqual([]);
  });
});

describe("getPracticeFormOptions", () => {
  it("con un equipo activo, lo propone por defecto y sigue ofreciendo todos", async () => {
    activeTeam.id = TEAM_B;
    installDatabase({ ...teamStore(), focus_areas: [] });

    const options = await getPracticeFormOptions(COACH);

    expect(options.defaultTeamId).toBe(TEAM_B);
    expect(options.teams.map((team) => team.id)).toEqual([TEAM_A, TEAM_B]);
  });

  it("devuelve los equipos gestionables y los objetivos del club en su orden", async () => {
    const calls = installDatabase({
      ...teamStore(),
      focus_areas: [
        { id: uuid(42), organization_id: ORG, name: "Tiro", sort: 2 },
        { id: uuid(43), organization_id: OTHER_ORG, name: "De otro club", sort: 0 },
        { id: uuid(41), organization_id: ORG, name: "Defensa", sort: 1 },
      ],
    });

    const options = await getPracticeFormOptions(COACH);

    expect(options).toEqual({
      teams: [
        { id: TEAM_A, name: "Equipo A" },
        { id: TEAM_B, name: "Equipo B" },
      ],
      focusAreas: [
        { id: uuid(41), name: "Defensa" },
        { id: uuid(42), name: "Tiro" },
      ],
      defaultTeamId: null,
    });
    const focus = calls.find((entry) => entry.table === "focus_areas");
    expect(focus?.eq).toEqual({ organization_id: ORG });
    expect(focus?.order.map((entry) => entry.column)).toEqual(["sort", "id"]);
  });
});

describe("listPractices", () => {
  it("las próximas son las programadas que no han terminado, por inicio ascendente", async () => {
    installDatabase(listStore());

    const { practices, teamCount } = await listPractices(COACH, "upcoming", NOW);

    expect(practices.map((practice) => practice.eventId)).toEqual(["ongoing", "up-soon", "up-late"]);
    expect(teamCount).toBe(2);
    expect(practices[1]).toEqual({
      eventId: "up-soon",
      teamName: "Equipo B",
      dow: "Mar",
      day: "6",
      month: "oct",
      time: "18:00",
      title: "Plan up-soon",
      totalMinutes: 45,
      itemCount: 2,
      status: "scheduled",
      location: "Pabellón 2",
    });
  });

  it("el histórico es el resto (hechas, canceladas y programadas ya terminadas), por inicio descendente", async () => {
    installDatabase(listStore());

    const { practices, teamCount } = await listPractices(COACH, "history", NOW);

    expect(practices.map((practice) => [practice.eventId, practice.status])).toEqual([
      ["cancelled", "cancelled"],
      ["past-scheduled", "scheduled"],
      ["done", "done"],
    ]);
    expect(teamCount).toBe(2);
  });

  it("un entreno sin plan no sale en la lista: su detalle sería un 404", async () => {
    installDatabase(listStore());

    const { practices } = await listPractices(COACH, "history", NOW);

    expect(practices.map((practice) => practice.eventId)).not.toContain("no-plan");
  });

  it("un plan sin ítems dura su franja y uno con ítems, lo que suman", async () => {
    installDatabase({
      ...teamStore(),
      events: [
        eventRow("empty", TEAM_A, "2026-10-06T16:00:00+00:00", "2026-10-06T17:00:00+00:00", {
          practice_plans: [{ title: "Plan vacío", practice_items: [] }],
        }),
        eventRow("filled", TEAM_A, "2026-10-08T16:00:00+00:00", "2026-10-08T17:00:00+00:00"),
      ],
    });

    const { practices } = await listPractices(COACH, "upcoming", NOW);

    expect(practices.map((practice) => [practice.eventId, practice.totalMinutes, practice.itemCount])).toEqual([
      ["empty", 60, 0],
      ["filled", 45, 2],
    ]);
  });

  it("con un equipo activo, solo las de ese equipo", async () => {
    activeTeam.id = TEAM_B;
    const calls = installDatabase(listStore());

    const { practices, teamCount } = await listPractices(ADMIN, "upcoming", NOW);

    expect(teamCount).toBe(1);
    expect(practices.every((practice) => practice.teamName === "Equipo B")).toBe(true);
    const events = calls.find((entry) => entry.table === "events");
    expect(events?.in.team_id).toEqual([TEAM_B]);
  });

  it("un equipo activo que no es mío se ignora: las de todos mis equipos", async () => {
    activeTeam.id = TEAM_X;
    installDatabase(listStore());

    const { teamCount } = await listPractices(ADMIN, "upcoming", NOW);

    expect(teamCount).toBe(3);
  });

  it("la dirección ve las de todos los equipos del club, y ninguna de otro club", async () => {
    installDatabase(listStore());

    const { practices, teamCount } = await listPractices(ADMIN, "upcoming", NOW);

    expect(practices.map((practice) => practice.eventId)).toEqual([
      "ongoing",
      "other-team",
      "up-soon",
      "up-late",
    ]);
    expect(teamCount).toBe(3);
  });

  it("las horas salen en la zona del club", async () => {
    installDatabase(listStore());

    const { practices } = await listPractices(
      { ...COACH, org: { ...COACH.org, timezone: "America/Mexico_City" } },
      "upcoming",
      NOW,
    );

    expect(practices.find((practice) => practice.eventId === "up-soon")).toMatchObject({
      dow: "Mar",
      day: "6",
      time: "10:00",
    });
  });

  it("pide el fin de cada sesión: sin él no se puede decir cuánto dura una que aún no tiene ejercicios", async () => {
    const calls = installDatabase(listStore());

    await listPractices(COACH, "upcoming", NOW);

    const events = calls.find((entry) => entry.table === "events");
    expect(events?.select).toMatch(/\bstarts_at\b/);
    expect(events?.select).toMatch(/\bends_at\b/);
  });

  it("filtra siempre por club, por tipo y por los equipos gestionables: nunca pregunta por todo el club", async () => {
    const calls = installDatabase(listStore());

    await listPractices(COACH, "upcoming", NOW);

    const events = calls.find((entry) => entry.table === "events");
    expect(events?.eq).toMatchObject({ organization_id: ORG, kind: "practice" });
    expect(events?.in).toEqual({ team_id: [TEAM_A, TEAM_B] });
  });

  it("las próximas piden `scheduled` y `ends_at` posterior a ahora, por inicio ascendente, con límite", async () => {
    const calls = installDatabase(listStore());

    await listPractices(COACH, "upcoming", NOW);

    const events = calls.find((entry) => entry.table === "events");
    expect(events?.eq).toMatchObject({ status: "scheduled" });
    expect(events?.gt).toEqual({ ends_at: NOW });
    expect(events?.or).toBeNull();
    expect(events?.order).toEqual([
      { column: "starts_at", ascending: true },
      { column: "id", ascending: true },
    ]);
    expect(events?.limit).toBe(51);
  });

  it("el histórico pide lo que no es programado o ya terminó, por inicio descendente, con límite", async () => {
    const calls = installDatabase(listStore());

    await listPractices(COACH, "history", NOW);

    const events = calls.find((entry) => entry.table === "events");
    expect(events?.or).toBe(`status.neq.scheduled,ends_at.lte.${NOW}`);
    expect(events?.eq).not.toHaveProperty("status");
    expect(events?.gt).toEqual({});
    expect(events?.order).toEqual([
      { column: "starts_at", ascending: false },
      { column: "id", ascending: true },
    ]);
    expect(events?.limit).toBe(51);
  });

  it("sin equipos devuelve el estado vacío sin consultar los eventos", async () => {
    const calls = installDatabase({ ...listStore(), team_staff: [] });

    expect(await listPractices(COACH, "upcoming", NOW)).toEqual({ practices: [], teamCount: 0, truncated: false });
    expect(calls.map((entry) => entry.table)).not.toContain("events");
  });

  it("una cuenta de entrenador sin persona no consulta nada", async () => {
    const calls = installDatabase(listStore());

    const result = await listPractices(
      { ...COACH, membership: { role: "coach", personId: null } },
      "history",
      NOW,
    );

    expect(result).toEqual({ practices: [], teamCount: 0, truncated: false });
    expect(calls).toEqual([]);
  });
});

describe("getPractice", () => {
  it("un id que no es un uuid devuelve null sin crear el cliente ni consultar nada", async () => {
    const calls = installDatabase({ events: [detailEvent()] });

    expect(await getPractice(COACH, "abc")).toBeNull();
    expect(await getPractice(COACH, "")).toBeNull();
    expect(await getPractice(COACH, `${EVENT}; drop table events`)).toBeNull();

    expect(calls).toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("lee el entrenamiento con su plan, ítems y Standards, en la zona del club", async () => {
    installDatabase({ events: [detailEvent()] });

    const practice = await getPractice(COACH, EVENT);

    expect(practice).toEqual({
      eventId: EVENT,
      planId: uuid(20),
      teamId: TEAM_A,
      teamName: "Equipo A",
      status: "scheduled",
      startsAt: "2026-11-17T17:00:00+00:00",
      endsAt: "2026-11-17T18:15:00+00:00",
      slotLabel: "Martes 17 nov · 18:00–19:15",
      location: "Pabellón 2",
      title: "Transición + rebote defensivo",
      primaryFocus: { id: uuid(40), name: "Defensa" },
      secondaryFocus: null,
      notes: null,
      items: [
        {
          id: uuid(51),
          drillId: uuid(60),
          drillVisible: true,
          title: "Rueda de tiros",
          phase: "Técnica",
          minutes: 20,
          notes: null,
          completed: null,
          actualMinutes: null,
        },
      ],
      standards: [{ id: STANDARD.id, number: 4, title: "COMUNICAR", description: "Se habla." }],
      updatedAt: "2026-11-10T09:30:00.123456+00:00",
      canEdit: true,
      live: { started: false, position: null },
      actualMinutes: null,
    });
  });

  it("filtra por club, por id y por tipo", async () => {
    const calls = installDatabase({ events: [detailEvent()] });

    await getPractice(COACH, EVENT);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.table).toBe("events");
    expect(calls[0]?.eq).toEqual({ organization_id: ORG, id: EVENT, kind: "practice" });
  });

  it("no devuelve la fila de otro club con el mismo id ni un partido", async () => {
    installDatabase({
      events: [
        detailEvent({ organization_id: OTHER_ORG, teams: { name: "Equipo de otro club" } }),
        detailEvent({ id: uuid(11), kind: "game", practice_plans: [] }),
      ],
    });

    expect(await getPractice(COACH, EVENT)).toBeNull();
    expect(await getPractice(COACH, uuid(11))).toBeNull();
  });

  it("devuelve null si no hay fila (no existe, es de otro equipo o RLS no la deja ver)", async () => {
    installDatabase({ events: [] });

    expect(await getPractice(COACH, EVENT)).toBeNull();
  });

  it("devuelve null si el evento no tiene plan", async () => {
    installDatabase({ events: [detailEvent({ practice_plans: [] })] });

    expect(await getPractice(COACH, EVENT)).toBeNull();
  });

  it("canEdit pide permiso para gestionar sesiones y que la sesión esté programada", async () => {
    const edit = async (ctx: ClubContext, status: string) => {
      installDatabase({ events: [detailEvent({ status })] });
      return (await getPractice(ctx, EVENT))?.canEdit;
    };

    expect(await edit(COACH, "scheduled")).toBe(true);
    expect(await edit(ADMIN, "scheduled")).toBe(true);
    expect(await edit(PLAYER, "scheduled")).toBe(false);
    expect(await edit(COACH, "done")).toBe(false);
    expect(await edit(COACH, "cancelled")).toBe(false);
  });
});

describe("si falla una lectura", () => {
  const cases: Array<{
    name: string;
    table: Table;
    tag: string;
    run: () => Promise<unknown>;
  }> = [
    { name: "los equipos de la dirección", table: "teams", tag: "team.club-teams", run: () => listManageableTeams(ADMIN) },
    { name: "los equipos de quien entrena", table: "team_staff", tag: "team.staff-teams", run: () => listManageableTeams(COACH) },
    { name: "los objetivos", table: "focus_areas", tag: "practice.focus-areas", run: () => getPracticeFormOptions(COACH) },
    { name: "la lista de entrenamientos", table: "events", tag: "practice.list", run: () => listPractices(COACH, "upcoming", NOW) },
    { name: "el detalle", table: "events", tag: "practice.detail", run: () => getPractice(COACH, EVENT) },
  ];

  describe.each(cases)("$name", ({ table, tag, run }) => {
    it("lo registra sin datos personales y lanza, en vez de enseñar datos vacíos", async () => {
      installDatabase({ ...listStore(), focus_areas: [] }, { [table]: FAILURE });

      const error = await run().then(
        () => null,
        (thrown: unknown) => thrown,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(`${tag}: no se pudo leer de la base de datos`);
      expect((error as Error).cause).toBeUndefined();
      expect(mocks.logError).toHaveBeenCalledTimes(1);
      expect(mocks.logError).toHaveBeenCalledWith(tag, FAILURE);
    });
  });

  it("si fallan los equipos, `listPractices` no sigue con los eventos", async () => {
    const calls = installDatabase(listStore(), { team_staff: FAILURE });

    await expect(listPractices(COACH, "upcoming", NOW)).rejects.toThrow("team.staff-teams");
    expect(calls.map((entry) => entry.table)).not.toContain("events");
  });
});
