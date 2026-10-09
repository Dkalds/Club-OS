import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubContext } from "@/modules/tenancy/queries";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireClub: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/guards", () => ({ requireClub: mocks.requireClub }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { cancelGame, createGame, recordResult, updateGame } from "./actions";

// Un doble que responde a la lectura de comprobación (equipo o partido del club) y a las
// llamadas a las funciones SQL, y apunta todo. Datos neutros (pnpm check:guards).

type Reply = { data: unknown; error: { code: string; message: string } | null };

function installDatabase({
  found = true,
  rpc = { data: null, error: null },
}: { found?: boolean; rpc?: Reply } = {}) {
  const reads: Array<{ table: string; eq: Record<string, unknown> }> = [];
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const read = { table, eq: {} as Record<string, unknown> };
      reads.push(read);
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => ((read.eq[c] = v), builder),
        maybeSingle: async () => ({ data: found ? { id: "x" } : null, error: null }),
      };
      return builder;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), rpc),
  });
  return { reads, calls };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COACH = clubContext("coach");
const PLAYER_CTX: ClubContext = { ...COACH, membership: { role: "player", personId: uuid(50) } };
const ORG = COACH.org.id;
const TEAM = uuid(1);
const EVENT = uuid(2);

const createInput = {
  teamId: TEAM,
  opponent: " Rival ",
  date: "2026-10-10",
  time: "10:30",
  durationMinutes: 90,
  homeAway: "home" as const,
  competition: "",
  location: "Pabellón",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClub.mockResolvedValue(COACH);
});

describe("createGame", () => {
  it("comprueba el equipo en el club y crea el partido con las horas en la zona del club", async () => {
    const { reads, calls } = installDatabase({ rpc: { data: EVENT, error: null } });

    expect(await createGame("club-a", createInput)).toEqual({ ok: true, data: { eventId: EVENT } });
    expect(reads).toEqual([{ table: "teams", eq: { organization_id: ORG, id: TEAM } }]);
    expect(calls).toEqual([
      {
        fn: "create_game",
        args: {
          p_team: TEAM,
          // 10:30 en Madrid (horario de verano) son las 08:30 UTC; 90 minutos después.
          p_starts_at: "2026-10-10T08:30:00.000Z",
          p_ends_at: "2026-10-10T10:00:00.000Z",
          p_opponent: "Rival",
          p_home_away: "home",
          p_location: "Pabellón",
        },
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/c/[club]/(app)", "layout");
  });

  it("un equipo de otro club: NOT_FOUND sin llamar a la función (C25)", async () => {
    const { calls } = installDatabase({ found: false });

    expect(await createGame("club-a", createInput)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(calls).toEqual([]);
  });

  it("una fecha que no existe: INVALID en la fecha, sin tocar la base", async () => {
    const { reads } = installDatabase();

    expect(await createGame("club-a", { ...createInput, date: "2026-02-30" })).toMatchObject({
      ok: false,
      error: "INVALID",
      fieldErrors: { date: "Elige una fecha y una hora válidas." },
    });
    expect(reads).toEqual([]);
  });

  it("sin rival o con una duración fuera de rango: INVALID con su campo", async () => {
    installDatabase();

    expect(await createGame("club-a", { ...createInput, opponent: "  " })).toMatchObject({
      fieldErrors: { opponent: "Escribe el rival." },
    });
    expect(await createGame("club-a", { ...createInput, durationMinutes: 10 })).toMatchObject({
      fieldErrors: { durationMinutes: "La duración tiene que estar entre 30 y 240 minutos." },
    });
  });

  it("sin permiso: NOT_FOUND sin tocar la base", async () => {
    mocks.requireClub.mockResolvedValue(PLAYER_CTX);
    const { reads, calls } = installDatabase();

    expect(await createGame("club-a", createInput)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect([...reads, ...calls]).toEqual([]);
  });
});

describe("updateGame, recordResult, cancelGame", () => {
  it("comprueban el partido en el club antes de llamar a su función", async () => {
    const { reads, calls } = installDatabase();

    await updateGame("club-a", {
      ...createInput,
      eventId: EVENT,
      homeAway: "",
      location: "",
      opponentNotes: "Defienden en zona",
    });
    await recordResult("club-a", { eventId: EVENT, scoreFor: 61, scoreAgainst: 58 });
    await cancelGame("club-a", { eventId: EVENT });

    for (const read of reads) {
      expect(read).toEqual({ table: "events", eq: { organization_id: ORG, id: EVENT, kind: "game" } });
    }
    expect(calls.map((c) => c.fn)).toEqual(["update_game", "record_game_result", "cancel_game"]);
    // Lo que llega vacío no se manda: la función lo deja vacío.
    expect(calls[0]?.args).toEqual({
      p_event: EVENT,
      p_starts_at: "2026-10-10T08:30:00.000Z",
      p_ends_at: "2026-10-10T10:00:00.000Z",
      p_opponent: "Rival",
      p_opponent_notes: "Defienden en zona",
    });
    expect(calls[1]?.args).toEqual({ p_event: EVENT, p_score_for: 61, p_score_against: 58 });
  });

  it("los errores de la función llegan con su nombre: GAME_CLOSED, INVALID", async () => {
    installDatabase({ rpc: { data: null, error: { code: "P0001", message: "GAME_CLOSED" } } });
    expect(await cancelGame("club-a", { eventId: EVENT })).toEqual({ ok: false, error: "GAME_CLOSED" });

    installDatabase({ rpc: { data: null, error: { code: "22023", message: "INVALID" } } });
    expect(await recordResult("club-a", { eventId: EVENT, scoreFor: 1, scoreAgainst: 0 })).toEqual({
      ok: false,
      error: "INVALID",
    });
  });

  it("un tanteo imposible no llega a la base", async () => {
    const { calls } = installDatabase();

    expect(await recordResult("club-a", { eventId: EVENT, scoreFor: -1, scoreAgainst: 0 })).toMatchObject({
      fieldErrors: { scoreFor: "Entre 0 y 300." },
    });
    expect(calls).toEqual([]);
  });
});
