// Integración contra Supabase local: `supabase start`, `.env.local` con las claves y
// `pnpm test:int`. Escribe con la clave de servicio, así que RLS no interviene.
//
// El estado final de la base es el de un `pnpm seed` hecho ahora mismo. Los e2e no dependen
// de él: vuelven a sembrar al arrancar (`e2e/global-setup.ts`) y calculan lo esperado con
// el instante de esa siembra.

import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
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
});
