import { describe, expect, it } from "vitest";
import { ARCANGEL, buildSeedData, CLUB_DEMO, type ClubDef, type SeedData } from "./data";
import { seedSchedule } from "./dates";
import { ARCANGEL_DRILLS, DEMO_DRILLS } from "./drills";
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

  it("Alevín A tiene 9 eventos: 3 programados, 4 pasados, 1 cancelado y 1 partido", () => {
    const events = eventsOf(teamId("arcangel", "Alevín A"));
    expect(events).toHaveLength(9);
    expect(events.filter((e) => e.kind === "practice" && e.status === "scheduled")).toHaveLength(3);
    expect(events.filter((e) => e.kind === "practice" && e.status === "done")).toHaveLength(4);
    expect(events.filter((e) => e.kind === "practice" && e.status === "cancelled")).toHaveLength(1);
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

  it("la sesión cancelada de Alevín A cae el día de upcoming[1], de 16:30 a 17:30 locales, y suma 45 min en 2 ítems", () => {
    // upcoming[1] = jueves 8 oct; 16:30–17:30 en Madrid (UTC+2) = 14:30Z–15:30Z.
    const event = eventAt(teamId("arcangel", "Alevín A"), "2026-10-08T14:30:00.000Z");
    expect(event).toMatchObject({
      kind: "practice",
      status: "cancelled",
      ends_at: "2026-10-08T15:30:00.000Z",
      location: "Pabellón 2",
    });
    const plan = planOfEvent(event.id);
    expect(plan).toMatchObject({
      title: "Tiro libre y finalizaciones",
      status: "ready",
      team_id: event.team_id,
      secondary_focus_id: null,
    });
    expect(focusSlug(plan.primary_focus_id)).toBe("tiro");
    expect(itemsOf(plan.id).map((i) => [i.phase, i.title_override, i.minutes])).toEqual([
      ["Tiro", "Rueda de tiros libres", 20],
      ["Técnica", "Finalizaciones 1x0", 25],
    ]);
    expect(minutes(plan.id)).toBe(45);
    // Los ids salen de la posición (`cancelled-0`), no de la fecha: un nuevo seed la mueve.
    expect(event.id).toBe(seedId("arcangel", "event:alevin-a:cancelled-0"));
    expect(plan.id).toBe(seedId("arcangel", "plan:alevin-a:cancelled-0"));
  });

  it("la sesión cancelada sigue en las 16:30 locales tras el cambio de hora", () => {
    // Viernes 23 oct → jueves 29 oct, ya UTC+1: 16:30 locales = 15:30Z.
    const later = buildSeedData(new Date("2026-10-23T10:00:00Z"));
    const alevin = one(later.teams, (t) => t.name === "Alevín A", "Alevín A");
    const cancelled = later.events.filter(
      (e) => e.team_id === alevin.id && e.status === "cancelled",
    );
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].starts_at).toBe("2026-10-29T15:30:00.000Z");
    expect(cancelled[0].ends_at).toBe("2026-10-29T16:30:00.000Z");
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

describe("buildSeedData: metodología", () => {
  // `sort` es opcional en los tipos de inserción (la columna tiene valor por defecto).
  const bySort = (a: { sort?: number }, b: { sort?: number }) => (a.sort ?? 0) - (b.sort ?? 0);
  const sectionsOf = (slug: string) =>
    data.way_sections.filter((s) => s.organization_id === orgId(slug)).sort(bySort);
  const valuesOf = (slug: string) =>
    data.club_values.filter((v) => v.organization_id === orgId(slug)).sort(bySort);
  const principlesOf = (slug: string) =>
    data.game_principles.filter((p) => p.organization_id === orgId(slug)).sort(bySort);
  const standardsOf = (slug: string) =>
    data.standards.filter((s) => s.organization_id === orgId(slug)).sort(bySort);
  const pointsOf = (principleId: string) =>
    data.principle_points.filter((p) => p.principle_id === principleId).sort(bySort);

  it("secciones de Arcángel: cinco, numeradas por posición, con su tipo y su resumen", () => {
    expect(
      sectionsOf("arcangel").map((s) => [s.number, s.sort, s.slug, s.title, s.content_kind, s.summary]),
    ).toEqual([
      [1, 1, "nuestra-cultura", "Nuestra cultura", "values", "Lo que nos une dentro y fuera de la pista."],
      [2, 2, "el-jugador-arcangel", "El jugador Arcángel", "text", "Qué esperamos de cada jugador."],
      [3, 3, "como-jugamos", "Cómo jugamos", "principles", "Nuestros principios de juego."],
      [4, 4, "como-entrenamos", "Cómo entrenamos", "text", "Cómo son nuestras sesiones."],
      [5, 5, "como-competimos", "Cómo competimos", "standards", "Lo que exigimos en cada partido."],
    ]);
  });

  it("cuerpos de Arcángel: Markdown con negrita, h3 y lista; el resto sin cuerpo", () => {
    const bodies = Object.fromEntries(sectionsOf("arcangel").map((s) => [s.slug, s.body_md]));
    expect(bodies).toEqual({
      "nuestra-cultura": "",
      "el-jugador-arcangel": [
        "Queremos jugadores que **compiten**, **aprenden** y **ayudan** al equipo.",
        "",
        "### Lo que esperamos",
        "",
        "- Llega puntual.",
        "- Escucha y lo vuelve a intentar.",
        "- Anima desde el banquillo.",
      ].join("\n"),
      "como-jugamos": "",
      "como-entrenamos": [
        "Entrenamos como competimos: **intensidad** y pocas paradas.",
        "",
        "### Una sesión tipo",
        "",
        "1. Activación.",
        "2. Técnica.",
        "3. Táctica.",
        "4. Competición.",
      ].join("\n"),
      "como-competimos": "",
    });
  });

  it("valores de Arcángel: tres, sin título", () => {
    expect(valuesOf("arcangel").map((v) => [v.sort, v.code, v.title, v.description])).toEqual([
      [1, "TEAM FIRST", null, "El equipo está por delante del individuo."],
      [2, "EFFORT", null, "El esfuerzo no es negociable."],
      [3, "RESPECT", null, "Respeto a compañeros, entrenadores, rivales, árbitros y mesa."],
    ]);
  });

  it("principios de Arcángel: cuatro, con los puntos de Transición y Ataque", () => {
    const principles = principlesOf("arcangel");
    expect(principles.map((p) => [p.sort, p.slug, p.title, p.summary])).toEqual([
      [1, "defensa", "Defensa", "Defensa arriba y presionante."],
      [2, "transicion", "Transición", "Nuestra primera opción es correr."],
      [3, "rebote", "Rebote", "La posesión defensiva termina cuando controlamos el balón."],
      [4, "ataque", "Ataque", null],
    ]);
    const points = Object.fromEntries(
      principles.map((p) => [p.slug, pointsOf(p.id).map((point) => [point.sort, point.text])]),
    );
    expect(points).toEqual({
      defensa: [],
      transicion: [[1, "El balón busca al jugador más adelantado."]],
      rebote: [],
      ataque: [
        [1, "Espacios"],
        [2, "Pase"],
        [3, "1x1"],
        [4, "2x2"],
        [5, "Pasar y cortar"],
        [6, "Toma de decisiones"],
      ],
    });
  });

  it("Standards de Arcángel: cinco, numerados por posición", () => {
    expect(standardsOf("arcangel").map((s) => [s.number, s.sort, s.title, s.description])).toEqual([
      [1, 1, "TEAM FIRST", "Celebramos el pase extra y la ayuda."],
      [2, 2, "EFFORT IS NON-NEGOTIABLE", "En cada posesión, en cada ejercicio."],
      [3, 3, "FINISH THE POSSESSION", "La defensa acaba cuando cogemos el rebote."],
      [4, 4, "FIRST LOOK FORWARD", "Al recuperar, la primera mirada va hacia delante."],
      [5, 5, "RUN WIDE", "En transición corremos por las calles laterales."],
    ]);
  });

  it("Club Demo: dos secciones y dos Standards, sin valores ni principios", () => {
    expect(
      sectionsOf("club-demo").map((s) => [s.number, s.slug, s.title, s.content_kind, s.summary, s.body_md]),
    ).toEqual([
      [
        1,
        "quienes-somos",
        "Quiénes somos",
        "text",
        "Nuestra manera de entender el baloncesto.",
        "Somos un club de barrio que **forma personas**.",
      ],
      [2, "nuestros-standards", "Nuestros Standards", "standards", null, ""],
    ]);
    expect(standardsOf("club-demo").map((s) => [s.number, s.title, s.description])).toEqual([
      [1, "DEFENDER JUNTOS", "Nadie defiende solo."],
      [2, "COMPARTIR EL BALÓN", "El mejor tiro es el del compañero liberado."],
    ]);
    expect(valuesOf("club-demo")).toEqual([]);
    expect(principlesOf("club-demo")).toEqual([]);
    expect(
      data.principle_points.filter((p) => p.organization_id === orgId("club-demo")),
    ).toEqual([]);
  });

  it("todo el contenido está publicado", () => {
    for (const rows of [data.way_sections, data.club_values, data.game_principles, data.standards]) {
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.status === "published")).toBe(true);
    }
  });

  it("los ids salen de seedId con la clave de cada fila", () => {
    const section = sectionsOf("arcangel")[2];
    expect(section.id).toBe(seedId("arcangel", "way:como-jugamos"));
    expect(valuesOf("arcangel")[0].id).toBe(seedId("arcangel", "value:TEAM FIRST"));
    const ataque = principlesOf("arcangel")[3];
    expect(ataque.id).toBe(seedId("arcangel", "principle:ataque"));
    expect(pointsOf(ataque.id).map((p) => p.id)).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => seedId("arcangel", `point:ataque:${n}`)),
    );
    expect(standardsOf("club-demo")[1].id).toBe(seedId("club-demo", "standard:2"));
  });

  it("cumple los CHECK de la base de datos", () => {
    const slug = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const s of data.way_sections) {
      expect(s.slug, s.title).toMatch(slug);
      expect(s.slug.length).toBeLessThanOrEqual(60);
      expect(s.slug).not.toBe("standards");
      expect(s.title.length).toBeGreaterThanOrEqual(1);
      expect(s.title.length).toBeLessThanOrEqual(80);
      expect((s.summary ?? "").length).toBeLessThanOrEqual(200);
      expect((s.body_md ?? "").length).toBeLessThanOrEqual(20000);
      expect(s.number).toBeGreaterThanOrEqual(1);
      expect(s.number).toBeLessThanOrEqual(99);
      expect(["text", "values", "principles", "standards"]).toContain(s.content_kind);
    }
    for (const v of data.club_values) {
      expect(v.code.length).toBeGreaterThanOrEqual(1);
      expect(v.code.length).toBeLessThanOrEqual(40);
      expect((v.title ?? "").length).toBeLessThanOrEqual(80);
      expect(v.description.length).toBeGreaterThanOrEqual(1);
      expect(v.description.length).toBeLessThanOrEqual(500);
    }
    for (const p of data.game_principles) {
      expect(p.slug).toMatch(slug);
      expect(p.title.length).toBeLessThanOrEqual(80);
      expect((p.summary ?? "").length).toBeLessThanOrEqual(300);
    }
    for (const point of data.principle_points) {
      expect(point.text.length).toBeGreaterThanOrEqual(1);
      expect(point.text.length).toBeLessThanOrEqual(200);
    }
    for (const s of data.standards) {
      expect(s.number).toBeGreaterThanOrEqual(1);
      expect(s.number).toBeLessThanOrEqual(99);
      expect(s.title.length).toBeLessThanOrEqual(80);
      expect(s.description.length).toBeGreaterThanOrEqual(1);
      expect(s.description.length).toBeLessThanOrEqual(500);
    }
  });

  it("los únicos de la base de datos no se repiten: slug y número por club", () => {
    const unique = (keys: string[]) => expect(new Set(keys).size).toBe(keys.length);
    unique(data.way_sections.map((s) => `${s.organization_id}:${s.slug}`));
    unique(data.game_principles.map((p) => `${p.organization_id}:${p.slug}`));
    unique(data.standards.map((s) => `${s.organization_id}:${s.number}`));
  });

  it("los fixtures exportados llevan su metodología (contrato entre fases)", () => {
    expect(ARCANGEL.methodology.sections).toHaveLength(5);
    expect(ARCANGEL.methodology.values).toHaveLength(3);
    expect(ARCANGEL.methodology.principles).toHaveLength(4);
    expect(ARCANGEL.methodology.standards).toHaveLength(5);
    expect(CLUB_DEMO.methodology.sections).toHaveLength(2);
    expect(CLUB_DEMO.methodology.standards).toHaveLength(2);
    expect(CLUB_DEMO.methodology.values).toEqual([]);
    expect(CLUB_DEMO.methodology.principles).toEqual([]);
  });
});

describe("buildSeedData: biblioteca de ejercicios", () => {
  const drillsOf = (slug: string) => data.drills.filter((d) => d.organization_id === orgId(slug));
  const drillOf = (slug: string, title: string) =>
    one(drillsOf(slug), (d) => d.title === title, `ejercicio ${title} de ${slug}`);
  const childrenOf = <T extends { drill_id: string }>(rows: T[], drillIdValue: string) =>
    rows.filter((row) => row.drill_id === drillIdValue);
  const bySort = (a: { sort: number }, b: { sort: number }) => a.sort - b.sort;

  it("Arcángel tiene 21 ejercicios y Club Demo 2", () => {
    expect(drillsOf("arcangel")).toHaveLength(21);
    expect(drillsOf("club-demo")).toHaveLength(2);
    expect(data.drills).toHaveLength(23);
  });

  it("los fixtures llevan sus ejercicios (contrato entre fases)", () => {
    expect(ARCANGEL.drills).toBe(ARCANGEL_DRILLS);
    expect(CLUB_DEMO.drills).toBe(DEMO_DRILLS);
  });

  it("estado y autor: un borrador de Irene en Arcángel; el resto, publicado", () => {
    const states = drillsOf("arcangel").map((d) => [d.title, d.status, d.author_email]);
    expect(states.filter(([, status]) => status === "draft")).toEqual([
      ["Bloqueo de rebote", "draft", "irene@arcangel.test"],
    ]);
    const published = states.filter(([, status]) => status === "published");
    expect(published).toHaveLength(20);
    expect(published.every(([, , email]) => email === "raul@arcangel.test")).toBe(true);
    expect(drillsOf("club-demo").map((d) => [d.title, d.status, d.author_email])).toEqual([
      ["Defensa individual", "published", "marta@demo.test"],
      ["Tiro en carrera", "published", "marta@demo.test"],
    ]);
  });

  it("el autor es miembro de su club y tiene cuenta en el seed", () => {
    for (const drill of data.drills) {
      expect(
        data.memberships.some(
          (m) => m.organization_id === drill.organization_id && m.email === drill.author_email,
        ),
        drill.title,
      ).toBe(true);
      expect(data.users.map((u) => u.email)).toContain(drill.author_email);
    }
  });

  it("los ids salen de seedId con la clave del título; los puntos y las variantes, de su posición", () => {
    const outlet = drillOf("arcangel", "Rebote + outlet");
    expect(outlet.id).toBe(seedId("arcangel", "drill:rebote-outlet"));
    expect(drillOf("arcangel", "Bloqueo de rebote").id).toBe(
      seedId("arcangel", "drill:bloqueo-de-rebote"),
    );
    expect(drillOf("club-demo", "Defensa individual").id).toBe(
      seedId("club-demo", "drill:defensa-individual"),
    );
    expect(
      childrenOf(data.drill_coaching_points, outlet.id)
        .sort(bySort)
        .map((p) => p.id),
    ).toEqual([0, 1, 2, 3, 4].map((i) => seedId("arcangel", `drill:rebote-outlet:point:${i}`)));
    expect(
      childrenOf(data.drill_variants, outlet.id)
        .sort(bySort)
        .map((v) => v.id),
    ).toEqual([
      seedId("arcangel", "drill:rebote-outlet:variant:0"),
      seedId("arcangel", "drill:rebote-outlet:variant:1"),
    ]);
  });

  it("«Rebote + outlet» completo: Standards 3, 4 y 5, 5 puntos con 3 clave, 2 variantes, material y edad", () => {
    const outlet = drillOf("arcangel", "Rebote + outlet");
    expect(outlet).toMatchObject({
      organization_id: orgId("arcangel"),
      title: "Rebote + outlet",
      min_age: 12,
      max_age: null,
      min_players: 6,
      max_players: 12,
      min_minutes: 10,
      max_minutes: 15,
      equipment: ["Balones", "Conos", "Petos"],
      diagram_media_id: null,
      video_url: null,
      status: "published",
    });
    const ids = (keys: string[]) => keys.map((key) => seedId("arcangel", key)).sort();
    expect(
      childrenOf(data.drill_standards, outlet.id)
        .map((l) => l.standard_id)
        .sort(),
    ).toEqual(ids(["standard:3", "standard:4", "standard:5"]));
    expect(
      childrenOf(data.drill_focus_areas, outlet.id)
        .map((l) => l.focus_area_id)
        .sort(),
    ).toEqual(ids(["focus:rebote", "focus:transicion"]));
    expect(
      childrenOf(data.drill_principles, outlet.id)
        .map((l) => l.principle_id)
        .sort(),
    ).toEqual(ids(["principle:rebote", "principle:transicion"]));
    expect(
      childrenOf(data.drill_coaching_points, outlet.id)
        .sort(bySort)
        .map((p) => [p.sort, p.text, p.is_key]),
    ).toEqual([
      [0, "Rebote con dos manos", true],
      [1, "Primera mirada hacia delante", true],
      [2, "Outlet rápido", true],
      [3, "Abrir carriles", false],
      [4, "Correr", false],
    ]);
    expect(
      childrenOf(data.drill_variants, outlet.id)
        .sort(bySort)
        .map((v) => [v.sort, v.title]),
    ).toEqual([
      [0, "Con defensor en el outlet"],
      [1, "Tras tiro libre"],
    ]);
  });

  it("las posiciones de puntos y variantes de cada ejercicio son 0..n-1, sin huecos ni repetidas", () => {
    const sortsOf = (rows: { drill_id: string; sort: number }[], drillIdValue: string) =>
      rows
        .filter((row) => row.drill_id === drillIdValue)
        .map((row) => row.sort)
        .sort((a, b) => a - b);
    for (const drill of data.drills) {
      for (const rows of [data.drill_coaching_points, data.drill_variants]) {
        const sorts = sortsOf(rows, drill.id);
        expect(sorts, drill.title).toEqual(sorts.map((_, index) => index));
      }
      expect(
        childrenOf(data.drill_coaching_points, drill.id).length,
        drill.title,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("los recuentos de hijos y vínculos son los de las listas", () => {
    const all = [...ARCANGEL_DRILLS, ...DEMO_DRILLS];
    const sum = (count: (drill: (typeof all)[number]) => number) =>
      all.reduce((total, drill) => total + count(drill), 0);
    expect(data.drill_coaching_points).toHaveLength(sum((d) => d.points.length));
    expect(data.drill_variants).toHaveLength(sum((d) => (d.variants ?? []).length));
    expect(data.drill_focus_areas).toHaveLength(sum((d) => d.focus.length));
    expect(data.drill_principles).toHaveLength(sum((d) => d.principles.length));
    expect(data.drill_standards).toHaveLength(sum((d) => d.standards.length));
    // «Rebote + outlet» (2), «2x2 presión» (1) y «4x4 transición» (1).
    expect(data.drill_variants).toHaveLength(4);
  });

  it("Club Demo no enlaza principios, y sus vínculos son de sus propios focos y Standards", () => {
    expect(data.drill_principles.filter((l) => l.organization_id === orgId("club-demo"))).toEqual(
      [],
    );
    const defensa = drillOf("club-demo", "Defensa individual");
    expect(childrenOf(data.drill_standards, defensa.id).map((l) => l.standard_id)).toEqual([
      seedId("club-demo", "standard:1"),
    ]);
    expect(childrenOf(data.drill_focus_areas, defensa.id).map((l) => l.focus_area_id)).toEqual([
      seedId("club-demo", "focus:defensa"),
    ]);
  });

  it("un ítem cuyo título es el de un ejercicio de su club lleva su drill_id; el resto, null", () => {
    for (const item of data.practice_items) {
      const slug = data.organizations.find((o) => o.id === item.organization_id)?.slug ?? "";
      const drill = drillsOf(slug).find((d) => d.title === item.title_override);
      expect(item.drill_id, `${slug}: ${item.title_override}`).toBe(drill?.id ?? null);
    }
  });

  it("los 5 ítems de «Transición + rebote defensivo» apuntan a los ejercicios 6, 2, 1, 3 y 4", () => {
    const plan = one(
      data.practice_plans,
      (p) => p.title === "Transición + rebote defensivo",
      "plan de la primera sesión",
    );
    const items = data.practice_items.filter((i) => i.plan_id === plan.id).sort(bySort);
    // El título del ítem no cambia: `drill_id` se suma a `title_override`, no lo sustituye.
    expect(items.map((i) => [i.title_override, i.drill_id])).toEqual(
      ["Movilidad + rueda de pases", "3 calles", "Rebote + outlet", "3x2 continuo", "2x2 presión"].map(
        (title) => [title, drillOf("arcangel", title).id],
      ),
    );
  });

  it("tres de los seis ítems de «Defensa presionante» apuntan a los ejercicios que suma la Fase 4", () => {
    const plan = one(
      data.practice_plans,
      (p) => p.title === "Defensa presionante",
      "plan de la segunda sesión",
    );
    const items = data.practice_items.filter((i) => i.plan_id === plan.id).sort(bySort);
    expect(items.map((i) => i.title_override)).toEqual([
      "Juegos de pies y reacción",
      "Deslizamientos defensivos",
      "Ayuda y recuperación 3x3",
      "Presión al balón en medio campo",
      "Bloqueo y rebote 3x3",
      "4x4 con puntos por parada",
    ]);
    // Solo enlazan los que se llaman igual que un ejercicio de la biblioteca, y el título no se toca.
    expect(items.map((i) => i.drill_id)).toEqual([
      null,
      null,
      drillOf("arcangel", "Ayuda y recuperación 3x3").id,
      drillOf("arcangel", "Presión al balón en medio campo").id,
      drillOf("arcangel", "Bloqueo y rebote 3x3").id,
      null,
    ]);
  });

  it("los ítems enlazados de todo el seed son los cinco de la primera sesión y los tres de «Defensa presionante»", () => {
    expect(data.practice_items.filter((i) => i.drill_id !== null)).toHaveLength(8);
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
      ...data.way_sections.map((r) => r.id),
      ...data.club_values.map((r) => r.id),
      ...data.game_principles.map((r) => r.id),
      ...data.principle_points.map((r) => r.id),
      ...data.standards.map((r) => r.id),
      ...data.drills.map((r) => r.id),
      ...data.drill_coaching_points.map((r) => r.id),
      ...data.drill_variants.map((r) => r.id),
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
      ["way_sections", data.way_sections],
      ["club_values", data.club_values],
      ["game_principles", data.game_principles],
      ["principle_points", data.principle_points],
      ["standards", data.standards],
      ["drills", data.drills],
      ["drill_coaching_points", data.drill_coaching_points],
      ["drill_variants", data.drill_variants],
      ["drill_focus_areas", data.drill_focus_areas],
      ["drill_principles", data.drill_principles],
      ["drill_standards", data.drill_standards],
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
      expect(has(data.drills, i.organization_id, i.drill_id)).toBe(true);
    }
    for (const b of data.organization_branding) {
      expect(data.organizations.some((o) => o.id === b.organization_id)).toBe(true);
    }
    for (const row of [
      ...data.way_sections,
      ...data.club_values,
      ...data.game_principles,
      ...data.standards,
    ]) {
      expect(data.organizations.some((o) => o.id === row.organization_id)).toBe(true);
    }
    for (const point of data.principle_points) {
      expect(has(data.game_principles, point.organization_id, point.principle_id)).toBe(true);
    }
    for (const drill of data.drills) {
      expect(data.organizations.some((o) => o.id === drill.organization_id)).toBe(true);
    }
    for (const child of [
      ...data.drill_coaching_points,
      ...data.drill_variants,
      ...data.drill_focus_areas,
      ...data.drill_principles,
      ...data.drill_standards,
    ]) {
      expect(has(data.drills, child.organization_id, child.drill_id)).toBe(true);
    }
    for (const link of data.drill_focus_areas) {
      expect(has(data.focus_areas, link.organization_id, link.focus_area_id)).toBe(true);
    }
    for (const link of data.drill_principles) {
      expect(has(data.game_principles, link.organization_id, link.principle_id)).toBe(true);
    }
    for (const link of data.drill_standards) {
      expect(has(data.standards, link.organization_id, link.standard_id)).toBe(true);
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
