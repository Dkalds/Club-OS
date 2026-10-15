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

import { importPeople } from "./actions";

const ADMIN = clubContext("admin");
const ORG = ADMIN.org.id;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClub.mockResolvedValue(ADMIN);
});

describe("importPeople", () => {
  it("inserta todas las filas de una vez, en el club de quien llama", async () => {
    const inserts: unknown[] = [];
    mocks.createClient.mockResolvedValue({
      from: () => ({
        insert: (values: unknown) => {
          inserts.push(values);
          return { select: () => Promise.resolve({ data: [{ id: "1" }, { id: "2" }], error: null }) };
        },
      }),
    });

    const result = await importPeople("club-a", {
      rows: [
        { firstName: "Ana", lastName: "Pino", birthYear: 2014 },
        { firstName: "Luis", lastName: "Ruiz", birthYear: null },
      ],
    });

    expect(result).toEqual({ ok: true, data: { count: 2 } });
    expect(inserts).toEqual([
      [
        { organization_id: ORG, first_name: "Ana", last_name: "Pino", birth_year: 2014 },
        { organization_id: ORG, first_name: "Luis", last_name: "Ruiz", birth_year: null },
      ],
    ]);
  });

  it("sin filas: INVALID, sin tocar la base", async () => {
    const mock = vi.fn();
    mocks.createClient.mockResolvedValue({ from: mock });

    const result = await importPeople("club-a", { rows: [] });

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(mock).not.toHaveBeenCalled();
  });
});
