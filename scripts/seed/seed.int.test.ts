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
import { buildSeedData, seedId } from "./data";
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

  it("Alevín A tiene 8 eventos, uno de ellos cancelado", async () => {
    const { data: events, error } = await admin
      .from("events")
      .select("id, kind, status")
      .eq("team_id", teamId("arcangel", "Alevín A"));
    expect(error).toBeNull();
    expect(events).toHaveLength(8);
    const cancelled = (events ?? []).filter((event) => event.status === "cancelled");
    expect(cancelled).toEqual([
      { id: seedId("arcangel", "event:alevin-a:cancelled-0"), kind: "practice", status: "cancelled" },
    ]);
  });

  it("la sesión cancelada de Alevín A es «Tiro libre y finalizaciones», con su plan listo y 2 ítems", async () => {
    const eventId = seedId("arcangel", "event:alevin-a:cancelled-0");
    const { data: plan, error } = await admin
      .from("practice_plans")
      .select("id, title, status, team_id")
      .eq("event_id", eventId)
      .single();
    expect(error).toBeNull();
    expect(plan).toEqual({
      id: seedId("arcangel", "plan:alevin-a:cancelled-0"),
      title: "Tiro libre y finalizaciones",
      status: "ready",
      team_id: teamId("arcangel", "Alevín A"),
    });
    const { data: items, error: itemsError } = await admin
      .from("practice_items")
      .select("phase, title_override, minutes, drill_id")
      .eq("plan_id", plan?.id ?? "")
      .order("sort");
    expect(itemsError).toBeNull();
    // Ninguno lleva ejercicio: sus títulos no son los de la biblioteca.
    expect(items).toEqual([
      { phase: "Tiro", title_override: "Rueda de tiros libres", minutes: 20, drill_id: null },
      { phase: "Técnica", title_override: "Finalizaciones 1x0", minutes: 25, drill_id: null },
    ]);
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
      ["drills", table("drills"), data.drills.length],
      ["drill_coaching_points", table("drill_coaching_points"), data.drill_coaching_points.length],
      ["drill_variants", table("drill_variants"), data.drill_variants.length],
      ["drill_focus_areas", table("drill_focus_areas"), data.drill_focus_areas.length],
      ["drill_principles", table("drill_principles"), data.drill_principles.length],
      ["drill_standards", table("drill_standards"), data.drill_standards.length],
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

  // ── Biblioteca de ejercicios ───────────────────────────────────────────────────────
  const drillOf = (slug: string, title: string) => {
    const drill = data.drills.find((d) => d.organization_id === orgId(slug) && d.title === title);
    if (!drill) throw new Error(`El seed no define el ejercicio ${title} de ${slug}`);
    return drill;
  };
  const userIdOf = async (email: string) => {
    const user = (await authUsers()).find((u) => u.email === email);
    if (!user) throw new Error(`No hay usuario ${email}`);
    return user.id;
  };
  const DRILL_TABLES = [
    "drills",
    "drill_coaching_points",
    "drill_variants",
    "drill_focus_areas",
    "drill_principles",
    "drill_standards",
  ] as const;
  async function drillCounts(): Promise<Record<(typeof DRILL_TABLES)[number], number>> {
    const orgIds = data.organizations.map((org) => org.id);
    const counts = {} as Record<(typeof DRILL_TABLES)[number], number>;
    for (const name of DRILL_TABLES) {
      const { count, error } = await admin
        .from(name)
        .select("*", { count: "exact", head: true })
        .in("organization_id", orgIds);
      expect(error, name).toBeNull();
      counts[name] = count ?? 0;
    }
    return counts;
  }

  it("18 ejercicios de Arcángel y 1 borrador de Irene; Club Demo tiene 2", async () => {
    const { data: arcangel, error } = await admin
      .from("drills")
      .select("title, status, created_by, diagram_media_id")
      .eq("organization_id", orgId("arcangel"));
    expect(error).toBeNull();
    expect(arcangel).toHaveLength(18);
    expect(arcangel?.filter((d) => d.status === "published")).toHaveLength(17);
    const drafts = arcangel?.filter((d) => d.status === "draft");
    expect(drafts).toEqual([
      expect.objectContaining({
        title: "Bloqueo de rebote",
        created_by: await userIdOf("irene@arcangel.test"),
      }),
    ]);
    // Los publicados son de Raúl, y ninguno lleva diagrama.
    const raul = await userIdOf("raul@arcangel.test");
    expect(arcangel?.filter((d) => d.status === "published").every((d) => d.created_by === raul)).toBe(
      true,
    );
    expect(arcangel?.every((d) => d.diagram_media_id === null)).toBe(true);

    const { data: demo, error: demoError } = await admin
      .from("drills")
      .select("title, status, created_by")
      .eq("organization_id", orgId("club-demo"))
      .order("title");
    expect(demoError).toBeNull();
    const marta = await userIdOf("marta@demo.test");
    expect(demo).toEqual([
      { title: "Defensa individual", status: "published", created_by: marta },
      { title: "Tiro en carrera", status: "published", created_by: marta },
    ]);
  });

  it("Rebote + outlet completo", async () => {
    const outlet = drillOf("arcangel", "Rebote + outlet");
    const { data: row, error } = await admin
      .from("drills")
      .select("min_age, max_age, min_players, max_players, min_minutes, max_minutes, equipment")
      .eq("id", outlet.id)
      .single();
    expect(error).toBeNull();
    expect(row).toEqual({
      min_age: 12,
      max_age: null,
      min_players: 6,
      max_players: 12,
      min_minutes: 10,
      max_minutes: 15,
      equipment: ["Balones", "Conos", "Petos"],
    });

    const { data: links, error: linksError } = await admin
      .from("drill_standards")
      .select("standard_id")
      .eq("drill_id", outlet.id);
    expect(linksError).toBeNull();
    const { data: standards, error: standardsError } = await admin
      .from("standards")
      .select("number")
      .in("id", (links ?? []).map((link) => link.standard_id))
      .order("number");
    expect(standardsError).toBeNull();
    expect((standards ?? []).map((s) => s.number)).toEqual([3, 4, 5]);

    const { data: points, error: pointsError } = await admin
      .from("drill_coaching_points")
      .select("text, is_key, sort")
      .eq("drill_id", outlet.id)
      .order("sort");
    expect(pointsError).toBeNull();
    expect(points).toHaveLength(5);
    expect(points?.filter((p) => p.is_key)).toHaveLength(3);
    expect(points?.[0]).toEqual({ text: "Rebote con dos manos", is_key: true, sort: 0 });

    const { data: variants, error: variantsError } = await admin
      .from("drill_variants")
      .select("title")
      .eq("drill_id", outlet.id)
      .order("sort");
    expect(variantsError).toBeNull();
    expect(variants).toEqual([{ title: "Con defensor en el outlet" }, { title: "Tras tiro libre" }]);
  });

  it("ítems enlazados", async () => {
    const plan = data.practice_plans.find((p) => p.title === "Transición + rebote defensivo");
    const { data: items, error } = await admin
      .from("practice_items")
      .select("title_override, drill_id")
      .eq("plan_id", plan?.id ?? "")
      .order("sort");
    expect(error).toBeNull();
    expect(items).toHaveLength(5);
    expect(items?.every((item) => item.drill_id !== null)).toBe(true);
    // Cada ítem apunta al ejercicio que se llama como él, y su título no se toca.
    expect(items).toEqual(
      [
        "Movilidad + rueda de pases",
        "3 calles",
        "Rebote + outlet",
        "3x2 continuo",
        "2x2 presión",
      ].map((title) => ({ title_override: title, drill_id: drillOf("arcangel", title).id })),
    );

    // Ningún ítem de Arcángel con el título de un ejercicio se ha quedado sin enlace.
    const { data: titles, error: titlesError } = await admin
      .from("drills")
      .select("title")
      .eq("organization_id", orgId("arcangel"));
    expect(titlesError).toBeNull();
    const { data: unlinked, error: unlinkedError } = await admin
      .from("practice_items")
      .select("title_override")
      .eq("organization_id", orgId("arcangel"))
      .is("drill_id", null)
      .in("title_override", (titles ?? []).map((d) => d.title));
    expect(unlinkedError).toBeNull();
    expect(unlinked).toEqual([]);
  });

  it("idempotente: los mismos recuentos de ejercicios, hijos y vínculos tras otra ejecución", async () => {
    const before = await drillCounts();
    expect(before).toEqual({
      drills: data.drills.length,
      drill_coaching_points: data.drill_coaching_points.length,
      drill_variants: data.drill_variants.length,
      drill_focus_areas: data.drill_focus_areas.length,
      drill_principles: data.drill_principles.length,
      drill_standards: data.drill_standards.length,
    });
    await runSeed(now);
    expect(await drillCounts()).toEqual(before);
  });

  it("al reescribir, devuelve a lo suyo el estado y el texto de un ejercicio editado", async () => {
    const outlet = drillOf("arcangel", "Rebote + outlet");
    const edited = await admin
      .from("drills")
      .update({ title: "Rebote editado", status: "archived", max_age: 14, equipment: ["Aros"] })
      .eq("id", outlet.id);
    expect(edited.error).toBeNull();

    await runSeed(now);

    const { data: after, error } = await admin
      .from("drills")
      .select("title, status, max_age, equipment")
      .eq("id", outlet.id)
      .single();
    expect(error).toBeNull();
    expect(after).toEqual({
      title: "Rebote + outlet",
      status: "published",
      max_age: null,
      equipment: ["Balones", "Conos", "Petos"],
    });
  });

  it("al reescribir, deja los hijos y vínculos de cada ejercicio como los define el seed", async () => {
    // `save_drill` borra los hijos de un ejercicio y los vuelve a escribir con ids nuevos y
    // las mismas posiciones (`unique (drill_id, sort)`). Simula esa edición en tres
    // ejercicios: «Rebote + outlet» con otros puntos, una variante de más y los vínculos
    // cambiados; «3 calles», que en el seed no tiene variantes, con una; y «Movilidad
    // dinámica», que no tiene Standards ni principios, con uno de cada.
    const org = orgId("arcangel");
    const outlet = drillOf("arcangel", "Rebote + outlet");
    const calles = drillOf("arcangel", "3 calles");
    const movilidad = drillOf("arcangel", "Movilidad dinámica");
    const standardId = (n: number) => seedId("arcangel", `standard:${n}`);
    const principleId = (slug: string) => seedId("arcangel", `principle:${slug}`);
    const focusId = (slug: string) => seedId("arcangel", `focus:${slug}`);

    const sameDrills = [outlet.id, calles.id, movilidad.id];
    for (const table of [
      "drill_coaching_points",
      "drill_variants",
      "drill_focus_areas",
      "drill_principles",
      "drill_standards",
    ] as const) {
      const removed = await admin.from(table).delete().in("drill_id", sameDrills);
      expect(removed.error, table).toBeNull();
    }
    const point = (drill_id: string, sort: number, text: string, is_key: boolean) => ({
      id: randomUUID(),
      organization_id: org,
      drill_id,
      sort,
      text,
      is_key,
    });
    const variant = (drill_id: string, sort: number, title: string) => ({
      id: randomUUID(),
      organization_id: org,
      drill_id,
      sort,
      title,
    });
    const written = await Promise.all([
      admin.from("drill_coaching_points").insert([
        point(outlet.id, 0, "Punto editado", false),
        point(outlet.id, 1, "Otro punto editado", true),
        point(calles.id, 0, "Solo uno", true),
        point(movilidad.id, 0, "Solo uno", false),
      ]),
      admin.from("drill_variants").insert([
        variant(outlet.id, 0, "Variante editada"),
        variant(outlet.id, 1, "Otra"),
        variant(outlet.id, 2, "Una más"),
        variant(calles.id, 0, "Variante de más"),
      ]),
      admin.from("drill_focus_areas").insert([
        { organization_id: org, drill_id: outlet.id, focus_area_id: focusId("tiro") },
        { organization_id: org, drill_id: movilidad.id, focus_area_id: focusId("defensa") },
      ]),
      admin.from("drill_principles").insert([
        { organization_id: org, drill_id: outlet.id, principle_id: principleId("defensa") },
        { organization_id: org, drill_id: movilidad.id, principle_id: principleId("ataque") },
      ]),
      admin.from("drill_standards").insert([
        { organization_id: org, drill_id: outlet.id, standard_id: standardId(1) },
        { organization_id: org, drill_id: movilidad.id, standard_id: standardId(2) },
      ]),
    ]);
    for (const result of written) expect(result.error).toBeNull();

    await runSeed(now);

    for (const drillId of sameDrills) {
      const points = await admin
        .from("drill_coaching_points")
        .select("id, sort, text, is_key")
        .eq("drill_id", drillId)
        .order("sort");
      expect(points.error).toBeNull();
      expect(points.data).toEqual(
        data.drill_coaching_points
          .filter((p) => p.drill_id === drillId)
          .sort((a, b) => a.sort - b.sort)
          .map((p) => ({ id: p.id, sort: p.sort, text: p.text, is_key: p.is_key })),
      );

      const variants = await admin
        .from("drill_variants")
        .select("id, sort, title, description")
        .eq("drill_id", drillId)
        .order("sort");
      expect(variants.error).toBeNull();
      expect(variants.data).toEqual(
        data.drill_variants
          .filter((v) => v.drill_id === drillId)
          .sort((a, b) => a.sort - b.sort)
          .map((v) => ({ id: v.id, sort: v.sort, title: v.title, description: v.description })),
      );

      // Los vínculos: lo guardado es exactamente lo que el seed enlaza.
      const focus = await admin
        .from("drill_focus_areas")
        .select("focus_area_id")
        .eq("drill_id", drillId);
      expect(focus.error).toBeNull();
      expect((focus.data ?? []).map((l) => l.focus_area_id).sort()).toEqual(
        data.drill_focus_areas
          .filter((l) => l.drill_id === drillId)
          .map((l) => l.focus_area_id)
          .sort(),
      );
      const principles = await admin
        .from("drill_principles")
        .select("principle_id")
        .eq("drill_id", drillId);
      expect(principles.error).toBeNull();
      expect((principles.data ?? []).map((l) => l.principle_id).sort()).toEqual(
        data.drill_principles
          .filter((l) => l.drill_id === drillId)
          .map((l) => l.principle_id)
          .sort(),
      );
      const standards = await admin
        .from("drill_standards")
        .select("standard_id")
        .eq("drill_id", drillId);
      expect(standards.error).toBeNull();
      expect((standards.data ?? []).map((l) => l.standard_id).sort()).toEqual(
        data.drill_standards
          .filter((l) => l.drill_id === drillId)
          .map((l) => l.standard_id)
          .sort(),
      );
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
