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

import { archivePerson, createGuardianship, createPerson, updatePerson } from "./actions";

type Reply = { data: unknown; error: { code: string; message: string } | null };

function installDatabase({
  insertReply = { data: { id: "new-id" }, error: null } as Reply,
  updateRows = [{ id: "x" }] as Array<{ id: string }>,
}: { insertReply?: Reply; updateRows?: Array<{ id: string }> } = {}) {
  const inserts: Array<{ table: string; values: unknown }> = [];
  const updates: Array<{ table: string; values: unknown; eq: Record<string, unknown>; is: Record<string, unknown> }> = [];

  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const builder = {
        insert: (values: unknown) => {
          inserts.push({ table, values });
          return table === "people"
            ? { select: () => ({ single: () => Promise.resolve(insertReply) }) }
            : Promise.resolve(insertReply);
        },
        update: (values: unknown) => {
          const entry = { table, values, eq: {} as Record<string, unknown>, is: {} as Record<string, unknown> };
          updates.push(entry);
          const updateBuilder = {
            eq: (c: string, v: unknown) => ((entry.eq[c] = v), updateBuilder),
            is: (c: string, v: unknown) => ((entry.is[c] = v), updateBuilder),
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
const PERSON = uuid(1);
const CHILD = uuid(2);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClub.mockResolvedValue(ADMIN);
});

describe("createPerson", () => {
  it("inserta en el club de quien llama", async () => {
    const { inserts } = installDatabase();

    const result = await createPerson("club-a", { firstName: "Ana", lastName: "Pino", birthYear: 2014 });

    expect(result).toEqual({ ok: true, data: { personId: "new-id" } });
    expect(inserts[0]).toEqual({
      table: "people",
      values: { organization_id: ORG, first_name: "Ana", last_name: "Pino", birth_year: 2014 },
    });
  });

  it("sin año de nacimiento: null, no un error", async () => {
    const { inserts } = installDatabase();

    await createPerson("club-a", { firstName: "Coach", lastName: "Ficticio", birthYear: "" });

    expect((inserts[0]?.values as Record<string, unknown>).birth_year).toBeNull();
  });
});

describe("updatePerson", () => {
  it("de una persona que no es del club: NOT_FOUND", async () => {
    installDatabase({ updateRows: [] });

    expect(await updatePerson("club-a", { personId: PERSON, firstName: "x", lastName: "y", birthYear: null })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
});

describe("archivePerson", () => {
  it("marca archived_at, solo si no estaba ya archivada", async () => {
    const { updates } = installDatabase();

    expect(await archivePerson("club-a", { personId: PERSON })).toEqual({ ok: true, data: null });
    expect(updates[0]).toMatchObject({
      table: "people",
      eq: { organization_id: ORG, id: PERSON },
      is: { archived_at: null },
    });
  });

  it("una que ya está archivada: NOT_FOUND", async () => {
    installDatabase({ updateRows: [] });

    expect(await archivePerson("club-a", { personId: PERSON })).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("createGuardianship", () => {
  it("inserta en el club de quien llama", async () => {
    const { inserts } = installDatabase();

    expect(await createGuardianship("club-a", { guardianPersonId: PERSON, childPersonId: CHILD })).toEqual({
      ok: true,
      data: null,
    });
    expect(inserts[0]).toEqual({
      table: "guardianships",
      values: { organization_id: ORG, guardian_person_id: PERSON, child_person_id: CHILD },
    });
  });

  it("una tutela repetida: INVALID marcando el campo", async () => {
    installDatabase({ insertReply: { data: null, error: { code: "23505", message: "duplicate key" } } });

    expect(await createGuardianship("club-a", { guardianPersonId: PERSON, childPersonId: CHILD })).toMatchObject({
      ok: false,
      error: "INVALID",
      fieldErrors: { childPersonId: "Esa tutela ya existe." },
    });
  });
});
