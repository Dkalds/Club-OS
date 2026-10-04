// Integración contra Supabase local: `supabase start`, `.env.local` con las claves y
// `pnpm test:int`. Escribe con la clave de servicio, así que RLS no interviene.
//
// El estado final de la base es el de un `pnpm seed` hecho ahora mismo. Los e2e no dependen
// de él: vuelven a sembrar al arrancar (`e2e/global-setup.ts`) y calculan lo esperado con
// el instante de esa siembra.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "../lib/admin-client";
import { buildSeedData } from "./data";
import { runSeed } from "./run";

const admin = createAdminClient();
const now = new Date();
const data = buildSeedData(now);

const orgId = (slug: string) => {
  const org = data.organizations.find((o) => o.slug === slug);
  if (!org) throw new Error(`El seed no define el club ${slug}`);
  return org.id;
};

const teamId = (slug: string, name: string) => {
  const team = data.teams.find((t) => t.organization_id === orgId(slug) && t.name === name);
  if (!team) throw new Error(`El seed no define el equipo ${name}`);
  return team.id;
};

async function authUsers() {
  const users: { id: string; email: string }[] = [];
  for (let page = 1; ; page += 1) {
    const { data: result, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    if (result.users.length === 0) return users;
    for (const user of result.users) {
      if (user.email) users.push({ id: user.id, email: user.email });
    }
  }
}

type TableName = keyof Database["public"]["Tables"];
type Count = PromiseLike<{ count: number | null; error: { message: string } | null }>;

describe("seed contra Supabase local", () => {
  beforeAll(async () => {
    // Dos veces seguidas: la segunda tiene que actualizar, no duplicar ni fallar.
    await runSeed(now);
    await runSeed(now);
  }, 120_000);

  it("crea las dos organizaciones", async () => {
    const { data: rows, error } = await admin.from("organizations").select("slug").order("slug");
    expect(error).toBeNull();
    expect(rows).toEqual([{ slug: "arcangel" }, { slug: "club-demo" }]);
  });

  it("Arcángel tiene 19 personas", async () => {
    const { count, error } = await admin
      .from("people")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId("arcangel"));
    expect(error).toBeNull();
    expect(count).toBe(19);
  });

  it("Alevín A tiene 7 eventos", async () => {
    const { count, error } = await admin
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId("arcangel", "Alevín A"));
    expect(error).toBeNull();
    expect(count).toBe(7);
  });

  it("hay 6 usuarios .test en Auth, los del seed", async () => {
    const testUsers = (await authUsers()).filter((user) => user.email.endsWith(".test"));
    expect(testUsers.map((user) => user.email).sort()).toEqual(
      data.users.map((user) => user.email).sort(),
    );
    expect(testUsers).toHaveLength(6);
  });

  it("cada usuario con club tiene su membresía con su persona", async () => {
    const byEmail = new Map((await authUsers()).map((user) => [user.email, user.id]));
    for (const expected of data.memberships) {
      const userId = byEmail.get(expected.email);
      expect(userId, expected.email).toBeDefined();
      const { data: rows, error } = await admin
        .from("memberships")
        .select("organization_id, role, person_id, status")
        .eq("user_id", userId ?? "");
      expect(error).toBeNull();
      expect(rows, expected.email).toEqual([
        {
          organization_id: expected.organization_id,
          role: expected.role,
          person_id: expected.person_id,
          status: "active",
        },
      ]);

      const person = data.people.find((p) => p.id === expected.person_id);
      const { data: stored } = await admin
        .from("people")
        .select("first_name, last_name, organization_id")
        .eq("id", expected.person_id)
        .single();
      expect(stored).toEqual({
        first_name: person?.first_name,
        last_name: person?.last_name,
        organization_id: expected.organization_id,
      });
    }
  });

  it("sin.club@clubos.test existe y no tiene ninguna membresía", async () => {
    const user = (await authUsers()).find((u) => u.email === "sin.club@clubos.test");
    expect(user).toBeDefined();
    const { data: rows, error } = await admin
      .from("memberships")
      .select("id")
      .eq("user_id", user?.id ?? "");
    expect(error).toBeNull();
    expect(rows).toEqual([]);
  });

  it("cada tabla tiene exactamente las filas del seed, tras dos ejecuciones", async () => {
    const orgIds = data.organizations.map((org) => org.id);
    const table = (name: TableName): Count =>
      admin.from(name).select("*", { count: "exact", head: true }).in("organization_id", orgIds);
    const expected: [string, Count, number][] = [
      ["organization_branding", table("organization_branding"), data.organization_branding.length],
      ["people", table("people"), data.people.length],
      ["memberships", table("memberships"), data.memberships.length],
      ["seasons", table("seasons"), data.seasons.length],
      ["categories", table("categories"), data.categories.length],
      ["teams", table("teams"), data.teams.length],
      ["team_staff", table("team_staff"), data.team_staff.length],
      ["team_players", table("team_players"), data.team_players.length],
      ["focus_areas", table("focus_areas"), data.focus_areas.length],
      ["events", table("events"), data.events.length],
      ["games", table("games"), data.games.length],
      ["practice_plans", table("practice_plans"), data.practice_plans.length],
      ["practice_items", table("practice_items"), data.practice_items.length],
      ["way_sections", table("way_sections"), data.way_sections.length],
      ["club_values", table("club_values"), data.club_values.length],
      ["game_principles", table("game_principles"), data.game_principles.length],
      ["principle_points", table("principle_points"), data.principle_points.length],
      ["standards", table("standards"), data.standards.length],
    ];
    for (const [name, query, rows] of expected) {
      const { count, error } = await query;
      expect(error, name).toBeNull();
      expect(count, name).toBe(rows);
    }
  });

  it("la sesión próxima de Alevín A queda con 5 ítems y 75 minutos", async () => {
    const plan = data.practice_plans.find((p) => p.title === "Transición + rebote defensivo");
    const { data: items, error } = await admin
      .from("practice_items")
      .select("minutes")
      .eq("plan_id", plan?.id ?? "");
    expect(error).toBeNull();
    expect(items).toHaveLength(5);
    expect((items ?? []).reduce((sum, item) => sum + item.minutes, 0)).toBe(75);
  });

  it("al reescribir, quita los ítems de una sesión que ya no están en el seed", async () => {
    const plan = data.practice_plans.find((p) => p.title === "Transición + rebote defensivo");
    if (!plan) throw new Error("falta el plan de la primera sesión");
    const items = data.practice_items
      .filter((item) => item.plan_id === plan.id)
      .sort((a, b) => a.sort - b.sort);
    const third = items[2];

    // Simula una versión anterior del seed: el tercer ítem era otro, con otro id pero la
    // misma posición. Si el seed escribiera antes de borrar, `(plan_id, sort)` fallaría.
    const removed = await admin.from("practice_items").delete().eq("id", third.id);
    expect(removed.error).toBeNull();
    const stray = await admin.from("practice_items").insert({
      id: randomUUID(),
      organization_id: plan.organization_id,
      plan_id: plan.id,
      sort: third.sort,
      phase: "Prueba",
      title_override: "Ítem sobrante",
      minutes: 5,
    });
    expect(stray.error).toBeNull();

    await runSeed(now);

    const { data: after, error } = await admin
      .from("practice_items")
      .select("id, sort, title_override, minutes")
      .eq("plan_id", plan.id)
      .order("sort");
    expect(error).toBeNull();
    expect(after).toEqual(
      items.map((item) => ({
        id: item.id,
        sort: item.sort,
        title_override: item.title_override,
        minutes: item.minutes,
      })),
    );
  });

  // Los cuatro tipos de contenido con estado: todo lo que el seed escribe está publicado.
  type StatusTable = "way_sections" | "club_values" | "game_principles" | "standards";
  async function statusesOf(table: StatusTable, organizationId: string): Promise<string[]> {
    const { data: rows, error } = await admin
      .from(table)
      .select("status")
      .eq("organization_id", organizationId);
    expect(error, table).toBeNull();
    return (rows ?? []).map((row) => row.status);
  }

  async function countOf(
    table: StatusTable | "principle_points",
    organizationId: string,
  ): Promise<number> {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    expect(error, table).toBeNull();
    return count ?? 0;
  }

  it("Arcángel tiene su metodología", async () => {
    const org = orgId("arcangel");
    expect(await countOf("way_sections", org)).toBe(5);
    expect(await countOf("club_values", org)).toBe(3);
    expect(await countOf("game_principles", org)).toBe(4);
    expect(await countOf("principle_points", org)).toBe(7);
    expect(await countOf("standards", org)).toBe(5);
    for (const table of ["way_sections", "club_values", "game_principles", "standards"] as const) {
      const statuses = await statusesOf(table, org);
      expect(statuses.length, table).toBeGreaterThan(0);
      expect(
        statuses.every((status) => status === "published"),
        `${table} publicado`,
      ).toBe(true);
    }
  });

  it("Club Demo tiene la suya", async () => {
    const org = orgId("club-demo");
    expect(await countOf("way_sections", org)).toBe(2);
    expect(await countOf("standards", org)).toBe(2);
    expect(await countOf("club_values", org)).toBe(0);
    expect(await countOf("game_principles", org)).toBe(0);
    expect(await countOf("principle_points", org)).toBe(0);
    for (const table of ["way_sections", "standards"] as const) {
      expect(await statusesOf(table, org), table).toEqual(["published", "published"]);
    }
  });

  it("orden del seed", async () => {
    const org = orgId("arcangel");
    const { data: sections, error: sectionsError } = await admin
      .from("way_sections")
      .select("number, slug, sort")
      .eq("organization_id", org)
      .order("sort");
    expect(sectionsError).toBeNull();
    expect((sections ?? []).map((section) => section.number)).toEqual([1, 2, 3, 4, 5]);
    expect((sections ?? [])[2]?.slug).toBe("como-jugamos");

    const { data: principle, error: principleError } = await admin
      .from("game_principles")
      .select("id")
      .eq("organization_id", org)
      .eq("slug", "ataque")
      .single();
    expect(principleError).toBeNull();
    const { data: points, error: pointsError } = await admin
      .from("principle_points")
      .select("text")
      .eq("principle_id", principle?.id ?? "")
      .order("sort");
    expect(pointsError).toBeNull();
    expect((points ?? []).map((point) => point.text)).toEqual([
      "Espacios",
      "Pase",
      "1x1",
      "2x2",
      "Pasar y cortar",
      "Toma de decisiones",
    ]);
  });

  it("al reescribir, deja los puntos de cada principio como los define el seed", async () => {
    // `save_game_principle` reemplaza los puntos de un principio por otros con ids nuevos.
    // Simula esa edición hecha a mano: «Ataque» con otros puntos, «Transición» con uno de
    // más y «Defensa», que en el seed no tiene ninguno, con uno propio.
    const org = orgId("arcangel");
    const principleOf = (slug: string) => {
      const principle = data.game_principles.find(
        (p) => p.organization_id === org && p.slug === slug,
      );
      if (!principle) throw new Error(`El seed no define el principio ${slug}`);
      return principle.id;
    };
    const pointsOf = (principleId: string) =>
      data.principle_points
        .filter((point) => point.principle_id === principleId)
        .sort((a, b) => a.sort - b.sort)
        .map((point) => ({ id: point.id, sort: point.sort, text: point.text }));
    const stray = (principleId: string, sort: number, text: string) => ({
      id: randomUUID(),
      organization_id: org,
      principle_id: principleId,
      sort,
      text,
    });

    const ataque = principleOf("ataque");
    const transicion = principleOf("transicion");
    const defensa = principleOf("defensa");

    const removed = await admin.from("principle_points").delete().eq("principle_id", ataque);
    expect(removed.error).toBeNull();
    const written = await admin
      .from("principle_points")
      .insert([
        stray(ataque, 1, "Punto editado"),
        stray(ataque, 2, "Otro punto editado"),
        stray(transicion, 2, "Punto de más"),
        stray(defensa, 1, "Punto propio"),
      ]);
    expect(written.error).toBeNull();

    await runSeed(now);

    for (const principleId of [ataque, transicion, defensa]) {
      const { data: after, error } = await admin
        .from("principle_points")
        .select("id, sort, text")
        .eq("principle_id", principleId)
        .order("sort");
      expect(error).toBeNull();
      expect(after).toEqual(pointsOf(principleId));
    }
  });
});

// Un club del seed que ya se ha usado: dirección ha renumerado y ha creado contenido en
// Gestión. El seed devuelve lo suyo a su sitio sin borrar lo creado a mano ni chocar con ello
// (el número es único por club en las secciones y en los Standards).
describe("volver a sembrar un club con contenido creado a mano", () => {
  const org = orgId("arcangel");
  const created: { table: "way_sections" | "standards"; id: string }[] = [];

  afterAll(async () => {
    // El estado final vuelve a ser el de un seed recién hecho.
    for (const { table, id } of created) {
      const { error } = await admin.from(table).delete().eq("id", id);
      if (error) throw new Error(`No se pudo borrar ${id} de ${table}: ${error.message}`);
    }
    await runSeed(now);
  }, 120_000);

  it("los Standards del seed recuperan su número, y el creado a mano que lo ocupa pasa al primero libre", async () => {
    const seedStandards = data.standards
      .filter((standard) => standard.organization_id === org)
      .sort((a, b) => a.number - b.number);
    const [first, second, third] = seedStandards;

    // Dirección intercambia el 1 y el 2 y pasa el 3 al 9...
    const swapped = await admin.from("standards").upsert(
      [
        { ...first, number: second.number },
        { ...second, number: first.number },
      ],
      { onConflict: "id" },
    );
    expect(swapped.error).toBeNull();
    const moved = await admin.from("standards").update({ number: 9 }).eq("id", third.id);
    expect(moved.error).toBeNull();
    // ...y crea dos: uno con el 3, que ha quedado libre, y otro lejos de los del seed.
    const byHand = [
      { id: randomUUID(), number: third.number, title: "A MANO CON EL TRES", sort: 6 },
      { id: randomUUID(), number: 20, title: "A MANO CON EL VEINTE", sort: 7 },
    ].map((row) => ({ ...row, organization_id: org, description: "Creado en Gestión." }));
    created.push(...byHand.map((row) => ({ table: "standards" as const, id: row.id })));
    const inserted = await admin.from("standards").insert(byHand);
    expect(inserted.error).toBeNull();

    const report = await runSeed(now);

    const { data: after, error } = await admin
      .from("standards")
      .select("id, number")
      .eq("organization_id", org)
      .order("number");
    expect(error).toBeNull();
    expect(after).toEqual([
      ...seedStandards.map((standard) => ({ id: standard.id, number: standard.number })),
      { id: byHand[0].id, number: 6 },
      { id: byHand[1].id, number: 20 },
    ]);
    expect(report.movedStandards).toEqual([
      { organization_id: org, title: "A MANO CON EL TRES", from: 3, to: 6 },
    ]);
  });

  it("las secciones creadas a mano quedan detrás de las del seed, en su orden y sin números repetidos", async () => {
    const seedSections = data.way_sections
      .filter((section) => section.organization_id === org)
      .sort((a, b) => a.number - b.number);
    const byHand = [
      { id: randomUUID(), number: 6, slug: "a-mano-uno", title: "A mano uno" },
      { id: randomUUID(), number: 7, slug: "a-mano-dos", title: "A mano dos" },
    ].map((row) => ({ ...row, organization_id: org, sort: row.number }));
    created.push(...byHand.map((row) => ({ table: "way_sections" as const, id: row.id })));
    const inserted = await admin.from("way_sections").insert(byHand);
    expect(inserted.error).toBeNull();

    // Dirección sube «A mano dos» al primer puesto: Gestión renumera toda la lista de golpe.
    const order = [byHand[1].id, ...seedSections.map((section) => section.id), byHand[0].id];
    const current = await admin.from("way_sections").select("*").eq("organization_id", org);
    expect(current.error).toBeNull();
    const reordered = await admin.from("way_sections").upsert(
      (current.data ?? []).map((row) => {
        const position = order.indexOf(row.id) + 1;
        return { ...row, number: position, sort: position };
      }),
      { onConflict: "id" },
    );
    expect(reordered.error).toBeNull();

    await runSeed(now);

    const { data: after, error } = await admin
      .from("way_sections")
      .select("id, number, sort")
      .eq("organization_id", org)
      .order("number");
    expect(error).toBeNull();
    expect(after).toEqual([
      ...seedSections.map((section) => ({ id: section.id, number: section.number, sort: section.sort })),
      { id: byHand[1].id, number: 6, sort: 6 },
      { id: byHand[0].id, number: 7, sort: 7 },
    ]);
  });
});
