import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn(), listMyTeams: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));
vi.mock("@/modules/team/queries", () => ({ listMyTeams: mocks.listMyTeams }));

import { getGame } from "./queries";

// Un doble que apunta los filtros de la consulta y devuelve las filas que se le den, cortadas
// por `limit`. Qué filas cumple cada filtro lo prueba la integración; aquí, que se piden bien.
// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).

type Row = Record<string, unknown>;
type Call = {
  table: string;
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
  gt: Record<string, string>;
  or: string | null;
  order: Array<[string, boolean]>;
  limit: number | null;
};

function installDatabase(rows: Row[], error: { code: string; message: string } | null = null) {
  const calls: Call[] = [];
  const query = (table: string) => {
    const call: Call = { table, eq: {}, in: {}, gt: {}, or: null, order: [], limit: null };
    calls.push(call);
    const reply = () => ({ data: error ? null : rows.slice(0, call.limit ?? rows.length), error });
    const builder = {
      select: () => builder,
      eq: (c: string, v: unknown) => ((call.eq[c] = v), builder),
      in: (c: string, v: unknown[]) => ((call.in[c] = v), builder),
      gt: (c: string, v: string) => ((call.gt[c] = v), builder),
      or: (e: string) => ((call.or = e), builder),
      order: (c: string, o?: { ascending?: boolean }) => (call.order.push([c, o?.ascending ?? true]), builder),
      limit: (n: number) => ((call.limit = n), builder),
      maybeSingle: async () => ({ data: error ? null : (rows[0] ?? null), error }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(reply()).then(resolve),
    };
    return builder;
  };
  mocks.createClient.mockResolvedValue({ from: query });
  return calls;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CTX = clubContext("coach");
const ORG = CTX.org.id;
const NOW = "2026-10-08T10:00:00.000Z";
const TEAM = { id: uuid(1), name: "Equipo A", categoryName: "C", seasonName: "2026/27" };

const gameRow = (n: number) => ({
  id: uuid(100 + n),
  team_id: uuid(1),
  status: "scheduled",
  starts_at: "2026-10-10T08:30:00Z",
  ends_at: "2026-10-10T10:00:00Z",
  location: null,
  games: { opponent_name: `Rival ${n}`, competition_name: null, home_away: null, score_for: null, score_against: null },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listMyTeams.mockResolvedValue([TEAM]);
});

describe("getGame", () => {
  it("un partido del club y de esta temporada", async () => {
    const calls = installDatabase([{ ...gameRow(1), teams: { name: "Equipo A" } }]);

    expect(await getGame(CTX, uuid(101), NOW)).toMatchObject({ eventId: uuid(101), teamName: "Equipo A" });
    expect(calls[0]?.eq).toEqual({
      organization_id: ORG,
      id: uuid(101),
      kind: "game",
      "teams.seasons.is_current": true,
    });
  });

  it("un id que no es uuid: null sin consultar", async () => {
    const calls = installDatabase([]);

    expect(await getGame(CTX, "partido", NOW)).toBeNull();
    expect(calls).toEqual([]);
  });
});
