import { describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { listInvitations } from "./queries";

// Un doble mínimo: aplica el `eq` y el orden, y devuelve las filas tal cual. RLS no se simula.
// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).

type Row = Record<string, unknown>;

function installDatabase(rows: Row[]) {
  const calls: Array<{ eq: Record<string, unknown>; order: string[] }> = [];
  mocks.createClient.mockResolvedValue({
    from: () => {
      const call = { eq: {} as Record<string, unknown>, order: [] as string[] };
      calls.push(call);
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => ((call.eq[c] = v), builder),
        order: (c: string) => (call.order.push(c), Promise.resolve({ data: rows, error: null })),
      };
      return builder;
    },
  });
  return calls;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CTX = clubContext("admin");
const ORG = CTX.org.id;

const row = (extra: Partial<Row> = {}): Row => ({
  id: uuid(1),
  email: "alguien@club-a.test",
  role: "coach",
  team_id: uuid(2),
  staff_role: "assistant",
  person_id: null,
  expires_at: "2026-10-20T00:00:00Z",
  accepted_at: null,
  cancelled_at: null,
  created_at: "2026-10-10T00:00:00Z",
  teams: { name: "Equipo A" },
  ...extra,
});

describe("listInvitations", () => {
  it("filtra por el club y pide el orden de más reciente a más antigua", async () => {
    const calls = installDatabase([row()]);

    await listInvitations(CTX);

    expect(calls).toEqual([{ eq: { organization_id: ORG }, order: ["created_at"] }]);
  });

  it("una pendiente y vigente es 'pending'", async () => {
    installDatabase([row({ expires_at: "2999-01-01T00:00:00Z" })]);

    const [invitation] = await listInvitations(CTX);

    expect(invitation).toMatchObject({ status: "pending", teamName: "Equipo A" });
  });

  it("una pendiente pero caducada es 'expired'", async () => {
    installDatabase([row({ expires_at: "2000-01-01T00:00:00Z" })]);

    const [invitation] = await listInvitations(CTX);

    expect(invitation?.status).toBe("expired");
  });

  it("una aceptada es 'accepted', aunque haya caducado", async () => {
    installDatabase([row({ expires_at: "2000-01-01T00:00:00Z", accepted_at: "2026-10-11T00:00:00Z" })]);

    const [invitation] = await listInvitations(CTX);

    expect(invitation?.status).toBe("accepted");
  });

  it("una cancelada es 'cancelled'", async () => {
    installDatabase([row({ cancelled_at: "2026-10-11T00:00:00Z" })]);

    const [invitation] = await listInvitations(CTX);

    expect(invitation?.status).toBe("cancelled");
  });

  it("un admin sin equipo: teamName null", async () => {
    installDatabase([row({ role: "admin", team_id: null, staff_role: null, teams: null })]);

    const [invitation] = await listInvitations(CTX);

    expect(invitation).toMatchObject({ teamId: null, teamName: null, staffRole: null });
  });
});
