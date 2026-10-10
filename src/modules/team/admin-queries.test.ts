import { describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { listCategoriesForAdmin, listSeasonsForAdmin, listTeamsForAdminDetailed } from "./admin-queries";

// Un doble mínimo: aplica el `eq` y devuelve las filas tal cual. RLS no se simula.
// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).

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
        order: () => builder,
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
          resolve({ data: rows, error: null }),
      };
      return builder;
    },
  });
  return calls;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CTX = clubContext("admin");
const ORG = CTX.org.id;

describe("listSeasonsForAdmin", () => {
  it("filtra por el club y mapea las columnas", async () => {
    const calls = installDatabase([
      { id: uuid(1), name: "2026/27", starts_on: "2026-09-01", ends_on: "2027-06-30", is_current: true },
    ]);

    const seasons = await listSeasonsForAdmin(CTX);

    expect(calls[0]?.eq).toEqual({ organization_id: ORG });
    expect(seasons).toEqual([
      { id: uuid(1), name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: true },
    ]);
  });
});

describe("listCategoriesForAdmin", () => {
  it("filtra por el club y mapea las columnas", async () => {
    installDatabase([{ id: uuid(1), name: "Alevín", age_band: "U12", sort: 10 }]);

    expect(await listCategoriesForAdmin(CTX)).toEqual([{ id: uuid(1), name: "Alevín", ageBand: "U12", sort: 10 }]);
  });
});

describe("listTeamsForAdminDetailed", () => {
  it("lleva el nombre de su temporada y su categoría", async () => {
    installDatabase([
      {
        id: uuid(1),
        name: "T1",
        season_id: uuid(2),
        category_id: uuid(3),
        seasons: { name: "2026/27" },
        categories: { name: "Alevín" },
      },
    ]);

    expect(await listTeamsForAdminDetailed(CTX)).toEqual([
      { id: uuid(1), name: "T1", seasonId: uuid(2), seasonName: "2026/27", categoryId: uuid(3), categoryName: "Alevín" },
    ]);
  });

  it("sin temporada o categoría embebida (no debería pasar, pero no rompe): nombre vacío", async () => {
    installDatabase([
      { id: uuid(1), name: "T1", season_id: uuid(2), category_id: uuid(3), seasons: null, categories: null },
    ]);

    expect(await listTeamsForAdminDetailed(CTX)).toEqual([
      { id: uuid(1), name: "T1", seasonId: uuid(2), seasonName: "", categoryId: uuid(3), categoryName: "" },
    ]);
  });
});
