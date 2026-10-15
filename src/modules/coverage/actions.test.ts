import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ requireClub: vi.fn(), getCoverageMatrix: vi.fn() }));

vi.mock("@/lib/guards", () => ({ requireClub: mocks.requireClub }));
vi.mock("./queries", () => ({ getCoverageMatrix: mocks.getCoverageMatrix }));

import { fetchCoverageMatrix } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchCoverageMatrix", () => {
  it("dirección lee la cobertura del rango pedido", async () => {
    const ctx = clubContext("admin");
    mocks.requireClub.mockResolvedValue(ctx);
    mocks.getCoverageMatrix.mockResolvedValue({ standards: [], rows: [] });

    const result = await fetchCoverageMatrix("club-a", "2026-09-01", "2026-10-13");

    expect(result).toEqual({ ok: true, data: { standards: [], rows: [] } });
    expect(mocks.getCoverageMatrix).toHaveBeenCalledWith(ctx, "2026-09-01", "2026-10-13");
  });

  it("un entrenador (sin coverage.view): NOT_FOUND, sin leer nada", async () => {
    mocks.requireClub.mockResolvedValue(clubContext("coach"));

    const result = await fetchCoverageMatrix("club-a", "2026-09-01", "2026-10-13");

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.getCoverageMatrix).not.toHaveBeenCalled();
  });
});
