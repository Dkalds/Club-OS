import { describe, expect, it } from "vitest";
import { ARCANGEL, buildSeedData, CLUB_DEMO, type ClubDef, type SeedData } from "./data";
import { seedSchedule } from "./dates";
import { seedId } from "./ids";

// Viernes 2 oct 2026, 12:00 en Madrid.
const NOW = new Date("2026-10-02T10:00:00Z");
const TZ = "Europe/Madrid";

const data = buildSeedData(NOW);
const schedule = seedSchedule(NOW, TZ);

function one<T>(rows: T[], matches: (row: T) => boolean, label: string): T {
  const found = rows.filter(matches);
  if (found.length !== 1) {
    throw new Error(`${label}: se esperaba 1 fila y hay ${found.length}`);
  }
  return found[0];
}

const orgId = (slug: string) =>
  one(data.organizations, (o) => o.slug === slug, `organización ${slug}`).id;

const teamId = (orgSlug: string, name: string) =>
  one(
    data.teams,
    (t) => t.organization_id === orgId(orgSlug) && t.name === name,
    `equipo ${name}`,
  ).id;

const personId = (orgSlug: string, first: string, last: string) =>
  one(
    data.people,
    (p) =>
      p.organization_id === orgId(orgSlug) && p.first_name === first && p.last_name === last,
    `persona ${first} ${last}`,
  ).id;

const eventsOf = (id: string) => data.events.filter((e) => e.team_id === id);

const planOfEvent = (eventId: string) =>
  one(data.practice_plans, (p) => p.event_id === eventId, `plan del evento ${eventId}`);

const itemsOf = (planId: string) =>
  data.practice_items.filter((i) => i.plan_id === planId).sort((a, b) => a.sort - b.sort);

const minutes = (planId: string) => itemsOf(planId).reduce((sum, i) => sum + i.minutes, 0);

const focusSlug = (focusId: string | null | undefined) =>
  focusId == null ? null : one(data.focus_areas, (f) => f.id === focusId, "foco").slug;

function eventAt(teamIdValue: string, startsAt: string) {
  return one(
    eventsOf(teamIdValue),
    (e) => e.starts_at === startsAt,
    `evento de ${teamIdValue} a las ${startsAt}`,
  );
}

describe("buildSeedData: números del brief", () => {
  it("hay dos organizaciones, ambas en Europe/Madrid", () => {
    expect(data.organizations).toHaveLength(2);
    expect(data.organizations.map((o) => o.slug).sort()).toEqual(["arcangel", "club-demo"]);
    expect(data.organizations.every((o) => o.timezone === TZ)).toBe(true);
    expect(data.organization_branding).toHaveLength(2);
  });

  it("Arcángel tiene 19 personas: 4 de dirección y cuerpo técnico, 12 de Alevín A, 3 de Benjamín A", () => {
    const arcangel = data.people.filter((p) => p.organization_id === orgId("arcangel"));
    expect(arcangel).toHaveLength(19);
    expect(data.people.filter((p) => p.organization_id === orgId("club-demo"))).toHaveLength(4);
  });

  it("Alevín A tiene 7 eventos: 2 próximos, 4 pasados y 1 partido", () => {
    const events = eventsOf(teamId("arcangel", "Alevín A"));
    expect(events).toHaveLength(7);
    expect(events.filter((e) => e.kind === "practice" && e.status === "scheduled")).toHaveLength(2);
    expect(events.filter((e) => e.kind === "practice" && e.status === "done")).toHaveLength(4);
    expect(events.filter((e) => e.kind === "game" && e.status === "scheduled")).toHaveLength(1);
  });

  it("hay 6 usuarios .test: 5 con membresía y persona, y sin.club@clubos.test sin ninguna", () => {
    expect(data.users).toHaveLength(6);
    expect(data.users.every((u) => u.email.endsWith(".test"))).toBe(true);
    expect(data.users.map((u) => u.email).sort()).toEqual([
      "alex@arcangel.test",
      "irene@arcangel.test",
      "marta@demo.test",
      "nora@arcangel.test",
      "raul@arcangel.test",
      "sin.club@clubos.test",
    ]);

    expect(data.memberships).toHaveLength(5);
    expect(data.memberships.map((m) => m.email)).not.toContain("sin.club@clubos.test");
    for (const membership of data.memberships) {
      expect(data.users.map((u) => u.email)).toContain(membership.email);
      expect(membership.person_id).toEqual(expect.any(String));
      const person = one(data.people, (p) => p.id === membership.person_id, membership.email);
      expect(person.organization_id).toBe(membership.organization_id);
    }
  });

  it("la primera sesión de Alevín A suma 75 min en 5 ítems", () => {
    const event = eventAt(teamId("arcangel", "Alevín A"), schedule.upcoming[0].startsAt);
    const plan = planOfEvent(event.id);
    expect(plan.title).toBe("Transición + rebote defensivo");
    expect(event.location).toBe("Pabellón 2");
    expect(focusSlug(plan.primary_focus_id)).toBe("transicion");
    expect(focusSlug(plan.secondary_focus_id)).toBe("rebote");
    expect(itemsOf(plan.id).map((i) => [i.phase, i.title_override, i.minutes])).toEqual([
      ["Activación", "Movilidad + rueda de pases", 10],
      ["Técnica", "3 calles", 15],
      ["Rebote", "Rebote + outlet", 15],
      ["Transición", "3x2 continuo", 20],
      ["Competición", "2x2 presión", 15],
    ]);
    expect(minutes(plan.id)).toBe(75);
  });

  it("la segunda sesión de Alevín A suma 75 min en 6 ítems", () => {
    const event = eventAt(teamId("arcangel", "Alevín A"), schedule.upcoming[1].startsAt);
    const plan = planOfEvent(event.id);
    expect(plan.title).toBe("Defensa presionante");
    expect(focusSlug(plan.primary_focus_id)).toBe("defensa");
    expect(focusSlug(plan.secondary_focus_id)).toBe("rebote");
    expect(itemsOf(plan.id).map((i) => i.minutes)).toEqual([10, 15, 15, 15, 10, 10]);
    expect(minutes(plan.id)).toBe(75);
  });

  it("la sesión de Benjamín A es de 17:00 a 18:00 locales el día de upcoming[0] y suma 60 min en 4 ítems", () => {
    // upcoming[0] = martes 6 oct; 17:00–18:00 en Madrid (UTC+2) = 15:00Z–16:00Z.
    const events = eventsOf(teamId("arcangel", "Benjamín A"));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("practice");
    expect(events[0].starts_at).toBe("2026-10-06T15:00:00.000Z");
    expect(events[0].ends_at).toBe("2026-10-06T16:00:00.000Z");
    const plan = planOfEvent(events[0].id);
    expect(plan.title).toBe("Bote y control");
    expect(itemsOf(plan.id)).toHaveLength(4);
    expect(minutes(plan.id)).toBe(60);
  });

  it("la sesión de Benjamín A sigue en las 17:00 locales tras el cambio de hora", () => {
    // Viernes 23 oct → martes 27 oct, ya UTC+1: 17:00 locales = 16:00Z.
    const later = buildSeedData(new Date("2026-10-23T10:00:00Z"));
    const benjamin = one(later.teams, (t) => t.name === "Benjamín A", "Benjamín A");
    const events = later.events.filter((e) => e.team_id === benjamin.id);
    expect(events).toHaveLength(1);
    expect(events[0].starts_at).toBe("2026-10-27T16:00:00.000Z");
    expect(events[0].ends_at).toBe("2026-10-27T17:00:00.000Z");
  });
});

describe("buildSeedData: contenido", () => {
  it("marca de Arcángel", () => {
    const branding = one(
      data.organization_branding,
      (b) => b.organization_id === orgId("arcangel"),
      "marca de Arcángel",
    );
    expect(branding).toEqual({
      organization_id: orgId("arcangel"),
      display_name: "Arcángel",
      wordmark_sub: "Basketball",
      short_name: "CBA",
      way_name: "The Arcángel Way",
      tagline: "One club. One identity. One way.",
      color_accent: "#c9a45c",
      color_accent_pressed: "#b38e48",
      color_on_accent: "#0a0a0b",
      color_accent_soft: "#2b2517",
      terminology: { way: "The Way", standards: "Arcángel Standards" },
    });
    expect(one(data.organizations, (o) => o.slug === "arcangel", "org").name).toBe("CB Arcángel");
  });

  it("marca de Club Demo", () => {
    const branding = one(
      data.organization_branding,
      (b) => b.organization_id === orgId("club-demo"),
      "marca de Club Demo",
    );
    expect(branding).toMatchObject({
      display_name: "Club Demo",
      wordmark_sub: "Baloncesto",
      short_name: "CDM",
      way_name: "The Demo Way",
      color_accent: "#3fb8af",
      color_accent_pressed: "#34998f",
      color_on_accent: "#0a0a0b",
      color_accent_soft: "#10282a",
      terminology: { way: "Nuestra forma" },
    });
  });

  it("los colores cumplen el CHECK de la base de datos (#rrggbb en minúsculas)", () => {
    for (const b of data.organization_branding) {
      for (const color of [
        b.color_accent,
        b.color_accent_pressed,
        b.color_on_accent,
        b.color_accent_soft,
      ]) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(b.short_name.length).toBeGreaterThanOrEqual(2);
      expect(b.short_name.length).toBeLessThanOrEqual(4);
    }
  });

  it("cada club tiene su temporada actual 2026/27", () => {
    for (const slug of ["arcangel", "club-demo"]) {
      const seasons = data.seasons.filter((s) => s.organization_id === orgId(slug));
      expect(seasons).toEqual([
        expect.objectContaining({
          name: "2026/27",
          starts_on: "2026-09-01",
          ends_on: "2027-06-30",
          is_current: true,
        }),
      ]);
    }
  });

  it("categorías y equipos", () => {
    const categories = (slug: string) =>
      data.categories
        .filter((c) => c.organization_id === orgId(slug))
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .map((c) => [c.name, c.age_band, c.sort]);
    expect(categories("arcangel")).toEqual([
      ["Benjamín", "U10", 10],
      ["Alevín", "U12", 20],
    ]);
    expect(categories("club-demo")).toEqual([["Infantil", "U14", expect.any(Number)]]);

    const teams = (slug: string) =>
      data.teams
        .filter((t) => t.organization_id === orgId(slug))
        .map((t) => t.name)
        .sort();
    expect(teams("arcangel")).toEqual(["Alevín A", "Benjamín A"]);
    expect(teams("club-demo")).toEqual(["Infantil A"]);
  });

  it("áreas de foco: técnica, transición, tiro, defensa, rebote, ataque", () => {
    for (const slug of ["arcangel", "club-demo"]) {
      const focus = data.focus_areas
        .filter((f) => f.organization_id === orgId(slug))
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .map((f) => [f.slug, f.name]);
      expect(focus).toEqual([
        ["tecnica", "Técnica"],
        ["transicion", "Transición"],
        ["tiro", "Tiro"],
        ["defensa", "Defensa"],
        ["rebote", "Rebote"],
        ["ataque", "Ataque"],
      ]);
    }
  });

  it("cuerpo técnico", () => {
    const staff = (slug: string, team: string) =>
      data.team_staff
        .filter((s) => s.team_id === teamId(slug, team))
        .map((s) => [s.person_id, s.staff_role])
        .sort();
    expect(staff("arcangel", "Alevín A")).toEqual(
      [
        [personId("arcangel", "Álex", "Prieto"), "head_coach"],
        [personId("arcangel", "Irene", "Soler"), "assistant"],
      ].sort(),
    );
    expect(staff("arcangel", "Benjamín A")).toEqual([
      [personId("arcangel", "Nora", "Gil"), "head_coach"],
    ]);
    expect(staff("club-demo", "Infantil A")).toEqual([
      [personId("club-demo", "Marta", "Ruiz"), "head_coach"],
    ]);
    // Raúl es admin y no entrena a ningún equipo.
    const raul = personId("arcangel", "Raúl", "Campos");
    expect(data.team_staff.some((s) => s.person_id === raul)).toBe(false);
  });

  it("cada usuario con club tiene el rol y la persona que le corresponden", () => {
    const byEmail = (email: string) =>
      one(data.memberships, (m) => m.email === email, email);
    expect(byEmail("raul@arcangel.test")).toMatchObject({
      organization_id: orgId("arcangel"),
      role: "admin",
      person_id: personId("arcangel", "Raúl", "Campos"),
    });
    expect(byEmail("alex@arcangel.test")).toMatchObject({
      organization_id: orgId("arcangel"),
      role: "coach",
      person_id: personId("arcangel", "Álex", "Prieto"),
    });
    expect(byEmail("irene@arcangel.test")).toMatchObject({
      organization_id: orgId("arcangel"),
      role: "coach",
      person_id: personId("arcangel", "Irene", "Soler"),
    });
    expect(byEmail("nora@arcangel.test")).toMatchObject({
      organization_id: orgId("arcangel"),
      role: "coach",
      person_id: personId("arcangel", "Nora", "Gil"),
    });
    expect(byEmail("marta@demo.test")).toMatchObject({
      organization_id: orgId("club-demo"),
      role: "coach",
      person_id: personId("club-demo", "Marta", "Ruiz"),
    });
    expect(data.memberships.every((m) => m.status === "active")).toBe(true);
  });

  it("plantilla de Alevín A (año 2015)", () => {
    const roster = data.team_players
      .filter((p) => p.team_id === teamId("arcangel", "Alevín A"))
      .map((p) => {
        const person = one(data.people, (x) => x.id === p.person_id, "jugador");
        return [p.jersey_number, person.first_name, person.last_name, p.position, person.birth_year];
      })
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    expect(roster).toEqual([
      [4, "Hugo", "Serrano", "Base", 2015],
      [5, "Saúl", "Méndez", "Escolta", 2015],
      [6, "Adrián", "Toledo", "Alero", 2015],
      [7, "Leo", "Ortega", "Base", 2015],
      [8, "Bruno", "Pardo", "Escolta", 2015],
      [9, "Marco", "Vidal", "Alero", 2015],
      [10, "Gael", "Ferrer", "Alero", 2015],
      [11, "Unai", "Robles", "Ala-pívot", 2015],
      [12, "Iker", "Navas", "Ala-pívot", 2015],
      [13, "Óscar", "Vega", "Pívot", 2015],
      [14, "Teo", "Marín", "Base", 2015],
      [15, "Pablo", "Rey", "Pívot", 2015],
    ]);
  });

  it("plantilla de Benjamín A (año 2017) y de Infantil A (año 2013)", () => {
    const roster = (slug: string, team: string) =>
      data.team_players
        .filter((p) => p.team_id === teamId(slug, team))
        .map((p) => {
          const person = one(data.people, (x) => x.id === p.person_id, "jugador");
          return [p.jersey_number, person.first_name, person.last_name, person.birth_year];
        })
        .sort((a, b) => Number(a[0]) - Number(b[0]));
    expect(roster("arcangel", "Benjamín A")).toEqual([
      [3, "Mario", "Ibáñez", 2017],
      [6, "Lucas", "Peña", 2017],
      [9, "Eric", "Soto", 2017],
    ]);
    const demo = roster("club-demo", "Infantil A");
    expect(demo).toHaveLength(3);
    expect(demo.every((row) => row[3] === 2013)).toBe(true);
  });

  it("los dorsales no se repiten dentro de un equipo", () => {
    const seen = new Set<string>();
    for (const p of data.team_players) {
      const key = `${p.team_id}:${p.jersey_number}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("sesiones pasadas de Alevín A: cuatro, del más reciente al más antiguo, en estado done", () => {
    const team = teamId("arcangel", "Alevín A");
    const titles = ["Tiro tras bote", "Pase y corte", "Contraataque 2x1", "Rebote ofensivo"];
    schedule.past.forEach((slot, index) => {
      const event = eventAt(team, slot.startsAt);
      expect(event).toMatchObject({ kind: "practice", status: "done", ends_at: slot.endsAt });
      const plan = planOfEvent(event.id);
      expect(plan).toMatchObject({ title: titles[index], status: "done", team_id: team });
    });
  });

  it("sesiones próximas: evento scheduled y plan ready, con las horas de seedSchedule", () => {
    const team = teamId("arcangel", "Alevín A");
    schedule.upcoming.forEach((slot) => {
      const event = eventAt(team, slot.startsAt);
      expect(event).toMatchObject({ kind: "practice", status: "scheduled", ends_at: slot.endsAt });
      expect(planOfEvent(event.id).status).toBe("ready");
    });
  });

  it("partido de Alevín A: vs CB Ribera, Liga Alevín, local, en el slot game", () => {
    const team = teamId("arcangel", "Alevín A");
    const event = eventAt(team, schedule.game.startsAt);
    expect(event).toMatchObject({ kind: "game", status: "scheduled", ends_at: schedule.game.endsAt });
    expect(data.games).toHaveLength(1);
    expect(data.games[0]).toMatchObject({
      event_id: event.id,
      organization_id: orgId("arcangel"),
      opponent_name: "CB Ribera",
      competition_name: "Liga Alevín",
      home_away: "home",
    });
    // Un partido no tiene plan de sesión.
    expect(data.practice_plans.some((p) => p.event_id === event.id)).toBe(false);
  });

  it("Club Demo: sesión «Defensa individual» en upcoming[0]", () => {
    const team = teamId("club-demo", "Infantil A");
    const events = eventsOf(team);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "practice",
      status: "scheduled",
      starts_at: schedule.upcoming[0].startsAt,
      ends_at: schedule.upcoming[0].endsAt,
    });
    const plan = planOfEvent(events[0].id);
    expect(plan).toMatchObject({ title: "Defensa individual", status: "ready", team_id: team });
    expect(itemsOf(plan.id).length).toBeGreaterThan(0);
  });
});

describe("buildSeedData: invariantes", () => {
  it("cada id es único en todo el seed", () => {
    const ids: string[] = [
      ...data.organizations.map((r) => r.id),
      ...data.people.map((r) => r.id),
      ...data.memberships.map((r) => r.id),
      ...data.seasons.map((r) => r.id),
      ...data.categories.map((r) => r.id),
      ...data.teams.map((r) => r.id),
      ...data.focus_areas.map((r) => r.id),
      ...data.events.map((r) => r.id),
      ...data.practice_plans.map((r) => r.id),
      ...data.practice_items.map((r) => r.id),
    ];
    expect(ids.length).toBeGreaterThan(80);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it("las claves compuestas no se repiten", () => {
    const keysOf = (rows: { team_id: string; person_id: string }[]) =>
      rows.map((r) => `${r.team_id}:${r.person_id}`);
    for (const rows of [data.team_staff, data.team_players]) {
      const keys = keysOf(rows);
      expect(new Set(keys).size).toBe(keys.length);
    }
    const memberships = data.memberships.map((m) => `${m.organization_id}:${m.email}`);
    expect(new Set(memberships).size).toBe(memberships.length);
    const plans = data.practice_plans.map((p) => p.event_id);
    expect(new Set(plans).size).toBe(plans.length);
    const slugs = data.focus_areas.map((f) => `${f.organization_id}:${f.slug}`);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("construir dos veces con el mismo now da exactamente lo mismo", () => {
    expect(buildSeedData(NOW)).toEqual(buildSeedData(new Date(NOW)));
    expect(JSON.stringify(buildSeedData(NOW))).toBe(JSON.stringify(data));
  });

  it("al cambiar now solo cambian las horas: los ids son los mismos, así que un reseed actualiza en vez de duplicar", () => {
    const later = buildSeedData(new Date("2026-10-10T08:00:00Z"));
    const idsOf = (d: SeedData) => ({
      events: d.events.map((e) => e.id),
      plans: d.practice_plans.map((p) => p.id),
      items: d.practice_items.map((i) => i.id),
      games: d.games.map((g) => g.event_id),
    });
    expect(idsOf(later)).toEqual(idsOf(data));
    expect(later.events.map((e) => e.starts_at)).not.toEqual(data.events.map((e) => e.starts_at));
  });

  it("R13: el equipo de un plan es siempre el de su evento", () => {
    const withEvent = data.practice_plans.filter((p) => p.event_id != null);
    expect(withEvent.length).toBe(data.practice_plans.length);
    for (const plan of withEvent) {
      const event = one(data.events, (e) => e.id === plan.event_id, "evento del plan");
      expect(plan.team_id).toBe(event.team_id);
      expect(plan.organization_id).toBe(event.organization_id);
    }
  });

  it("menores: ninguna persona lleva fecha de nacimiento completa, solo birth_year", () => {
    for (const person of data.people) {
      expect(Object.keys(person).sort()).toEqual(
        ["birth_year", "first_name", "id", "last_name", "organization_id"].sort(),
      );
      if (person.birth_year != null) {
        expect(Number.isInteger(person.birth_year)).toBe(true);
        expect(person.birth_year).toBeGreaterThanOrEqual(2000);
        expect(person.birth_year).toBeLessThanOrEqual(2020);
      }
    }
    // Ningún valor de texto del seed tiene forma de fecha completa de nacimiento.
    const dateLike = /\b(19|20)\d{2}-\d{2}-\d{2}\b/;
    for (const person of data.people) {
      expect(`${person.first_name} ${person.last_name}`).not.toMatch(dateLike);
    }
    // El staff adulto no publica ni el año.
    const staffIds = new Set(data.team_staff.map((s) => s.person_id));
    for (const m of data.memberships) staffIds.add(m.person_id);
    for (const person of data.people.filter((p) => staffIds.has(p.id))) {
      expect(person.birth_year).toBeNull();
    }
  });

  it("todas las filas de una tabla tienen las mismas columnas (el upsert por lotes no mezcla null y default)", () => {
    const tables: [string, object[]][] = [
      ["organizations", data.organizations],
      ["organization_branding", data.organization_branding],
      ["people", data.people],
      ["memberships", data.memberships],
      ["seasons", data.seasons],
      ["categories", data.categories],
      ["teams", data.teams],
      ["team_staff", data.team_staff],
      ["team_players", data.team_players],
      ["focus_areas", data.focus_areas],
      ["events", data.events],
      ["games", data.games],
      ["practice_plans", data.practice_plans],
      ["practice_items", data.practice_items],
    ];
    for (const [name, rows] of tables) {
      expect(rows.length, name).toBeGreaterThan(0);
      const first = Object.keys(rows[0]).sort();
      for (const row of rows) {
        expect(Object.keys(row).sort(), name).toEqual(first);
      }
    }
  });

  it("integridad referencial: cada clave foránea compuesta apunta a una fila del mismo club", () => {
    const has = <T extends { id: string; organization_id: string }>(
      rows: T[],
      org: string,
      id: string | null | undefined,
    ) => id == null || rows.some((r) => r.id === id && r.organization_id === org);

    for (const t of data.teams) {
      expect(has(data.seasons, t.organization_id, t.season_id), `team ${t.name} season`).toBe(true);
      expect(has(data.categories, t.organization_id, t.category_id), `team ${t.name} category`).toBe(
        true,
      );
    }
    for (const s of [...data.team_staff, ...data.team_players]) {
      expect(has(data.teams, s.organization_id, s.team_id)).toBe(true);
      expect(has(data.people, s.organization_id, s.person_id)).toBe(true);
    }
    for (const m of data.memberships) {
      expect(has(data.people, m.organization_id, m.person_id)).toBe(true);
      expect(data.organizations.some((o) => o.id === m.organization_id)).toBe(true);
    }
    for (const e of data.events) {
      expect(has(data.teams, e.organization_id, e.team_id)).toBe(true);
      expect(Date.parse(e.ends_at)).toBeGreaterThan(Date.parse(e.starts_at));
    }
    for (const g of data.games) {
      expect(has(data.events, g.organization_id, g.event_id)).toBe(true);
    }
    for (const p of data.practice_plans) {
      expect(has(data.teams, p.organization_id, p.team_id)).toBe(true);
      expect(has(data.events, p.organization_id, p.event_id)).toBe(true);
      expect(has(data.focus_areas, p.organization_id, p.primary_focus_id)).toBe(true);
      expect(has(data.focus_areas, p.organization_id, p.secondary_focus_id)).toBe(true);
    }
    for (const i of data.practice_items) {
      expect(has(data.practice_plans, i.organization_id, i.plan_id)).toBe(true);
    }
    for (const b of data.organization_branding) {
      expect(data.organizations.some((o) => o.id === b.organization_id)).toBe(true);
    }
  });

  it("los ítems de cada plan tienen posiciones 1..n sin huecos y minutos válidos", () => {
    for (const plan of data.practice_plans) {
      const items = itemsOf(plan.id);
      expect(items.length, plan.title).toBeGreaterThan(0);
      expect(items.map((i) => i.sort)).toEqual(items.map((_, index) => index + 1));
      for (const item of items) {
        expect(item.minutes).toBeGreaterThanOrEqual(1);
        expect(item.minutes).toBeLessThanOrEqual(120);
        expect(item.title_override).toEqual(expect.any(String));
        expect(item.phase).toEqual(expect.any(String));
      }
    }
  });

  it("cada club tiene sus propios planes: ningún plan ni ítem cruza de club", () => {
    for (const item of data.practice_items) {
      const plan = one(data.practice_plans, (p) => p.id === item.plan_id, "plan del ítem");
      expect(item.organization_id).toBe(plan.organization_id);
    }
  });

  it("los ids salen de seedId(orgSlug, key): determinista y distinto por club", () => {
    expect(seedId("arcangel", "organization")).toBe(seedId("arcangel", "organization"));
    expect(seedId("arcangel", "organization")).not.toBe(seedId("club-demo", "organization"));
    expect(seedId("arcangel", "a")).not.toBe(seedId("arcangel", "b"));
    expect(orgId("arcangel")).toBe(seedId("arcangel", "organization"));
    expect(orgId("club-demo")).toBe(seedId("club-demo", "organization"));
  });
});

describe("fixtures exportados (contrato entre fases)", () => {
  it("ARCANGEL y CLUB_DEMO se exportan por nombre, con sus slugs", () => {
    expect(ARCANGEL.slug).toBe("arcangel");
    expect(CLUB_DEMO.slug).toBe("club-demo");
  });

  it("buildSeedData sigue las organizaciones en el orden [ARCANGEL, CLUB_DEMO]", () => {
    expect(data.organizations.map((o) => o.slug)).toEqual([ARCANGEL.slug, CLUB_DEMO.slug]);
    expect(data.organization_branding.map((b) => b.organization_id)).toEqual(
      data.organizations.map((o) => o.id),
    );
  });

  it.each([
    ["ARCANGEL", ARCANGEL],
    ["CLUB_DEMO", CLUB_DEMO],
  ] as [string, ClubDef][])("la salida de buildSeedData es la que describe %s", (_name, club) => {
    const id = orgId(club.slug);
    expect(one(data.organizations, (o) => o.id === id, club.slug)).toMatchObject({
      name: club.name,
      timezone: club.timezone,
    });
    expect(one(data.organization_branding, (b) => b.organization_id === id, club.slug)).toEqual({
      organization_id: id,
      ...club.branding,
    });
    expect(
      data.teams
        .filter((t) => t.organization_id === id)
        .map((t) => t.name)
        .sort(),
    ).toEqual(club.teams.map((t) => t.name).sort());
    expect(
      data.categories
        .filter((c) => c.organization_id === id)
        .map((c) => c.name)
        .sort(),
    ).toEqual(club.categories.map((c) => c.name).sort());
    const players = club.teams.reduce((sum, team) => sum + team.players.length, 0);
    expect(data.people.filter((p) => p.organization_id === id)).toHaveLength(
      club.staff.length + players,
    );
    expect(
      data.memberships.filter((m) => m.organization_id === id).map((m) => m.email),
    ).toEqual(club.members.map((m) => m.email));
  });
});
