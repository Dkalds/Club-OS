import { describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { listPeopleForAdmin } from "./queries";

type Row = Record<string, unknown>;

function installDatabase(rows: Row[]) {
  const calls: Array<{ eq: Record<string, unknown> }> = [];
  mocks.createClient.mockResolvedValue({
    from: () => {
      const call = { eq: {} as Record<string, unknown> };
      calls.push(call);
      const builder = {
        select: () => builder,
        eq: (c: string, v: unknown) => ((call.eq[c] = v), builder),
        order: () => Promise.resolve({ data: rows, error: null }),
      };
      return builder;
    },
  });
  return calls;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CTX = clubContext("admin");
const ORG = CTX.org.id;

describe("listPeopleForAdmin", () => {
  it("filtra por el club y mapea las columnas", async () => {
    const calls = installDatabase([
      { id: uuid(1), first_name: "Ana", last_name: "Pino", birth_year: 2014, archived_at: null, memberships: [] },
    ]);

    const people = await listPeopleForAdmin(CTX);

    expect(calls[0]?.eq).toEqual({ organization_id: ORG });
    expect(people).toEqual([
      { id: uuid(1), firstName: "Ana", lastName: "Pino", birthYear: 2014, archivedAt: null, hasAccount: false },
    ]);
  });

  it("con una membresía: hasAccount true", async () => {
    installDatabase([
      {
        id: uuid(1),
        first_name: "Ana",
        last_name: "Pino",
        birth_year: 2014,
        archived_at: null,
        memberships: [{ user_id: uuid(2) }],
      },
    ]);

    expect((await listPeopleForAdmin(CTX))[0]?.hasAccount).toBe(true);
  });
});
