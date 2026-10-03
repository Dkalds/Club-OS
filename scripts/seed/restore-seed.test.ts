import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { restoreSeed } from "../../e2e/helpers/seed";
import { buildSeedData } from "./data";

// `restoreSeed` vive en `e2e/helpers/` (lo usan el arranque global y los specs de Gestión),
// pero su test está aquí: Playwright toma como spec cualquier `*.test.ts` de `e2e/`.
//
// Un supabase-js falso que solo registra los borrados. Aquí se fija lo que hace que un borrado
// sea seguro: qué tablas toca, en qué clubes, qué filas respeta y cuándo se niega. Que de
// verdad deje pasar a la suite de e2e tras una ejecución abortada lo comprueba la propia suite.

const runSeed = vi.hoisted(() => vi.fn());
vi.mock("./run", () => ({ runSeed }));

type Filter = [op: string, column: string, value: unknown];
type Delete = { table: string; filters: Filter[] };

function fakeClient(options: { failOnTable?: string } = {}) {
  const deletes: Delete[] = [];
  const client = {
    from(table: string) {
      return {
        delete() {
          const call: Delete = { table, filters: [] };
          deletes.push(call);
          const query = {
            in(column: string, values: unknown[]) {
              call.filters.push(["in", column, values]);
              return query;
            },
            not(column: string, op: string, value: unknown) {
              call.filters.push([`not.${op}`, column, value]);
              return query;
            },
            then<T>(onFulfilled: (value: { error: { message: string } | null }) => T) {
              const error = options.failOnTable === table ? { message: "fallo simulado" } : null;
              return Promise.resolve({ error }).then(onFulfilled);
            },
          };
          return query;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, deletes };
}

const NOW = new Date("2026-10-02T10:00:00Z");
const data = buildSeedData(NOW);

const SEED_IDS = {
  way_sections: data.way_sections.map((row) => row.id),
  club_values: data.club_values.map((row) => row.id),
  game_principles: data.game_principles.map((row) => row.id),
  principle_points: data.principle_points.map((row) => row.id),
  standards: data.standards.map((row) => row.id),
};
const METHODOLOGY_TABLES = Object.keys(SEED_IDS).sort();

/** Los ids de un filtro `not.in` de PostgREST: `(a,b,c)`. */
const idsOf = (list: unknown) => String(list).slice(1, -1).split(",").sort();

beforeEach(() => {
  runSeed.mockReset();
  runSeed.mockResolvedValue(undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "clave-de-prueba");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("restoreSeed", () => {
  it("borra, en las cinco tablas de la metodología y solo ahí, lo que el seed no conoce", async () => {
    const fake = fakeClient();

    await restoreSeed(NOW, fake.client);

    expect(fake.deletes.map((call) => call.table).sort()).toEqual(METHODOLOGY_TABLES);
    for (const call of fake.deletes) {
      const keep = call.filters.find(([op]) => op === "not.in");
      expect(keep?.[1], call.table).toBe("id");
      expect(idsOf(keep?.[2]), call.table).toEqual(
        [...SEED_IDS[call.table as keyof typeof SEED_IDS]].sort(),
      );
    }
  });

  it("solo toca los dos clubes del seed: nunca filas de otro club", async () => {
    const fake = fakeClient();

    await restoreSeed(NOW, fake.client);

    const seeded = data.organizations.map((organization) => organization.id);
    expect(seeded).toHaveLength(2);
    for (const call of fake.deletes) {
      expect(call.filters, call.table).toContainEqual(["in", "organization_id", seeded]);
    }
  });

  it("primero borra y después siembra, con el mismo instante y el mismo cliente", async () => {
    const fake = fakeClient();
    let deletedWhenSeeding = -1;
    runSeed.mockImplementation(async () => {
      deletedWhenSeeding = fake.deletes.length;
    });

    await restoreSeed(NOW, fake.client);

    expect(runSeed).toHaveBeenCalledTimes(1);
    expect(runSeed).toHaveBeenCalledWith(NOW, fake.client);
    expect(deletedWhenSeeding).toBe(METHODOLOGY_TABLES.length);
  });

  it("se niega con un Supabase que no es local: ni borra ni siembra", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    // Ni siquiera `ALLOW_REMOTE_SEED`, que autoriza `pnpm seed`, la autoriza a ella.
    vi.stubEnv("ALLOW_REMOTE_SEED", "true");
    const fake = fakeClient();

    await expect(restoreSeed(NOW, fake.client)).rejects.toThrow(/Supabase local/);

    expect(fake.deletes).toEqual([]);
    expect(runSeed).not.toHaveBeenCalled();
  });

  it("si un borrado falla lo dice con la tabla y no siembra a medias", async () => {
    const fake = fakeClient({ failOnTable: "standards" });

    await expect(restoreSeed(NOW, fake.client)).rejects.toThrow(/standards.*fallo simulado/);

    expect(runSeed).not.toHaveBeenCalled();
  });
});
