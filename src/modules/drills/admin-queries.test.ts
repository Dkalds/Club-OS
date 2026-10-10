import { describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { listDraftDrillsForAdmin } from "./admin-queries";

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

describe("listDraftDrillsForAdmin", () => {
  it("filtra por el club y por borrador, y mapea las columnas", async () => {
    const calls = installDatabase([
      { id: uuid(1), title: "Rondo 4x2", summary: "Rondo de posesión.", created_at: "2026-10-01T00:00:00Z" },
    ]);

    const drafts = await listDraftDrillsForAdmin(CTX);

    expect(calls[0]?.eq).toEqual({ organization_id: ORG, status: "draft" });
    expect(drafts).toEqual([
      { id: uuid(1), title: "Rondo 4x2", summary: "Rondo de posesión.", createdAt: "2026-10-01T00:00:00Z" },
    ]);
  });
});
