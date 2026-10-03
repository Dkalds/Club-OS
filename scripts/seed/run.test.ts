import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { buildSeedData } from "./data";
import { runSeed } from "./run";

// Un supabase-js falso que solo registra llamadas. No sustituye al test de integración
// (seed.int.test.ts, contra Supabase local): comprueba el orden, los argumentos y el manejo
// de errores de runSeed sin base de datos.

type Filter = [op: string, column: string, value: unknown];
type Call = {
  table: string;
  op: "upsert" | "delete";
  rows?: Record<string, unknown>[];
  onConflict?: string;
  filters: Filter[];
};

type FakeOptions = {
  existingUsers?: { id: string; email: string }[];
  failOnTable?: string;
  failOnOp?: "upsert" | "delete";
  failListUsers?: boolean;
  failCreateUser?: boolean;
  // El servidor devuelve como mucho este número de usuarios por página, pida lo que pida.
  pageCap?: number;
};

function fakeClient(options: FakeOptions = {}) {
  const calls: Call[] = [];
  const users = [...(options.existingUsers ?? [])];
  const created: string[] = [];
  const listPages: { page: number; perPage: number }[] = [];

  const result = (call: Call) => ({
    error:
      options.failOnTable === call.table && (options.failOnOp ?? call.op) === call.op
        ? { message: "fallo simulado" }
        : null,
  });

  const client = {
    from(table: string) {
      return {
        upsert(rows: Record<string, unknown>[], opts?: { onConflict?: string }) {
          const call: Call = { table, op: "upsert", rows, onConflict: opts?.onConflict, filters: [] };
          calls.push(call);
          return Promise.resolve(result(call));
        },
        delete() {
          const call: Call = { table, op: "delete", filters: [] };
          calls.push(call);
          const query = {
            eq(column: string, value: unknown) {
              call.filters.push(["eq", column, value]);
              return query;
            },
            not(column: string, op: string, value: unknown) {
              call.filters.push([`not.${op}`, column, value]);
              return query;
            },
            then<T>(onFulfilled: (value: { error: { message: string } | null }) => T) {
              return Promise.resolve(result(call)).then(onFulfilled);
            },
          };
          return query;
        },
      };
    },
    auth: {
      admin: {
        listUsers({ page, perPage }: { page: number; perPage: number }) {
          listPages.push({ page, perPage });
          if (options.failListUsers) {
            return Promise.resolve({ data: { users: [] }, error: { message: "sin acceso" } });
          }
          const size = Math.min(perPage, options.pageCap ?? perPage);
          const slice = users.slice((page - 1) * size, page * size);
          return Promise.resolve({ data: { users: slice }, error: null });
        },
        createUser({ email }: { email: string; email_confirm?: boolean }) {
          if (options.failCreateUser) {
            return Promise.resolve({ data: { user: null }, error: { message: "no se pudo" } });
          }
          const user = { id: `00000000-0000-4000-8000-${String(users.length + 1).padStart(12, "0")}`, email };
          users.push(user);
          created.push(email);
          return Promise.resolve({ data: { user }, error: null });
        },
      },
    },
  };

  return {
    client: client as unknown as SupabaseClient<Database>,
    calls,
    created,
    users,
    listPages,
  };
}

const NOW = new Date("2026-10-02T10:00:00Z");
const data = buildSeedData(NOW);
const seedEmails = data.users.map((u) => u.email);

const TABLES_IN_ORDER = [
  "organizations",
  "organization_branding",
  "people",
  "seasons",
  "categories",
  "teams",
  "memberships",
  "team_staff",
  "team_players",
  "focus_areas",
  "events",
  "games",
  "practice_plans",
  "practice_items",
  "way_sections",
  "club_values",
  "game_principles",
  "principle_points",
  "standards",
];

describe("runSeed", () => {
  it("crea solo los usuarios que no existen, con el email confirmado y sin contraseña", async () => {
    const fake = fakeClient({
      existingUsers: [
        { id: "11111111-1111-4111-8111-111111111111", email: "alex@arcangel.test" },
        { id: "22222222-2222-4222-8222-222222222222", email: "Raul@Arcangel.test" },
      ],
    });
    await runSeed(NOW, fake.client);
    expect(fake.created.sort()).toEqual(
      seedEmails.filter((e) => e !== "alex@arcangel.test" && e !== "raul@arcangel.test").sort(),
    );
  });

  it("pasa email_confirm: true y ninguna contraseña", async () => {
    const seen: Record<string, unknown>[] = [];
    const fake = fakeClient();
    const admin = (fake.client as unknown as {
      auth: { admin: { createUser: (a: Record<string, unknown>) => unknown } };
    }).auth.admin;
    const original = admin.createUser.bind(admin);
    admin.createUser = (attrs) => {
      seen.push(attrs);
      return original(attrs);
    };
    await runSeed(NOW, fake.client);
    expect(seen).toHaveLength(seedEmails.length);
    for (const attrs of seen) {
      expect(attrs.email_confirm).toBe(true);
      expect(Object.keys(attrs).sort()).toEqual(["email", "email_confirm"]);
    }
  });

  it("recorre todas las páginas de usuarios antes de decidir quién falta", async () => {
    const existing = Array.from({ length: 1500 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      email: `otro${i}@ejemplo.test`,
    }));
    // Un usuario del seed en la última página.
    existing[1450] ={ id: "99999999-9999-4999-8999-999999999999", email: "nora@arcangel.test" };
    const fake = fakeClient({ existingUsers: existing });
    await runSeed(NOW, fake.client);
    expect(fake.listPages.length).toBeGreaterThan(1);
    expect(fake.created).not.toContain("nora@arcangel.test");
    expect(fake.created).toHaveLength(seedEmails.length - 1);
  });

  it("no da por última una página corta: el servidor puede limitar perPage", async () => {
    const existing = Array.from({ length: 120 }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      email: `otro${i}@ejemplo.test`,
    }));
    existing[110] = { id: "99999999-9999-4999-8999-999999999999", email: "marta@demo.test" };
    const fake = fakeClient({ existingUsers: existing, pageCap: 50 });
    await runSeed(NOW, fake.client);
    expect(fake.created).not.toContain("marta@demo.test");
    expect(fake.created).toHaveLength(seedEmails.length - 1);
  });

  it("escribe cada tabla después de aquellas de las que depende", async () => {
    const fake = fakeClient();
    await runSeed(NOW, fake.client);
    const order = fake.calls.filter((c) => c.op === "upsert").map((c) => c.table);
    expect(order).toEqual(TABLES_IN_ORDER);
  });

  it("memberships va con el user_id del email y sin la clave email", async () => {
    const fake = fakeClient({
      existingUsers: [{ id: "11111111-1111-4111-8111-111111111111", email: "alex@arcangel.test" }],
    });
    await runSeed(NOW, fake.client);
    const rows = fake.calls.find((c) => c.table === "memberships")?.rows ?? [];
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("email");
      expect(row.user_id).toEqual(expect.any(String));
      expect(row.person_id).toEqual(expect.any(String));
    }
    const alex = data.memberships.find((m) => m.email === "alex@arcangel.test");
    expect(rows.find((r) => r.id === alex?.id)?.user_id).toBe("11111111-1111-4111-8111-111111111111");
    const userIds = rows.map((r) => r.user_id);
    expect(new Set(userIds).size).toBe(userIds.length);
  });

  it("hace upsert con el arbitraje que cada tabla admite", async () => {
    const fake = fakeClient();
    await runSeed(NOW, fake.client);
    const onConflict = Object.fromEntries(
      fake.calls.filter((c) => c.op === "upsert").map((c) => [c.table, c.onConflict]),
    );
    expect(onConflict).toEqual({
      organizations: "id",
      organization_branding: "organization_id",
      people: "id",
      seasons: "id",
      categories: "id",
      teams: "id",
      memberships: "organization_id,user_id",
      team_staff: "team_id,person_id",
      team_players: "team_id,person_id",
      focus_areas: "id",
      events: "id",
      games: "event_id",
      practice_plans: "id",
      // (plan_id, sort) es único pero diferible: no puede ser el árbitro de un ON CONFLICT.
      practice_items: "id",
      way_sections: "id",
      club_values: "id",
      game_principles: "id",
      principle_points: "id",
      standards: "id",
    });
  });

  it("envía a cada tabla exactamente las filas del seed", async () => {
    const fake = fakeClient();
    await runSeed(NOW, fake.client);
    const sent = (table: string) => fake.calls.find((c) => c.table === table && c.op === "upsert")?.rows;
    expect(sent("organizations")).toEqual(data.organizations);
    expect(sent("people")).toEqual(data.people);
    expect(sent("events")).toEqual(data.events);
    expect(sent("games")).toEqual(data.games);
    expect(sent("practice_plans")).toEqual(data.practice_plans);
    expect(sent("practice_items")).toEqual(data.practice_items);
    expect(sent("way_sections")).toEqual(data.way_sections);
    expect(sent("club_values")).toEqual(data.club_values);
    expect(sent("game_principles")).toEqual(data.game_principles);
    expect(sent("principle_points")).toEqual(data.principle_points);
    expect(sent("standards")).toEqual(data.standards);
  });

  it("borra, antes de reescribir los ítems, los de cada plan que ya no están en el seed", async () => {
    const fake = fakeClient();
    await runSeed(NOW, fake.client);
    const itemsUpsert = fake.calls.findIndex((c) => c.table === "practice_items" && c.op === "upsert");
    const deletes = fake.calls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) => call.table === "practice_items" && call.op === "delete");
    expect(deletes).toHaveLength(data.practice_plans.length);
    for (const { call, index } of deletes) {
      expect(index).toBeLessThan(itemsUpsert);
      const planFilter = call.filters.find(([op, column]) => op === "eq" && column === "plan_id");
      const plan = data.practice_plans.find((p) => p.id === planFilter?.[2]);
      expect(plan, "el borrado filtra por un plan del seed").toBeDefined();
      const keep = call.filters.find(([op, column]) => op === "not.in" && column === "id");
      const ids = data.practice_items.filter((i) => i.plan_id === plan?.id).map((i) => i.id);
      expect(keep?.[2]).toBe(`(${ids.join(",")})`);
    }
    // Los borrados solo tocan planes del seed: nunca hay un delete sin filtro.
    expect(deletes.every(({ call }) => call.filters.length >= 1)).toBe(true);
  });

  it("borra, antes de reescribir los puntos, los de cada principio que ya no están en el seed", async () => {
    const fake = fakeClient();
    await runSeed(NOW, fake.client);
    const pointsUpsert = fake.calls.findIndex((c) => c.table === "principle_points" && c.op === "upsert");
    const deletes = fake.calls
      .map((call, index) => ({ call, index }))
      .filter(({ call }) => call.table === "principle_points" && call.op === "delete");
    expect(deletes).toHaveLength(data.game_principles.length);
    for (const { call, index } of deletes) {
      expect(index).toBeLessThan(pointsUpsert);
      const principleFilter = call.filters.find(([op, column]) => op === "eq" && column === "principle_id");
      const principle = data.game_principles.find((p) => p.id === principleFilter?.[2]);
      expect(principle, "el borrado filtra por un principio del seed").toBeDefined();
      const keep = call.filters.find(([op, column]) => op === "not.in" && column === "id");
      const ids = data.principle_points.filter((p) => p.principle_id === principle?.id).map((p) => p.id);
      if (ids.length > 0) {
        expect(keep?.[2]).toBe(`(${ids.join(",")})`);
      } else {
        // Un principio sin puntos en el seed pierde todos los que tenga.
        expect(keep).toBeUndefined();
      }
    }
    // Los borrados solo tocan principios del seed: nunca hay un delete sin filtro.
    expect(deletes.every(({ call }) => call.filters.length >= 1)).toBe(true);
  });

  it("no borra ninguna otra tabla", async () => {
    const fake = fakeClient();
    await runSeed(NOW, fake.client);
    const deleted = new Set(fake.calls.filter((c) => c.op === "delete").map((c) => c.table));
    expect([...deleted]).toEqual(["practice_items", "principle_points"]);
  });

  it.each(TABLES_IN_ORDER)("un error al escribir %s se lanza con el nombre de la tabla", async (table) => {
    const fake = fakeClient({ failOnTable: table, failOnOp: "upsert" });
    await expect(runSeed(NOW, fake.client)).rejects.toThrow(new RegExp(`${table}.*fallo simulado`));
    // Y no sigue escribiendo después del fallo.
    const last = fake.calls[fake.calls.length - 1];
    expect(last.table).toBe(table);
  });

  it("un error al borrar ítems sobrantes también se lanza con la tabla", async () => {
    const fake = fakeClient({ failOnTable: "practice_items", failOnOp: "delete" });
    await expect(runSeed(NOW, fake.client)).rejects.toThrow(/practice_items.*fallo simulado/);
    expect(fake.calls.some((c) => c.table === "practice_items" && c.op === "upsert")).toBe(false);
  });

  it("un error al borrar puntos sobrantes también se lanza con la tabla", async () => {
    const fake = fakeClient({ failOnTable: "principle_points", failOnOp: "delete" });
    await expect(runSeed(NOW, fake.client)).rejects.toThrow(/principle_points.*fallo simulado/);
    expect(fake.calls.some((c) => c.table === "principle_points" && c.op === "upsert")).toBe(false);
  });

  it("si falla la lista de usuarios, no escribe nada", async () => {
    const fake = fakeClient({ failListUsers: true });
    await expect(runSeed(NOW, fake.client)).rejects.toThrow(/listUsers.*sin acceso/);
    expect(fake.calls).toHaveLength(0);
  });

  it("si falla la creación de un usuario, dice cuál y no escribe nada", async () => {
    const fake = fakeClient({ failCreateUser: true });
    await expect(runSeed(NOW, fake.client)).rejects.toThrow(/createUser.*\.test.*no se pudo/);
    expect(fake.calls).toHaveLength(0);
  });

  it("dos ejecuciones seguidas envían lo mismo (idempotente) y no crean usuarios la segunda vez", async () => {
    const fake = fakeClient();
    await runSeed(NOW, fake.client);
    const firstRun = fake.calls.length;
    await runSeed(NOW, fake.client);
    expect(fake.created).toHaveLength(seedEmails.length);
    expect(fake.calls.slice(firstRun)).toEqual(fake.calls.slice(0, firstRun));
  });
});
