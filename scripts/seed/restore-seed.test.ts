import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { restoreSeed } from "../../e2e/helpers/seed";
import { buildSeedData, seedId } from "./data";

// `restoreSeed` vive en `e2e/helpers/` (lo usan el arranque global y los specs de Gestión),
// pero su test está aquí: Playwright toma como spec cualquier `*.test.ts` de `e2e/`.
//
// Un supabase-js falso que registra los borrados y, si se le dan filas, las borra de verdad
// aplicando los filtros (`in`, `eq`, `not in`). Aquí se fija lo que hace que un borrado sea
// seguro: qué tablas toca, en qué orden, en qué clubes, qué filas respeta y cuándo se niega.
// Que de verdad deje pasar a la suite de e2e tras una ejecución abortada lo comprueba la
// propia suite.

const runSeed = vi.hoisted(() => vi.fn());
vi.mock("./run", () => ({ runSeed }));

type Row = Record<string, unknown>;
type Filter = [op: string, column: string, value: unknown];
type Delete = { table: string; filters: Filter[] };

/** Los ids de un filtro `not.in` de PostgREST: `(a,b,c)`. */
const idsOf = (list: unknown) => String(list).slice(1, -1).split(",").sort();

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([op, column, value]) => {
    if (op === "in") return (value as unknown[]).includes(row[column]);
    if (op === "eq") return row[column] === value;
    if (op === "not.in") return !idsOf(value).includes(String(row[column]));
    throw new Error(`El cliente falso no conoce el filtro ${op}`);
  });
}

function fakeClient(options: { failOnTable?: string; rows?: Record<string, Row[]> } = {}) {
  const deletes: Delete[] = [];
  const rows: Record<string, Row[]> = { ...options.rows };
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
            // `kind` no es columna de todas las tablas que se barren: `restoreSeed` lo filtra
            // con `filter(columna, operador, valor)`, que en el fake se anota como `[operador, …]`.
            filter(column: string, op: string, value: unknown) {
              call.filters.push([op, column, value]);
              return query;
            },
            not(column: string, op: string, value: unknown) {
              call.filters.push([`not.${op}`, column, value]);
              return query;
            },
            then<T>(onFulfilled: (value: { error: { message: string } | null }) => T) {
              const failed = options.failOnTable === table;
              if (!failed) rows[table] = (rows[table] ?? []).filter((row) => !matches(row, call.filters));
              const error = failed ? { message: "fallo simulado" } : null;
              return Promise.resolve({ error }).then(onFulfilled);
            },
          };
          return query;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, deletes, rows };
}

const NOW = new Date("2026-10-02T10:00:00Z");
const data = buildSeedData(NOW);

const SEED_IDS = {
  drills: data.drills.map((row) => row.id),
  way_sections: data.way_sections.map((row) => row.id),
  club_values: data.club_values.map((row) => row.id),
  game_principles: data.game_principles.map((row) => row.id),
  principle_points: data.principle_points.map((row) => row.id),
  standards: data.standards.map((row) => row.id),
  practice_items: data.practice_items.map((row) => row.id),
  practice_plans: data.practice_plans.map((row) => row.id),
  events: data.events.map((row) => row.id),
};
const SWEPT_TABLES = Object.keys(SEED_IDS).sort();

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
  it("borra, en las tablas de la metodología, en los ejercicios y en las de las sesiones, y solo ahí, lo que el seed no conoce", async () => {
    const fake = fakeClient();

    await restoreSeed(NOW, fake.client);

    expect(fake.deletes.map((call) => call.table).sort()).toEqual(SWEPT_TABLES);
    expect(SWEPT_TABLES).toContain("drills");
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

  it("de los eventos solo borra los entrenos: un partido ajeno al seed no se toca", async () => {
    const fake = fakeClient();

    await restoreSeed(NOW, fake.client);

    const events = fake.deletes.filter((call) => call.table === "events");
    expect(events).toHaveLength(1);
    expect(events[0].filters).toContainEqual(["eq", "kind", "practice"]);
    for (const call of fake.deletes.filter((other) => other.table !== "events")) {
      expect(
        call.filters.some(([, column]) => column === "kind"),
        call.table,
      ).toBe(false);
    }
  });

  it("borra primero los ítems, luego los planes y al final los eventos", async () => {
    const fake = fakeClient();

    await restoreSeed(NOW, fake.client);

    // Un plan cuelga de su evento y un ítem de su plan: al revés, el borrado falla.
    const order = fake.deletes.map((call) => call.table);
    expect(order.indexOf("practice_items")).toBeLessThan(order.indexOf("practice_plans"));
    expect(order.indexOf("practice_plans")).toBeLessThan(order.indexOf("events"));
  });

  it("borra los ítems de las sesiones antes que los ejercicios a los que apuntan", async () => {
    const fake = fakeClient();

    await restoreSeed(NOW, fake.client);

    // `practice_items.(organization_id, drill_id)` apunta a `drills` sin cascada: con un
    // ejercicio que aún tuviera ítems, el borrado de los ejercicios sobrantes fallaría.
    const order = fake.deletes.map((call) => call.table);
    expect(order.indexOf("practice_items")).toBeLessThan(order.indexOf("drills"));
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

  describe("con una sesión creada a mano en un club del seed", () => {
    const org = seedId("arcangel", "organization");
    const team = seedId("arcangel", "team:alevin-a");
    const otherOrg = "00000000-0000-4000-8000-000000000001";
    const byHand = {
      event: "11111111-1111-4111-8111-111111111111",
      plan: "22222222-2222-4222-8222-222222222222",
      item: "33333333-3333-4333-8333-333333333333",
      template: "44444444-4444-4444-8444-444444444444",
      templateItem: "55555555-5555-4555-8555-555555555555",
      game: "66666666-6666-4666-8666-666666666666",
    };
    const otherClub = {
      event: "77777777-7777-4777-8777-777777777777",
      plan: "88888888-8888-4888-8888-888888888888",
      item: "99999999-9999-4999-8999-999999999999",
    };

    const seedRows = () => ({
      events: data.events.map((row) => ({ ...row })),
      practice_plans: data.practice_plans.map((row) => ({ ...row })),
      practice_items: data.practice_items.map((row) => ({ ...row })),
    });
    const idsIn = (rows: Row[] | undefined) => (rows ?? []).map((row) => row.id as string).sort();

    function withStrays() {
      const seeded = seedRows();
      return fakeClient({
        rows: {
          ...seeded,
          events: [
            ...seeded.events,
            // La sesión que un e2e dejó a medias: evento, plan e ítem de Alevín A.
            { id: byHand.event, organization_id: org, team_id: team, kind: "practice" },
            // Un partido que no es del seed.
            { id: byHand.game, organization_id: org, team_id: team, kind: "game" },
            // Una sesión de un club que no es del seed.
            { id: otherClub.event, organization_id: otherOrg, team_id: null, kind: "practice" },
          ],
          practice_plans: [
            ...seeded.practice_plans,
            { id: byHand.plan, organization_id: org, team_id: team, event_id: byHand.event },
            // Una plantilla privada: sin equipo ni evento.
            { id: byHand.template, organization_id: org, team_id: null, event_id: null },
            { id: otherClub.plan, organization_id: otherOrg, team_id: null, event_id: null },
          ],
          practice_items: [
            ...seeded.practice_items,
            { id: byHand.item, organization_id: org, plan_id: byHand.plan },
            { id: byHand.templateItem, organization_id: org, plan_id: byHand.template },
            { id: otherClub.item, organization_id: otherOrg, plan_id: otherClub.plan },
          ],
        },
      });
    }

    it("la borra entera: el evento, su plan y sus ítems, y también una plantilla privada", async () => {
      const fake = withStrays();

      await restoreSeed(NOW, fake.client);

      expect(idsIn(fake.rows.events)).not.toContain(byHand.event);
      expect(idsIn(fake.rows.practice_plans)).not.toContain(byHand.plan);
      expect(idsIn(fake.rows.practice_plans)).not.toContain(byHand.template);
      expect(idsIn(fake.rows.practice_items)).not.toContain(byHand.item);
      expect(idsIn(fake.rows.practice_items)).not.toContain(byHand.templateItem);
    });

    it("no toca un partido ajeno al seed ni nada de un club que no es del seed", async () => {
      const fake = withStrays();

      await restoreSeed(NOW, fake.client);

      expect(idsIn(fake.rows.events)).toContain(byHand.game);
      expect(idsIn(fake.rows.events)).toContain(otherClub.event);
      expect(idsIn(fake.rows.practice_plans)).toContain(otherClub.plan);
      expect(idsIn(fake.rows.practice_items)).toContain(otherClub.item);
    });

    it("deja las del seed y nada más que el partido ajeno y lo del otro club", async () => {
      const fake = withStrays();

      await restoreSeed(NOW, fake.client);

      // Los eventos del seed son entrenos y partidos: ninguno se pierde.
      expect(idsIn(fake.rows.events)).toEqual(
        [...SEED_IDS.events, byHand.game, otherClub.event].sort(),
      );
      expect(idsIn(fake.rows.practice_plans)).toEqual([...SEED_IDS.practice_plans, otherClub.plan].sort());
      expect(idsIn(fake.rows.practice_items)).toEqual([...SEED_IDS.practice_items, otherClub.item].sort());
    });
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
    expect(deletedWhenSeeding).toBe(SWEPT_TABLES.length);
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

  it.each(["standards", "practice_plans", "events"])(
    "si un borrado falla lo dice con la tabla (%s) y no siembra a medias",
    async (table) => {
      const fake = fakeClient({ failOnTable: table });

      await expect(restoreSeed(NOW, fake.client)).rejects.toThrow(
        new RegExp(`${table}.*fallo simulado`),
      );

      expect(runSeed).not.toHaveBeenCalled();
    },
  );
});
