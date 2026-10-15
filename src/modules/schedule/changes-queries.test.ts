import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, FAILURE, OTHER_ORG, uuid, type Row } from "@/lib/test-support";
import type { TeamScope } from "@/modules/team/scope";
import type { TeamSummary } from "@/modules/team/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn(), getTeamScope: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));
vi.mock("@/modules/team/scope", () => ({ getTeamScope: mocks.getTeamScope }));

import { listEventChanges, listRecentChanges, RECENT_DAYS } from "./changes-queries";

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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getTeamScope.mockResolvedValue(scope([TEAM_A]));
});

// ── Los cambios de un evento ────────────────────────────────────────────────────────────
// Contra el doble de `@/lib/test-support`, que aplica de verdad los filtros y el orden.

describe("listEventChanges", () => {
  const EVENT = uuid(1);
  const OTHER_EVENT = uuid(2);

  function changeRow(n: number, organization_id: string, event_id: string, overrides: Row = {}): Row {
    return {
      id: uuid(n),
      organization_id,
      event_id,
      what: "time",
      old_starts_at: "2026-10-06T16:00:00+00:00",
      old_ends_at: "2026-10-06T17:15:00+00:00",
      old_location: "Pista 1",
      changed_at: "2026-10-05T09:00:00+00:00",
      ...overrides,
    };
  }

  function install(rows: Row[], failing = false) {
    const fake = fakeSupabase({ event_changes: rows }, failing ? { event_changes: FAILURE } : {});
    mocks.createClient.mockResolvedValue(fake.client);
    return fake.calls;
  }

  const rows = () => [
    changeRow(11, ORG, EVENT, { changed_at: "2026-10-03T09:00:00+00:00" }),
    changeRow(12, ORG, EVENT, { what: "cancelled", changed_at: "2026-10-05T09:00:00+00:00" }),
    changeRow(13, ORG, EVENT, { what: "location", old_location: null, changed_at: "2026-10-04T09:00:00+00:00" }),
    changeRow(14, ORG, OTHER_EVENT),
    // El mismo id de evento en otro club: sin el filtro de club, saldría.
    changeRow(19, OTHER_ORG, EVENT, { changed_at: "2026-10-06T09:00:00+00:00" }),
  ];

  it("los cambios de ese evento de este club, del más reciente al más antiguo, y ninguno de otro evento ni de otro club", async () => {
    const calls = install(rows());

    const changes = await listEventChanges(CTX, EVENT);

    expect(changes.map((change) => [change.id, change.what])).toEqual([
      [uuid(12), "cancelled"],
      [uuid(13), "location"],
      [uuid(11), "time"],
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      table: "event_changes",
      eq: { organization_id: ORG, event_id: EVENT },
      order: ["changed_at", "id"],
    });
  });

  it("de cada cambio, lo que había antes y cuándo se cambió, y nada más", async () => {
    install([changeRow(11, ORG, EVENT)]);

    expect(await listEventChanges(CTX, EVENT)).toEqual([
      {
        id: uuid(11),
        what: "time",
        oldStartsAt: "2026-10-06T16:00:00+00:00",
        oldEndsAt: "2026-10-06T17:15:00+00:00",
        oldLocation: "Pista 1",
        changedAt: "2026-10-05T09:00:00+00:00",
      },
    ]);
  });

  it("lo que no tenía lugar llega sin lugar", async () => {
    install([changeRow(11, ORG, EVENT, { what: "location", old_location: null })]);

    expect((await listEventChanges(CTX, EVENT))[0]?.oldLocation).toBeNull();
  });

  it("dos cambios del mismo instante salen por id: el orden es estable", async () => {
    install([changeRow(22, ORG, EVENT, { what: "location" }), changeRow(21, ORG, EVENT)]);

    expect((await listEventChanges(CTX, EVENT)).map((change) => change.id)).toEqual([uuid(21), uuid(22)]);
  });

  it("un evento sin cambios, o que no es de este club, da una lista vacía", async () => {
    install(rows());

    expect(await listEventChanges(CTX, uuid(77))).toEqual([]);
  });

  it.each(["no-es-un-id", "", "e-1", `${uuid(1)}0`, ` ${uuid(1)}`, "id.eq.1,or(1)"])(
    "un id que no tiene forma de uuid (%j) ni se consulta",
    async (eventId) => {
      const calls = install(rows());

      expect(await listEventChanges(CTX, eventId)).toEqual([]);
      expect(calls).toEqual([]);
      expect(mocks.createClient).not.toHaveBeenCalled();
    },
  );

  it("no depende de los equipos que se estén viendo: quién ve el evento lo decide RLS", async () => {
    install(rows());

    await listEventChanges(CTX, EVENT);

    expect(mocks.getTeamScope).not.toHaveBeenCalled();
  });

  it("si la lectura falla, lo registra y lanza en vez de enseñar un evento sin cambios", async () => {
    install(rows(), true);

    await expect(listEventChanges(CTX, EVENT)).rejects.toThrow(
      "schedule.event-changes: no se pudo leer de la base de datos",
    );
    expect(mocks.logError).toHaveBeenCalledWith("schedule.event-changes", FAILURE);
  });
});

// ── Los cambios recientes ───────────────────────────────────────────────────────────────

type Reply = { data: unknown; error: unknown; count?: number | null };
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
  gte = (...args: unknown[]) => this.track("gte", args);
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

/** Lo que contesta la base: las filas y, aparte, cuántas hay en total (`count: "exact"`). */
const found = (rows: unknown[], count: number | null = rows.length): Reply => ({ data: rows, error: null, count });

/** Un evento del martes 13 oct de 19:00 a 20:15 en Madrid, con sus cambios recientes embebidos. */
function eventRow(id: string, whats: string[] = ["time"], overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: "practice",
    starts_at: "2026-10-13T17:00:00+00:00",
    ends_at: "2026-10-13T18:15:00+00:00",
    teams: { name: "Equipo A" },
    practice_plans: [{ title: `Sesión ${id}` }],
    games: [],
    event_changes: whats.map((what) => ({ what, changed_at: "2026-10-06T09:00:00+00:00" })),
    ...overrides,
  };
}

describe("listRecentChanges", () => {
  it("son los de los últimos 7 días", () => {
    expect(RECENT_DAYS).toBe(7);
  });

  it("sin equipos que ver, nada, sin consultar nada", async () => {
    mocks.getTeamScope.mockResolvedValue(scope([]));
    const { tables } = useDb(found([]));

    expect(await listRecentChanges(CTX, NOW, 3)).toEqual({ items: [], more: 0 });
    expect(tables).toEqual([]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("lee los eventos, filtrando siempre por club y por los equipos que se están viendo", async () => {
    mocks.getTeamScope.mockResolvedValue(scope([TEAM_A, TEAM_B]));
    const { query, tables } = useDb(found([]));

    await listRecentChanges(CTX, NOW, 3);

    expect(mocks.getTeamScope).toHaveBeenCalledWith(CTX);
    expect(tables).toEqual(["events"]);
    expect(query.sent("eq")).toEqual([["organization_id", ORG]]);
    expect(query.sent("in")).toEqual([["team_id", [TEAM_A.id, TEAM_B.id]]]);
  });

  it("con un equipo activo, solo pregunta por ese", async () => {
    mocks.getTeamScope.mockResolvedValue(scope([TEAM_B], [TEAM_A, TEAM_B]));
    const { query } = useDb(found([]));

    await listRecentChanges(CTX, NOW, 3);

    expect(query.sent("in")).toEqual([["team_id", [TEAM_B.id]]]);
  });

  it("solo los eventos que aún no han terminado", async () => {
    const { query } = useDb(found([]));

    await listRecentChanges(CTX, NOW, 3);

    expect(query.sent("gt")).toEqual([["ends_at", NOW]]);
  });

  it("solo los que tienen algún cambio de los últimos 7 días, contados desde la hora que se le pasa", async () => {
    const { query } = useDb(found([]));

    await listRecentChanges(CTX, NOW, 3);

    // El `!inner` deja fuera el evento sin ningún cambio reciente.
    expect(query.sent("gte")).toEqual([["event_changes.changed_at", "2026-09-30T10:00:00.000Z"]]);
    expect(String(query.sent("select")[0]?.[0])).toContain("event_changes!inner(what, changed_at)");
  });

  it("pide el recuento exacto, para saber cuántos quedan fuera", async () => {
    const { query } = useDb(found([]));

    await listRecentChanges(CTX, NOW, 3);

    expect(query.sent("select")[0]?.[1]).toEqual({ count: "exact" });
  });

  it("del que antes se juega al que más tarde, y como mucho los `limit` que se van a enseñar", async () => {
    const { query } = useDb(found([]));

    await listRecentChanges(CTX, NOW, 3);

    expect(query.sent("order")).toEqual([
      ["starts_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
    expect(query.sent("limit")).toEqual([[3]]);
  });

  it("el tope es el que se le pasa: tres en Inicio, cinco en la Agenda", async () => {
    const { query } = useDb(found([]));

    await listRecentChanges(CTX, NOW, 5);

    expect(query.sent("limit")).toEqual([[5]]);
  });

  it("arma un aviso por evento, con todo lo que le ha pasado, en la zona del club y con su slug en el enlace", async () => {
    useDb(found([eventRow("e-1", ["time", "location"])]));

    expect(await listRecentChanges(CTX, NOW, 3)).toEqual({
      items: [
        {
          eventId: "e-1",
          href: "/c/club-a/train/e-1",
          label: "Cambio de hora y de lugar",
          title: "Sesión e-1",
          subtitle: "Martes 13 oct · 19:00–20:15 · Sesión e-1",
          cancelled: false,
        },
      ],
      more: 0,
    });
  });

  it("un partido sale con su rival y lleva a su ficha", async () => {
    useDb(
      found([eventRow("g-1", ["cancelled"], { kind: "game", practice_plans: [], games: [{ opponent_name: "CB Rival" }] })]),
    );

    const { items } = await listRecentChanges(CTX, NOW, 3);

    expect(items).toEqual([
      expect.objectContaining({ href: "/c/club-a/games/g-1", title: "vs CB Rival", label: "Cancelado", cancelled: true }),
    ]);
  });

  it("lee igual las relaciones si llegan como objeto o como lista de un elemento", async () => {
    useDb(
      found([
        eventRow("e-1", ["time"], { teams: [{ name: "Equipo A" }], practice_plans: { title: "Sesión e-1" }, games: null }),
        eventRow("g-1", ["time"], {
          kind: "game",
          starts_at: "2026-10-14T17:00:00+00:00",
          ends_at: "2026-10-14T18:30:00+00:00",
          practice_plans: null,
          games: { opponent_name: "CB Rival" },
        }),
      ]),
    );
    mocks.getTeamScope.mockResolvedValue(scope([TEAM_A, TEAM_B]));

    const { items } = await listRecentChanges(CTX, NOW, 3);

    expect(items.map((item) => [item.title, item.subtitle])).toEqual([
      ["Sesión e-1", "Martes 13 oct · 19:00–20:15 · Equipo A · Sesión e-1"],
      ["vs CB Rival", "Miércoles 14 oct · 19:00–20:30 · Equipo A · vs CB Rival"],
    ]);
  });

  it("quien ve varios equipos lee de cuál es cada evento; quien ve uno, no", async () => {
    const rows = [eventRow("e-1", ["time"], { teams: { name: "Equipo B" } })];

    useDb(found(rows));
    mocks.getTeamScope.mockResolvedValue(scope([TEAM_A, TEAM_B]));
    expect((await listRecentChanges(CTX, NOW, 3)).items[0]?.subtitle).toBe(
      "Martes 13 oct · 19:00–20:15 · Equipo B · Sesión e-1",
    );

    useDb(found(rows));
    mocks.getTeamScope.mockResolvedValue(scope([TEAM_B], [TEAM_A, TEAM_B]));
    expect((await listRecentChanges(CTX, NOW, 3)).items[0]?.subtitle).toBe("Martes 13 oct · 19:00–20:15 · Sesión e-1");
  });

  it("los enseña en el orden en que los da la base, que ya los trae por cercanía", async () => {
    const day = (n: number) => ({
      starts_at: `2026-10-1${n}T17:00:00+00:00`,
      ends_at: `2026-10-1${n}T18:15:00+00:00`,
    });
    useDb(found([eventRow("e-1", ["time"], day(1)), eventRow("e-2", ["cancelled", "time"], day(2)), eventRow("e-3", ["location"], day(3))]));

    const { items } = await listRecentChanges(CTX, NOW, 3);

    expect(items.map((item) => [item.eventId, item.label])).toEqual([
      ["e-1", "Cambio de hora"],
      ["e-2", "Cancelada"],
      ["e-3", "Cambio de lugar"],
    ]);
  });

  it("`more` sale del recuento de la base: los que hay menos los que se enseñan", async () => {
    useDb(found([eventRow("e-1"), eventRow("e-2"), eventRow("e-3")], 7));

    const { items, more } = await listRecentChanges(CTX, NOW, 3);

    expect(items).toHaveLength(3);
    expect(more).toBe(4);
  });

  it("si la base no da recuento, no queda ninguno fuera", async () => {
    useDb(found([eventRow("e-1"), eventRow("e-2")], null));

    expect((await listRecentChanges(CTX, NOW, 3)).more).toBe(0);
  });

  it("ignora el entrenamiento sin plan y el partido sin sus datos: no se enseñan en ningún otro sitio", async () => {
    useDb(
      found([
        eventRow("e-sin-plan", ["time"], { practice_plans: [] }),
        eventRow("e-sin-plan-null", ["time"], { practice_plans: null }),
        eventRow("g-sin-datos", ["time"], { kind: "game", practice_plans: [], games: [] }),
        // Un partido no se titula con un plan, ni una sesión con un rival.
        eventRow("g-con-plan", ["time"], { kind: "game", practice_plans: [{ title: "Plan" }], games: [] }),
        eventRow("e-con-rival", ["time"], { practice_plans: [], games: [{ opponent_name: "CB Rival" }] }),
        eventRow("e-1"),
      ]),
    );

    const { items } = await listRecentChanges(CTX, NOW, 10);

    expect(items.map((item) => item.eventId)).toEqual(["e-1"]);
  });

  it("sin cambios recientes, nada que enseñar", async () => {
    useDb(found([], 0));

    expect(await listRecentChanges(CTX, NOW, 3)).toEqual({ items: [], more: 0 });
  });

  it("si la lectura falla, lo registra y lanza en vez de callar los cambios", async () => {
    const failure = { code: "42501", message: "fila de ana@club-a.test" };
    useDb({ data: null, error: failure, count: null });

    await expect(listRecentChanges(CTX, NOW, 3)).rejects.toThrow(
      "schedule.recent-changes: no se pudo leer de la base de datos",
    );
    expect(mocks.logError).toHaveBeenCalledWith("schedule.recent-changes", failure);
  });

  it("si mis equipos no se pueden leer, no sigue con los cambios", async () => {
    mocks.getTeamScope.mockRejectedValue(new Error("team.staff-teams: no se pudo leer"));
    const { tables } = useDb(found([]));

    await expect(listRecentChanges(CTX, NOW, 3)).rejects.toThrow("no se pudo leer");
    expect(tables).toEqual([]);
  });
});
