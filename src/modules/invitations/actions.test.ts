import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { cancelInvitation, createInvitation, resendInvitation } from "./actions";

// Un doble que responde a la lectura de comprobación (persona del club) y a las llamadas a
// `create_invitation`, y apunta todo lo que llega a `update`. Datos neutros (pnpm check:guards).

type Reply = { data: unknown; error: { code: string; message: string } | null };

function installDatabase({
  personFound = true,
  rpc = { data: "invitation-id", error: null },
  updateRows = [{ id: "invitation-id" }],
}: { personFound?: boolean; rpc?: Reply; updateRows?: Array<{ id: string }> } = {}) {
  const reads: Array<{ table: string; eq: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; values: unknown; eq: Record<string, unknown>; is: Record<string, unknown> }> = [];
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      if (table === "people") {
        const read = { table, eq: {} as Record<string, unknown> };
        reads.push(read);
        const builder = {
          select: () => builder,
          eq: (c: string, v: unknown) => ((read.eq[c] = v), builder),
          maybeSingle: async () => ({ data: personFound ? { id: "x" } : null, error: null }),
        };
        return builder;
      }

      const update = { table, values: null as unknown, eq: {} as Record<string, unknown>, is: {} as Record<string, unknown> };
      updates.push(update);
      const builder = {
        update: (values: unknown) => ((update.values = values), builder),
        eq: (c: string, v: unknown) => ((update.eq[c] = v), builder),
        is: (c: string, v: unknown) => ((update.is[c] = v), builder),
        select: () => Promise.resolve({ data: updateRows, error: null }),
      };
      return builder;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), rpc),
  });

  return { reads, updates, calls };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = clubContext("admin");
const ORG = ADMIN.org.id;
const TEAM = uuid(1);
const PERSON = uuid(2);
const INVITATION = uuid(3);

const HASH_RE = /^[0-9a-f]{64}$/;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClub.mockResolvedValue(ADMIN);
});

describe("createInvitation", () => {
  it("invita a un admin, sin equipo ni persona", async () => {
    const { calls } = installDatabase();

    const result = await createInvitation("club-a", { email: "Nueva@Club-A.test ", role: "admin" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.invitationId).toBe("invitation-id");
    expect(result.data.token).toMatch(/^[0-9a-f]{64}$/);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe("create_invitation");
    expect(calls[0]?.args).toMatchObject({
      p_org: ORG,
      p_email: "nueva@club-a.test",
      p_role: "admin",
    });
    expect(calls[0]?.args.p_token_hash).toMatch(HASH_RE);
    expect(Date.parse(calls[0]?.args.p_expires_at as string)).toBeGreaterThan(Date.now());
    expect(calls[0]?.args).not.toHaveProperty("p_team");
    expect(calls[0]?.args).not.toHaveProperty("p_person");
  });

  it("invita a un coach con equipo, rol y una persona ya dada de alta", async () => {
    const { reads, calls } = installDatabase();

    const result = await createInvitation("club-a", {
      email: "coach@club-a.test",
      role: "coach",
      teamId: TEAM,
      staffRole: "assistant",
      personId: PERSON,
    });

    expect(result.ok).toBe(true);
    expect(reads).toEqual([{ table: "people", eq: { organization_id: ORG, id: PERSON } }]);
    expect(calls[0]?.args).toMatchObject({
      p_team: TEAM,
      p_staff_role: "assistant",
      p_person: PERSON,
    });
  });

  it("una persona de otro club: NOT_FOUND sin llamar a la función (C25)", async () => {
    const { calls } = installDatabase({ personFound: false });

    const result = await createInvitation("club-a", {
      email: "coach@club-a.test",
      role: "coach",
      teamId: TEAM,
      staffRole: "assistant",
      personId: PERSON,
    });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(calls).toEqual([]);
  });

  it("un coach sin equipo: INVALID en teamId, sin tocar la base", async () => {
    const { calls } = installDatabase();

    const result = await createInvitation("club-a", { email: "coach@club-a.test", role: "coach" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID");
    expect(calls).toEqual([]);
  });

  it("un email repetido: INVALID marcando el campo", async () => {
    installDatabase({ rpc: { data: null, error: { code: "23505", message: "duplicate key" } } });

    const result = await createInvitation("club-a", { email: "ya@club-a.test", role: "admin" });

    expect(result).toMatchObject({
      ok: false,
      error: "INVALID",
      fieldErrors: { email: "Ya hay una invitación pendiente para este email." },
    });
  });
});

describe("resendInvitation", () => {
  it("pone un token y una caducidad nuevos a una invitación pendiente", async () => {
    const { updates } = installDatabase();

    const result = await resendInvitation("club-a", { invitationId: INVITATION });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.token).toMatch(/^[0-9a-f]{64}$/);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.table).toBe("invitations");
    expect(updates[0]?.eq).toEqual({ organization_id: ORG, id: INVITATION });
    expect(updates[0]?.is).toEqual({ accepted_at: null, cancelled_at: null });
  });

  it("una invitación ya aceptada o cancelada: NOT_FOUND", async () => {
    installDatabase({ updateRows: [] });

    expect(await resendInvitation("club-a", { invitationId: INVITATION })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
});

describe("cancelInvitation", () => {
  it("cancela una invitación pendiente", async () => {
    const { updates } = installDatabase();

    expect(await cancelInvitation("club-a", { invitationId: INVITATION })).toEqual({ ok: true, data: null });
    expect(updates[0]?.values).toMatchObject({ cancelled_at: expect.any(String) });
  });

  it("una invitación ya aceptada o cancelada: NOT_FOUND", async () => {
    installDatabase({ updateRows: [] });

    expect(await cancelInvitation("club-a", { invitationId: INVITATION })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
});
