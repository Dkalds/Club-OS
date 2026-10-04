import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { restoreSeed } from "../../e2e/helpers/seed";
import { buildSeedData } from "./data";

// `restoreSeed` vive en `e2e/helpers/` (lo usan el arranque global y los specs de Gestión),
// pero su test está aquí: Playwright toma como spec cualquier `*.test.ts` de `e2e/`.
//
// Un supabase-js falso que solo registra los borrados (de filas y de objetos de Storage). Aquí
// se fija lo que hace que un borrado sea seguro: qué tablas y qué carpetas toca, en qué clubes,
// qué filas respeta y cuándo se niega. Que de verdad deje pasar a la suite de e2e tras una
// ejecución abortada lo comprueba la propia suite.

const runSeed = vi.hoisted(() => vi.fn());
vi.mock("./run", () => ({ runSeed }));

type Filter = [op: string, column: string, value: unknown];
type Delete = { table: string; filters: Filter[] };

/**
 * Lo que hay en Storage, como lo devuelve `list`: por carpeta, sus entradas. Un objeto lleva `id`;
 * una subcarpeta, no (`id: null`), igual que en la API real.
 */
type Tree = Record<string, Array<{ name: string; id: string | null }>>;

function fakeClient(options: { failOnTable?: string; tree?: Tree; failOnRemove?: boolean } = {}) {
  const deletes: Delete[] = [];
  const events: string[] = [];
  const listed: Array<{ bucket: string; folder: string }> = [];
  const removed: string[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          async list(folder: string, listOptions?: { limit?: number; offset?: number }) {
            listed.push({ bucket, folder });
            const entries = options.tree?.[folder] ?? [];
            const offset = listOptions?.offset ?? 0;
            const limit = listOptions?.limit ?? 100;
            return { data: entries.slice(offset, offset + limit), error: null };
          },
          async remove(paths: string[]) {
            events.push("remove");
            if (options.failOnRemove) return { data: null, error: { message: "fallo simulado" } };
            removed.push(...paths);
            return { data: [], error: null };
          },
        };
      },
    },
    from(table: string) {
      return {
        delete() {
          const call: Delete = { table, filters: [] };
          deletes.push(call);
          events.push(`delete:${table}`);
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
  return { client: client as unknown as SupabaseClient<Database>, deletes, events, listed, removed };
}

const NOW = new Date("2026-10-02T10:00:00Z");
const data = buildSeedData(NOW);

const SEED_IDS = {
  drills: data.drills.map((row) => row.id),
  // El seed no posee ninguna ficha de medios: todas las de sus clubes son de un e2e abortado.
  media_assets: [] as string[],
  way_sections: data.way_sections.map((row) => row.id),
  club_values: data.club_values.map((row) => row.id),
  game_principles: data.game_principles.map((row) => row.id),
  principle_points: data.principle_points.map((row) => row.id),
  standards: data.standards.map((row) => row.id),
};
const WRITABLE_TABLES = Object.keys(SEED_IDS).sort();
const SEED_ORGS = data.organizations.map((organization) => organization.id);

/** Una carpeta de ejercicio con un objeto dentro, como la deja una subida: `org/<club>/drills/<ej>/<uuid>.png`. */
function uploadedTree(orgId: string, drill: string, file: string): Tree {
  return {
    [`org/${orgId}`]: [{ name: "drills", id: null }],
    [`org/${orgId}/drills`]: [{ name: drill, id: null }],
    [`org/${orgId}/drills/${drill}`]: [{ name: file, id: "objeto" }],
  };
}

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
  it("borra, en las cinco tablas de la metodología, en los ejercicios y en los medios, y solo ahí, lo que el seed no conoce", async () => {
    const fake = fakeClient();

    await restoreSeed(NOW, fake.client);

    expect(fake.deletes.map((call) => call.table).sort()).toEqual(WRITABLE_TABLES);
    expect(WRITABLE_TABLES).toContain("drills");
    expect(WRITABLE_TABLES).toContain("media_assets");
    for (const call of fake.deletes) {
      const keep = call.filters.find(([op]) => op === "not.in");
      if (call.table === "media_assets") {
        // El seed no posee ninguna: se borran todas las de sus clubes, sin lista de excepciones.
        expect(keep, call.table).toBeUndefined();
        continue;
      }
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

  it("borra los ejercicios antes que los principios y los Standards a los que se vinculan", async () => {
    const fake = fakeClient();

    await restoreSeed(NOW, fake.client);

    // `drill_principles` y `drill_standards` cuelgan de `game_principles` y `standards` sin
    // cascada: sus filas se van con el ejercicio (en cascada), y solo entonces se puede
    // borrar un principio o un Standard sobrante al que un ejercicio sobrante apuntaba.
    const order = fake.deletes.map((call) => call.table);
    expect(order.indexOf("drills")).toBeLessThan(order.indexOf("game_principles"));
    expect(order.indexOf("drills")).toBeLessThan(order.indexOf("standards"));
    expect(order.indexOf("principle_points")).toBeLessThan(order.indexOf("game_principles"));
  });

  it("de los ejercicios respeta todos los del seed (los dos clubes) y nada más", async () => {
    const fake = fakeClient();

    await restoreSeed(NOW, fake.client);

    const drills = fake.deletes.find((call) => call.table === "drills");
    const keep = drills?.filters.find(([op]) => op === "not.in");
    expect(SEED_IDS.drills.length).toBeGreaterThan(18);
    expect(idsOf(keep?.[2])).toEqual([...SEED_IDS.drills].sort());
    expect(drills?.filters.filter(([op]) => op === "in")).toHaveLength(1);
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
    expect(deletedWhenSeeding).toBe(WRITABLE_TABLES.length);
  });

  it("borra los ejercicios antes que las fichas de medios que usan: su diagrama se desliga, no se pierde", async () => {
    const fake = fakeClient();

    await restoreSeed(NOW, fake.client);

    // `drills.diagram_media_id` apunta a `media_assets` con `on delete set null`: cualquier orden
    // vale para la base de datos, pero así un ejercicio sobrante no llega a verse sin diagrama.
    const order = fake.deletes.map((call) => call.table);
    expect(order.indexOf("drills")).toBeLessThan(order.indexOf("media_assets"));
  });

  describe("los objetos de Storage", () => {
    it("vacía la carpeta org/<club>/ del bucket club-media de cada club del seed, hasta el último objeto", async () => {
      const [first, second] = SEED_ORGS;
      const fake = fakeClient({
        tree: {
          ...uploadedTree(first, "ejercicio-a", "uno.png"),
          ...uploadedTree(second, "ejercicio-b", "dos.webp"),
        },
      });

      await restoreSeed(NOW, fake.client);

      expect(fake.removed.sort()).toEqual(
        [`org/${first}/drills/ejercicio-a/uno.png`, `org/${second}/drills/ejercicio-b/dos.webp`].sort(),
      );
      expect(new Set(fake.listed.map((call) => call.bucket))).toEqual(new Set(["club-media"]));
    });

    it("solo mira dentro de org/<club> de los clubes del seed: nunca otra carpeta del bucket", async () => {
      const fake = fakeClient({
        tree: {
          ...uploadedTree("otro-club", "ejercicio-c", "tres.png"),
          "": [{ name: "org", id: null }],
        },
      });

      await restoreSeed(NOW, fake.client);

      expect(fake.listed.map((call) => call.folder).sort()).toEqual(
        SEED_ORGS.map((id) => `org/${id}`).sort(),
      );
      expect(fake.removed).toEqual([]);
    });

    it("sigue las páginas de un listado largo", async () => {
      const [first] = SEED_ORGS;
      const files = Array.from({ length: 205 }, (_, index) => ({ name: `f${index}.png`, id: `o${index}` }));
      const fake = fakeClient({
        tree: {
          [`org/${first}`]: [{ name: "drills", id: null }],
          [`org/${first}/drills`]: [{ name: "ejercicio-a", id: null }],
          [`org/${first}/drills/ejercicio-a`]: files,
        },
      });

      await restoreSeed(NOW, fake.client);

      expect(fake.removed).toHaveLength(205);
      expect(fake.removed).toContain(`org/${first}/drills/ejercicio-a/f204.png`);
    });

    it("no llama a remove si no hay nada que borrar", async () => {
      const fake = fakeClient();

      await restoreSeed(NOW, fake.client);

      expect(fake.events.filter((event) => event === "remove")).toEqual([]);
    });

    it("borra los objetos tras las tablas y antes de sembrar", async () => {
      const [first] = SEED_ORGS;
      const fake = fakeClient({ tree: uploadedTree(first, "ejercicio-a", "uno.png") });
      let eventsWhenSeeding: string[] = [];
      runSeed.mockImplementation(async () => {
        eventsWhenSeeding = [...fake.events];
      });

      await restoreSeed(NOW, fake.client);

      const lastDelete = eventsWhenSeeding.map((event) => event.startsWith("delete:")).lastIndexOf(true);
      expect(eventsWhenSeeding).toContain("remove");
      expect(eventsWhenSeeding.indexOf("remove")).toBeGreaterThan(lastDelete);
    });

    it("si no se puede borrar un objeto lo dice con el bucket y no siembra a medias", async () => {
      const [first] = SEED_ORGS;
      const fake = fakeClient({ tree: uploadedTree(first, "ejercicio-a", "uno.png"), failOnRemove: true });

      await expect(restoreSeed(NOW, fake.client)).rejects.toThrow(/club-media.*fallo simulado/);

      expect(runSeed).not.toHaveBeenCalled();
    });
  });

  it("se niega con un Supabase que no es local: ni borra ni siembra", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    // Ni siquiera `ALLOW_REMOTE_SEED`, que autoriza `pnpm seed`, la autoriza a ella.
    vi.stubEnv("ALLOW_REMOTE_SEED", "true");
    const fake = fakeClient();

    await expect(restoreSeed(NOW, fake.client)).rejects.toThrow(/Supabase local/);

    expect(fake.deletes).toEqual([]);
    expect(fake.listed).toEqual([]);
    expect(fake.removed).toEqual([]);
    expect(runSeed).not.toHaveBeenCalled();
  });

  it("si un borrado falla lo dice con la tabla y no siembra a medias", async () => {
    const fake = fakeClient({ failOnTable: "standards" });

    await expect(restoreSeed(NOW, fake.client)).rejects.toThrow(/standards.*fallo simulado/);

    expect(runSeed).not.toHaveBeenCalled();
  });
});
