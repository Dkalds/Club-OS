import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { buildSeedData } from "./data";
import { runSeed } from "./run";

// `buildSeedData` sigue siendo el de verdad; solo se envuelve en un espía para que un test
// pueda darle a `runSeed` un seed con un autor que no existe.
vi.mock("./data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./data")>();
  return { ...actual, buildSeedData: vi.fn(actual.buildSeedData) };
});

// Un supabase-js falso que solo registra llamadas. No sustituye al test de integración
// (seed.int.test.ts, contra Supabase local): comprueba el orden, los argumentos y el manejo
// de errores de runSeed sin base de datos.

type Filter = [op: string, column: string, value: unknown];
type Call = {
  table: string;
  op: "upsert" | "delete" | "select";
  rows?: Record<string, unknown>[];
  onConflict?: string;
  filters: Filter[];
};

type FakeOptions = {
  existingUsers?: { id: string; email: string }[];
  failOnTable?: string;
  failOnOp?: "upsert" | "delete" | "select";
  // Lo que cada tabla tiene además del seed: lo que devuelve la lectura de lo creado a mano.
  strays?: Record<string, Record<string, unknown>[]>;
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
        select() {
          const call: Call = { table, op: "select", filters: [] };
          calls.push(call);
          const query = {
            in(column: string, values: unknown[]) {
              call.filters.push(["in", column, values]);
              return query;
            },
            not(column: string, op: string, value: unknown) {
              call.filters.push([`not.${op}`, column, value]);
              return query;
            },
            order(column: string) {
              call.filters.push(["order", column, true]);
              return query;
            },
            then<T>(
              onFulfilled: (value: {
                data: Record<string, unknown>[] | null;
                error: { message: string } | null;
              }) => T,
            ) {
              const { error } = result(call);
              const data = error ? null : (options.strays?.[table] ?? []);
              return Promise.resolve({ data, error }).then(onFulfilled);
            },
          };
          return query;
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
  // Antes que los ítems: `practice_items (organization_id, drill_id)` apunta a `drills`.
  "drills",
  "practice_items",
  "way_sections",
  "club_values",
  "game_principles",
  "principle_points",
  "standards",
  // Al final: enlazan focos, principios y Standards, que tienen que existir ya.
  "drill_coaching_points",
  "drill_variants",
  "drill_focus_areas",
  "drill_principles",
  "drill_standards",
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
      drills: "id",
      // (plan_id, sort) es único pero diferible: no puede ser el árbitro de un ON CONFLICT.
      practice_items: "id",
      way_sections: "id",
      club_values: "id",
      game_principles: "id",
      principle_points: "id",
      standards: "id",
      // (drill_id, sort) es único: el árbitro es el id, y los hijos viejos se borran antes.
      drill_coaching_points: "id",
      drill_variants: "id",
      drill_focus_areas: "drill_id,focus_area_id",
      drill_principles: "drill_id,principle_id",
      drill_standards: "drill_id,standard_id",
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
    expect(sent("drill_coaching_points")).toEqual(data.drill_coaching_points);
    expect(sent("drill_variants")).toEqual(data.drill_variants);
    expect(sent("drill_focus_areas")).toEqual(data.drill_focus_areas);
    expect(sent("drill_principles")).toEqual(data.drill_principles);
    expect(sent("drill_standards")).toEqual(data.drill_standards);
  });

  it("drills va con el created_by del autor y sin la clave author_email", async () => {
    const fake = fakeClient({
      existingUsers: [{ id: "33333333-3333-4333-8333-333333333333", email: "Irene@Arcangel.test" }],
    });
    await runSeed(NOW, fake.client);
    const rows = fake.calls.find((c) => c.table === "drills" && c.op === "upsert")?.rows ?? [];
    expect(rows).toHaveLength(data.drills.length);
    const userIdOf = (email: string) =>
      fake.users.find((user) => user.email.toLowerCase() === email.toLowerCase())?.id;
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("author_email");
      expect(row.created_by).toEqual(expect.any(String));
    }
    for (const { author_email, ...columns } of data.drills) {
      expect(rows.find((r) => r.id === columns.id)).toEqual({
        ...columns,
        created_by: userIdOf(author_email),
      });
    }
    // El borrador de Irene es de la cuenta que ya existía.
    const draft = data.drills.find((d) => d.status === "draft");
    expect(rows.find((r) => r.id === draft?.id)?.created_by).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
  });

  it("un autor sin cuenta lanza el error con su email y no escribe nada", async () => {
    const fake = fakeClient();
    const seed = buildSeedData(NOW);
    vi.mocked(buildSeedData).mockReturnValueOnce({
      ...seed,
      drills: seed.drills.map((drill, index) =>
        index === 0 ? { ...drill, author_email: "nadie@arcangel.test" } : drill,
      ),
    });
    await expect(runSeed(NOW, fake.client)).rejects.toThrow(
      "Seed: no hay usuario de Auth para nadie@arcangel.test",
    );
    expect(fake.calls).toHaveLength(0);
  });

  // Lo creado a mano en Gestión (secciones y Standards que no son del seed) no se borra, pero el
  // número es único por club: se lee antes de escribir y va en la misma sentencia que el seed.
  describe("lo creado a mano en los clubes del seed", () => {
    const [clubA] = data.organizations;
    const seedSections = data.way_sections.filter((row) => row.organization_id === clubA.id);
    const seedStandards = data.standards.filter((row) => row.organization_id === clubA.id);
    const straySection = {
      id: "00000000-0000-4000-8000-0000000000a1",
      organization_id: clubA.id,
      number: 1,
      slug: "a-mano",
      title: "A mano",
      summary: null,
      body_md: "Texto.",
      content_kind: "text",
      sort: 1,
      status: "draft",
      created_at: "2026-10-01T10:00:00+00:00",
      updated_at: "2026-10-01T10:00:00+00:00",
      updated_by: "00000000-0000-4000-8000-0000000000ff",
    };
    const strayStandard = {
      id: "00000000-0000-4000-8000-0000000000a2",
      organization_id: clubA.id,
      number: 1,
      title: "A MANO",
      description: "Texto.",
      sort: 9,
      status: "draft",
      created_at: "2026-10-01T10:00:00+00:00",
    };

    it.each([
      ["way_sections", data.way_sections],
      ["standards", data.standards],
    ] as const)("lee lo que no es del seed en %s, en el orden de la lista, antes de escribirla", async (table, rows) => {
      const fake = fakeClient();
      await runSeed(NOW, fake.client);

      const reads = fake.calls.filter((c) => c.table === table && c.op === "select");
      expect(reads).toHaveLength(1);
      expect(reads[0].filters).toEqual([
        ["in", "organization_id", data.organizations.map((org) => org.id)],
        ["not.in", "id", `(${rows.map((row) => row.id).join(",")})`],
        ["order", "sort", true],
        ["order", "created_at", true],
        ["order", "id", true],
      ]);
      const read = fake.calls.indexOf(reads[0]);
      const write = fake.calls.findIndex((c) => c.table === table && c.op === "upsert");
      expect(read).toBeLessThan(write);
    });

    it("solo lee esas dos tablas", async () => {
      const fake = fakeClient();
      await runSeed(NOW, fake.client);

      const read = fake.calls.filter((c) => c.op === "select").map((c) => c.table);
      expect(read).toEqual(["way_sections", "standards"]);
    });

    it("una sección creada a mano va en el mismo upsert, detrás de las del seed y con sus mismas columnas", async () => {
      const fake = fakeClient({ strays: { way_sections: [straySection] } });
      await runSeed(NOW, fake.client);

      const writes = fake.calls.filter((c) => c.table === "way_sections" && c.op === "upsert");
      expect(writes).toHaveLength(1);
      const position = seedSections.length + 1;
      expect(writes[0].rows).toEqual([
        ...data.way_sections,
        {
          id: straySection.id,
          organization_id: clubA.id,
          number: position,
          slug: "a-mano",
          title: "A mano",
          summary: null,
          body_md: "Texto.",
          content_kind: "text",
          status: "draft",
          sort: position,
        },
      ]);
      // Un upsert de varias filas las quiere todas con las mismas claves.
      const keys = (row: Record<string, unknown>) => Object.keys(row).sort();
      expect(keys(writes[0].rows?.at(-1) ?? {})).toEqual(keys(data.way_sections[0]));
    });

    it("un Standard creado a mano con un número del seed va en el mismo upsert con el primero libre, y se avisa", async () => {
      const fake = fakeClient({ strays: { standards: [strayStandard] } });
      const report = await runSeed(NOW, fake.client);

      const writes = fake.calls.filter((c) => c.table === "standards" && c.op === "upsert");
      expect(writes).toHaveLength(1);
      const free = seedStandards.length + 1;
      expect(writes[0].rows).toEqual([
        ...data.standards,
        {
          id: strayStandard.id,
          organization_id: clubA.id,
          number: free,
          title: "A MANO",
          description: "Texto.",
          status: "draft",
          sort: 9,
        },
      ]);
      expect(report).toEqual({
        movedStandards: [{ organization_id: clubA.id, title: "A MANO", from: 1, to: free }],
      });
    });

    it("un Standard creado a mano que no choca con el seed no se reescribe", async () => {
      const fake = fakeClient({ strays: { standards: [{ ...strayStandard, number: 40 }] } });
      const report = await runSeed(NOW, fake.client);

      const written = fake.calls.find((c) => c.table === "standards" && c.op === "upsert")?.rows;
      expect(written).toEqual(data.standards);
      expect(report).toEqual({ movedStandards: [] });
    });

    it.each(["way_sections", "standards"])("si falla la lectura de %s, se lanza con la tabla y no la escribe", async (table) => {
      const fake = fakeClient({ failOnTable: table, failOnOp: "select" });

      await expect(runSeed(NOW, fake.client)).rejects.toThrow(
        new RegExp(`${table} \\(lectura de lo creado a mano\\).*fallo simulado`),
      );
      expect(fake.calls.some((c) => c.table === table && c.op === "upsert")).toBe(false);
    });
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

  // Guardar un ejercicio en la app reemplaza sus puntos y variantes por otros con ids nuevos
  // (`unique (drill_id, sort)`) y rehace sus vínculos: un reseed tiene que dejarlos como los
  // define el seed, así que borra los que sobran ANTES de escribir. La columna es la que
  // identifica a cada fila de la tabla dentro de su ejercicio.
  const DRILL_CHILDREN = [
    ["drill_coaching_points", "id"],
    ["drill_variants", "id"],
    ["drill_focus_areas", "focus_area_id"],
    ["drill_principles", "principle_id"],
    ["drill_standards", "standard_id"],
  ] as const;

  it.each(DRILL_CHILDREN)(
    "borra, antes de reescribir %s, lo que sobra de cada ejercicio del seed",
    async (table, column) => {
      const fake = fakeClient();
      await runSeed(NOW, fake.client);
      const upsert = fake.calls.findIndex((c) => c.table === table && c.op === "upsert");
      const deletes = fake.calls
        .map((call, index) => ({ call, index }))
        .filter(({ call }) => call.table === table && call.op === "delete");
      expect(deletes).toHaveLength(data.drills.length);
      const rows: Record<string, unknown>[] = data[table];
      for (const { call, index } of deletes) {
        expect(index).toBeLessThan(upsert);
        const drillFilter = call.filters.find(([op, col]) => op === "eq" && col === "drill_id");
        const drill = data.drills.find((d) => d.id === drillFilter?.[2]);
        expect(drill, "el borrado filtra por un ejercicio del seed").toBeDefined();
        const keep = call.filters.find(([op, col]) => op === "not.in" && col === column);
        const ids = rows.filter((r) => r.drill_id === drill?.id).map((r) => String(r[column]));
        if (ids.length > 0) {
          expect(keep?.[2]).toBe(`(${ids.join(",")})`);
        } else {
          // Un ejercicio sin filas de esta tabla en el seed pierde todas las que tenga.
          expect(keep).toBeUndefined();
        }
      }
      // Los borrados solo tocan ejercicios del seed: nunca hay un delete sin filtro.
      expect(deletes.every(({ call }) => call.filters.length >= 1)).toBe(true);
    },
  );

  it("no borra ninguna otra tabla", async () => {
    const fake = fakeClient();
    await runSeed(NOW, fake.client);
    const deleted = new Set(fake.calls.filter((c) => c.op === "delete").map((c) => c.table));
    expect([...deleted]).toEqual([
      "practice_items",
      "principle_points",
      "drill_coaching_points",
      "drill_variants",
      "drill_focus_areas",
      "drill_principles",
      "drill_standards",
    ]);
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

  it.each(DRILL_CHILDREN)("un error al borrar %s sobrantes también se lanza con la tabla", async (table) => {
    const fake = fakeClient({ failOnTable: table, failOnOp: "delete" });
    await expect(runSeed(NOW, fake.client)).rejects.toThrow(new RegExp(`${table}.*fallo simulado`));
    expect(fake.calls.some((c) => c.table === table && c.op === "upsert")).toBe(false);
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
