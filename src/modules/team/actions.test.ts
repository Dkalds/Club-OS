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

import {
  createCategory,
  createSeason,
  createTeam,
  updateCategory,
  updateSeason,
  updateTeam,
} from "./actions";

type Reply = { data: unknown; error: { code: string; message: string } | null };

function installDatabase({
  insertReply = { data: { id: "new-id" }, error: null } as Reply,
  updateRows = [{ id: "x" }] as Array<{ id: string }>,
}: { insertReply?: Reply; updateRows?: Array<{ id: string }> } = {}) {
  const inserts: Array<{ table: string; values: unknown }> = [];
  const updates: Array<{ table: string; values: unknown; eq: Record<string, unknown> }> = [];

  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const builder = {
        insert: (values: unknown) => {
          inserts.push({ table, values });
          return { select: () => ({ single: () => Promise.resolve(insertReply) }) };
        },
        update: (values: unknown) => {
          const entry = { table, values, eq: {} as Record<string, unknown> };
          updates.push(entry);
          const updateBuilder = {
            eq: (c: string, v: unknown) => ((entry.eq[c] = v), updateBuilder),
            select: () => Promise.resolve({ data: updateRows, error: null }),
          };
          return updateBuilder;
        },
      };
      return builder;
    },
  });

  return { inserts, updates };
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = clubContext("admin");
const ORG = ADMIN.org.id;
const SEASON = uuid(1);
const CATEGORY = uuid(2);
const TEAM = uuid(3);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClub.mockResolvedValue(ADMIN);
});

describe("temporadas", () => {
  it("createSeason inserta en el club de quien llama", async () => {
    const { inserts } = installDatabase();

    const result = await createSeason("club-a", { name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: true });

    expect(result).toEqual({ ok: true, data: { seasonId: "new-id" } });
    expect(inserts[0]).toEqual({
      table: "seasons",
      values: { organization_id: ORG, name: "2026/27", starts_on: "2026-09-01", ends_on: "2027-06-30", is_current: true },
    });
  });

  it("dos actuales a la vez: INVALID marcando isCurrent", async () => {
    installDatabase({ insertReply: { data: null, error: { code: "23505", message: "duplicate key" } } });

    const result = await createSeason("club-a", { name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: true });

    expect(result).toMatchObject({
      ok: false,
      error: "INVALID",
      fieldErrors: { isCurrent: "Ya hay otra temporada marcada como actual." },
    });
  });

  it("updateSeason, de una que no es del club: NOT_FOUND", async () => {
    installDatabase({ updateRows: [] });

    expect(
      await updateSeason("club-a", { seasonId: SEASON, name: "x", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: false }),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("categorías", () => {
  it("createCategory inserta en el club de quien llama", async () => {
    const { inserts } = installDatabase();

    const result = await createCategory("club-a", { name: "Alevín", ageBand: "u12", sort: 10 });

    expect(result).toEqual({ ok: true, data: { categoryId: "new-id" } });
    expect(inserts[0]).toEqual({
      table: "categories",
      values: { organization_id: ORG, name: "Alevín", age_band: "U12", sort: 10 },
    });
  });

  it("updateCategory, de una que no es del club: NOT_FOUND", async () => {
    installDatabase({ updateRows: [] });

    expect(await updateCategory("club-a", { categoryId: CATEGORY, name: "x", ageBand: "U12", sort: 0 })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
});

describe("equipos", () => {
  it("createTeam inserta en el club de quien llama", async () => {
    const { inserts } = installDatabase();

    const result = await createTeam("club-a", { seasonId: SEASON, categoryId: CATEGORY, name: "T1" });

    expect(result).toEqual({ ok: true, data: { teamId: "new-id" } });
    expect(inserts[0]).toEqual({
      table: "teams",
      values: { organization_id: ORG, season_id: SEASON, category_id: CATEGORY, name: "T1" },
    });
  });

  it("updateTeam, de uno que no es del club: NOT_FOUND", async () => {
    installDatabase({ updateRows: [] });

    expect(await updateTeam("club-a", { teamId: TEAM, seasonId: SEASON, categoryId: CATEGORY, name: "x" })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
});
