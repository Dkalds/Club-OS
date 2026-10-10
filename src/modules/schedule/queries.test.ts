import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamScope } from "@/modules/team/scope";
import type { TeamSummary } from "@/modules/team/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn(), getTeamScope: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));
vi.mock("@/modules/team/scope", () => ({ getTeamScope: mocks.getTeamScope }));

import { AGENDA_LIMIT } from "./limits";
import { listAgenda, parseAgendaKind, parseAgendaScope } from "./queries";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const CTX = clubContext("coach");
const ORG = CTX.org.id;
/** Miércoles 7 oct 2026, 12:00 en Madrid. */
const NOW = "2026-10-07T10:00:00.000Z";

const team = (id: string, name: string): TeamSummary => ({ id, name, categoryName: "C", seasonName: "2026/27" });
const TEAM_A = team("team-a", "Equipo A");
const TEAM_B = team("team-b", "Equipo B");

function scope(scoped: TeamSummary[], teams: TeamSummary[] = scoped): TeamScope {
  return { teams, scoped, active: scoped.length === 1 && teams.length > 1 ? (scoped[0] ?? null) : null };
}

type Reply = { data: unknown; error: unknown };
type Call = { method: string; args: unknown[] };

/** Una consulta de pega: apunta lo que le piden y contesta lo preparado. */
class FakeQuery implements PromiseLike<Reply> {
  readonly calls: Call[] = [];
  constructor(private readonly reply: Reply) {}
  private track(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }
  select = (...args: unknown[]) => this.track("select", args);
  eq = (...args: unknown[]) => this.track("eq", args);
  in = (...args: unknown[]) => this.track("in", args);
  gt = (...args: unknown[]) => this.track("gt", args);
  or = (...args: unknown[]) => this.track("or", args);
  order = (...args: unknown[]) => this.track("order", args);
  limit = (...args: unknown[]) => this.track("limit", args);
  sent(method: string): unknown[][] {
    return this.calls.filter((call) => call.method === method).map((call) => call.args);
  }
  then<A, B>(
    ok?: ((value: Reply) => A | PromiseLike<A>) | null,
    fail?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.reply).then(ok, fail);
  }
}

function useDb(reply: Reply): { query: FakeQuery; tables: string[] } {
  const query = new FakeQuery(reply);
  const tables: string[] = [];
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      tables.push(table);
      return query;
    },
  });
  return { query, tables };
}

function eventRow(id: string, startsAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    team_id: TEAM_A.id,
    kind: "practice",
    status: "scheduled",
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 75 * 60_000).toISOString(),
    location: null,
    practice_plans: [{ title: `Plan ${id}`, practice_items: [{ sort: 0, minutes: 30 }] }],
    games: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getTeamScope.mockResolvedValue(scope([TEAM_A]));
});

describe("parseAgendaScope y parseAgendaKind", () => {
  it("solo `past`, exacto, es lo anterior", () => {
    expect(parseAgendaScope("past")).toBe("past");
    for (const value of [undefined, "", "PAST", "played", ["past"], 1]) {
      expect(parseAgendaScope(value)).toBe("upcoming");
    }
  });

  it("solo `practice` y `game`, exactos, filtran", () => {
    expect(parseAgendaKind("practice")).toBe("practice");
    expect(parseAgendaKind("game")).toBe("game");
    for (const value of [undefined, "", "all", "games", ["game"], "practice,game"]) {
      expect(parseAgendaKind(value)).toBe("all");
    }
  });
});

describe("listAgenda", () => {
  it("sin equipos que ver, el estado vacío sin consultar eventos", async () => {
    mocks.getTeamScope.mockResolvedValue(scope([]));
    const { tables } = useDb({ data: [], error: null });

    expect(await listAgenda(CTX, { scope: "upcoming", kind: "all" }, NOW)).toEqual({
      weeks: [],
      teamCount: 0,
      truncated: false,
    });
    expect(tables).toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("filtra siempre por club y por los equipos que se están viendo", async () => {
    mocks.getTeamScope.mockResolvedValue(scope([TEAM_A, TEAM_B]));
    const { query, tables } = useDb({ data: [], error: null });

    const agenda = await listAgenda(CTX, { scope: "upcoming", kind: "all" }, NOW);

    expect(mocks.getTeamScope).toHaveBeenCalledWith(CTX);
    expect(tables).toEqual(["events"]);
    expect(query.sent("eq")).toContainEqual(["organization_id", ORG]);
    expect(query.sent("in")).toEqual([["team_id", [TEAM_A.id, TEAM_B.id]]]);
    expect(agenda.teamCount).toBe(2);
  });

  it("con un equipo activo, solo pregunta por ese", async () => {
    mocks.getTeamScope.mockResolvedValue(scope([TEAM_B], [TEAM_A, TEAM_B]));
    const { query } = useDb({ data: [], error: null });

    await listAgenda(CTX, { scope: "upcoming", kind: "all" }, NOW);

    expect(query.sent("in")).toEqual([["team_id", [TEAM_B.id]]]);
  });

  it("los próximos: programados que no han terminado, por inicio ascendente, con límite", async () => {
    const { query } = useDb({ data: [], error: null });

    await listAgenda(CTX, { scope: "upcoming", kind: "all" }, NOW);

    expect(query.sent("eq")).toContainEqual(["status", "scheduled"]);
    expect(query.sent("gt")).toEqual([["ends_at", NOW]]);
    expect(query.sent("or")).toEqual([]);
    expect(query.sent("order")).toEqual([
      ["starts_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
    expect(query.sent("limit")).toEqual([[AGENDA_LIMIT + 1]]);
  });

  it("los anteriores: lo que no es programado o ya terminó, por inicio descendente", async () => {
    const { query } = useDb({ data: [], error: null });

    await listAgenda(CTX, { scope: "past", kind: "all" }, NOW);

    expect(query.sent("or")).toEqual([[`status.neq.scheduled,ends_at.lte.${NOW}`]]);
    expect(query.sent("gt")).toEqual([]);
    expect(query.sent("order")[0]).toEqual(["starts_at", { ascending: false }]);
  });

  it("sin filtro de tipo no pregunta por tipo; con él, solo por ese", async () => {
    const all = useDb({ data: [], error: null });
    await listAgenda(CTX, { scope: "upcoming", kind: "all" }, NOW);
    expect(all.query.sent("eq").some(([column]) => column === "kind")).toBe(false);

    const games = useDb({ data: [], error: null });
    await listAgenda(CTX, { scope: "upcoming", kind: "game" }, NOW);
    expect(games.query.sent("eq")).toContainEqual(["kind", "game"]);
  });

  it("arma las semanas en la zona del club, con el slug del club en los enlaces", async () => {
    useDb({
      data: [eventRow("e-1", "2026-10-08T16:00:00+00:00"), eventRow("e-2", "2026-10-12T16:00:00+00:00")],
      error: null,
    });

    const { weeks, truncated } = await listAgenda(CTX, { scope: "upcoming", kind: "all" }, NOW);

    expect(weeks.map((week) => week.label)).toEqual(["Esta semana", "Semana que viene"]);
    expect(weeks[0]?.items[0]).toMatchObject({
      href: "/c/club-a/train/e-1",
      title: "Plan e-1",
      trail: { text: "18:00" },
    });
    expect(truncated).toBe(false);
  });

  it("con más de 50 enseña 50 y lo dice", async () => {
    const rows = Array.from({ length: AGENDA_LIMIT + 1 }, (_, index) =>
      eventRow(`e-${String(index).padStart(2, "0")}`, new Date(Date.parse(NOW) + (index + 1) * 3_600_000).toISOString()),
    );
    useDb({ data: rows, error: null });

    const { weeks, truncated } = await listAgenda(CTX, { scope: "upcoming", kind: "all" }, NOW);

    expect(truncated).toBe(true);
    expect(weeks.flatMap((week) => week.items)).toHaveLength(AGENDA_LIMIT);
  });

  it("con justo 50 no dice que haya más", async () => {
    const rows = Array.from({ length: AGENDA_LIMIT }, (_, index) =>
      eventRow(`e-${String(index).padStart(2, "0")}`, new Date(Date.parse(NOW) + (index + 1) * 3_600_000).toISOString()),
    );
    useDb({ data: rows, error: null });

    expect((await listAgenda(CTX, { scope: "upcoming", kind: "all" }, NOW)).truncated).toBe(false);
  });

  it("si la lectura falla, lo registra y lanza en vez de enseñar una agenda vacía", async () => {
    const failure = { code: "42501", message: "fila de ana@club-a.test" };
    useDb({ data: null, error: failure });

    await expect(listAgenda(CTX, { scope: "upcoming", kind: "all" }, NOW)).rejects.toThrow("schedule.agenda");
    expect(mocks.logError).toHaveBeenCalledWith("schedule.agenda", failure);
  });

  it("si mis equipos no se pueden leer, no sigue con los eventos", async () => {
    mocks.getTeamScope.mockRejectedValue(new Error("team.staff-teams: no se pudo leer"));
    const { tables } = useDb({ data: [], error: null });

    await expect(listAgenda(CTX, { scope: "upcoming", kind: "all" }, NOW)).rejects.toThrow("no se pudo leer");
    expect(tables).toEqual([]);
  });
});
