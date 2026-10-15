import { describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  listTeamsForAdmin: vi.fn(),
  listStandardsForAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/team/queries", () => ({ listTeamsForAdmin: mocks.listTeamsForAdmin }));
vi.mock("@/modules/methodology/admin-queries", () => ({ listStandardsForAdmin: mocks.listStandardsForAdmin }));

import { getCoverageMatrix } from "./queries";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CTX = clubContext("admin");
const ORG = CTX.org.id;
const TEAM = { id: uuid(1), name: "Alevín A" };
const STANDARD_PUBLISHED = { id: uuid(2), number: 1, title: "Protejo el balón", description: "x", status: "published" as const };
const STANDARD_DRAFT = { id: uuid(3), number: 2, title: "Leo la defensa", description: "x", status: "draft" as const };

describe("getCoverageMatrix", () => {
  it("llama a coverage_by_team con el club y el rango, y solo cuenta Standards publicados", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ team_id: TEAM.id, standard_id: STANDARD_PUBLISHED.id }], error: null });
    mocks.createClient.mockResolvedValue({ rpc });
    mocks.listTeamsForAdmin.mockResolvedValue([TEAM]);
    mocks.listStandardsForAdmin.mockResolvedValue([STANDARD_PUBLISHED, STANDARD_DRAFT]);

    const matrix = await getCoverageMatrix(CTX, "2026-09-01", "2026-10-13");

    expect(rpc).toHaveBeenCalledWith("coverage_by_team", { p_org: ORG, p_from: "2026-09-01", p_to: "2026-10-13" });
    expect(matrix.standards).toEqual([{ id: STANDARD_PUBLISHED.id, number: 1, title: "Protejo el balón", description: "x", status: "published" }]);
    expect(matrix.rows).toEqual([{ team: TEAM, covered: [true] }]);
  });
});
