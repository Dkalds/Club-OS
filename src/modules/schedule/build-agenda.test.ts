import { describe, expect, it } from "vitest";
import { buildAgenda } from "./build-agenda";
import type { AgendaEvent } from "./types";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TZ = "Europe/Madrid";
/** Miércoles 7 oct 2026, 12:00 en Madrid (CEST, UTC+2). */
const NOW = "2026-10-07T10:00:00.000Z";

const TEAM_A = { id: "team-a", name: "Equipo A" };
const TEAM_B = { id: "team-b", name: "Equipo B" };

function practice(id: string, startsAt: string, overrides: Partial<AgendaEvent> = {}): AgendaEvent {
  return {
    id,
    teamId: TEAM_A.id,
    kind: "practice",
    status: "scheduled",
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 75 * 60_000).toISOString(),
    location: "Pabellón 2",
    plan: { title: "Salida de presión", itemMinutes: [10, 20, 15] },
    game: null,
    ...overrides,
  };
}

function game(id: string, startsAt: string, overrides: Partial<AgendaEvent> = {}): AgendaEvent {
  return {
    id,
    teamId: TEAM_A.id,
    kind: "game",
    status: "scheduled",
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 90 * 60_000).toISOString(),
    location: null,
    plan: null,
    game: { opponent: "Rival C", competition: "Liga", homeAway: "home", score: null },
    ...overrides,
  };
}

function build(
  events: AgendaEvent[],
  options: Partial<Parameters<typeof buildAgenda>[2]> = {},
  teams = [TEAM_A],
) {
  return buildAgenda(events, teams, { scope: "upcoming", nowIso: NOW, tz: TZ, clubSlug: "club-a", ...options });
}

const labels = (weeks: ReturnType<typeof build>) => weeks.map((week) => week.label);
const ids = (weeks: ReturnType<typeof build>) => weeks.map((week) => week.items.map((item) => item.eventId));

describe("buildAgenda · semanas", () => {
  it("agrupa de lunes a domingo en la zona del club y nombra cada semana", () => {
    const weeks = build([
      practice("jue", "2026-10-08T16:00:00Z"), // jueves 8, esta semana
      game("dom", "2026-10-11T09:00:00Z"), // domingo 11, esta semana
      practice("lun", "2026-10-12T16:00:00Z"), // lunes 12, la que viene
      practice("lejos", "2026-10-22T16:00:00Z"), // jueves 22: semana del 19
    ]);

    expect(labels(weeks)).toEqual(["Esta semana", "Semana que viene", "Semana del 19 oct"]);
    expect(ids(weeks)).toEqual([["jue", "dom"], ["lun"], ["lejos"]]);
  });

  it("el domingo por la noche es de esta semana y el lunes de madrugada, de la siguiente", () => {
    const weeks = build([
      practice("dom-noche", "2026-10-11T21:30:00Z"), // domingo 11, 23:30 en Madrid
      practice("lun-madrugada", "2026-10-11T22:30:00Z"), // lunes 12, 00:30 en Madrid
    ]);

    expect(ids(weeks)).toEqual([["dom-noche"], ["lun-madrugada"]]);
  });

  it("la semana se cuenta en la zona del club, no en UTC ni en la del proceso", () => {
    // Lunes 12 a las 01:00 en Madrid es domingo 11 a las 23:00 UTC.
    const event = practice("limite", "2026-10-11T23:00:00Z");

    expect(labels(build([event]))).toEqual(["Semana que viene"]);
    // En una zona ocho horas por detrás sigue siendo domingo 11: esta semana.
    expect(labels(build([event], { tz: "America/Mexico_City" }))).toEqual(["Esta semana"]);
  });

  it("la semana del cambio de hora (domingo 25 oct 2026) sigue siendo de siete días de calendario", () => {
    const now = "2026-10-21T10:00:00.000Z"; // miércoles 21
    const weeks = build(
      [
        practice("dom-25", "2026-10-25T17:00:00Z"), // domingo 25, 18:00 en Madrid (ya CET)
        practice("lun-26", "2026-10-25T23:30:00Z"), // lunes 26, 00:30 en Madrid (CET)
      ],
      { nowIso: now },
    );

    expect(labels(weeks)).toEqual(["Esta semana", "Semana que viene"]);
    expect(ids(weeks)).toEqual([["dom-25"], ["lun-26"]]);
  });

  it("la clave de cada semana es su lunes a las 00:00 del club, en ISO", () => {
    const [week] = build([practice("jue", "2026-10-08T16:00:00Z")]);

    // Lunes 5 oct, 00:00 en Madrid (UTC+2).
    expect(week?.key).toBe("2026-10-04T22:00:00.000Z");
  });

  it("sin eventos no hay semanas", () => {
    expect(build([])).toEqual([]);
  });
});

describe("buildAgenda · orden", () => {
  it("lo que viene, del más próximo al más lejano, llegue como llegue", () => {
    const weeks = build([
      practice("c", "2026-10-09T16:00:00Z"),
      practice("a", "2026-10-07T16:00:00Z"),
      practice("b", "2026-10-08T16:00:00Z"),
    ]);

    expect(ids(weeks)).toEqual([["a", "b", "c"]]);
  });

  it("lo anterior, del más reciente al más antiguo, con «Semana pasada»", () => {
    const weeks = build(
      [
        practice("hace-mucho", "2026-09-15T16:00:00Z", { status: "done" }),
        practice("lunes", "2026-10-05T16:00:00Z", { status: "done" }),
        practice("pasada-1", "2026-09-29T16:00:00Z", { status: "done" }),
        practice("pasada-2", "2026-10-01T16:00:00Z", { status: "cancelled" }),
      ],
      { scope: "past" },
    );

    expect(labels(weeks)).toEqual(["Esta semana", "Semana pasada", "Semana del 14 sep"]);
    expect(ids(weeks)).toEqual([["lunes"], ["pasada-2", "pasada-1"], ["hace-mucho"]]);
  });

  it("a igual hora, por id: el orden no baila", () => {
    const weeks = build([practice("b", "2026-10-08T16:00:00Z"), practice("a", "2026-10-08T16:00:00Z")]);

    expect(ids(weeks)).toEqual([["a", "b"]]);
  });
});

describe("buildAgenda · filas", () => {
  it("un entreno: su título, lo que dura y dónde, la hora, y lleva a su sesión", () => {
    const [week] = build([practice("e-1", "2026-10-08T16:00:00Z")]);

    expect(week?.items[0]).toEqual({
      eventId: "e-1",
      kind: "practice",
      href: "/c/club-a/train/e-1",
      chip: { label: "Jue", day: "8" },
      title: "Salida de presión",
      subtitle: "Entrenamiento · 45 min · Pabellón 2",
      trail: { text: "18:00", tone: "plain" },
    });
  });

  it("un entreno sin ejercicios dura su franja, y sin lugar no lo dice", () => {
    const [week] = build([
      practice("e-1", "2026-10-08T16:00:00Z", {
        plan: { title: "Por montar", itemMinutes: [] },
        location: "  ",
      }),
    ]);

    expect(week?.items[0]?.subtitle).toBe("Entrenamiento · 75 min");
  });

  it("un partido: «vs» el rival, local o visitante y la competición, y lleva a su ficha", () => {
    const [week] = build([game("g-1", "2026-10-10T08:30:00Z")]);

    expect(week?.items[0]).toEqual({
      eventId: "g-1",
      kind: "game",
      href: "/c/club-a/games/g-1",
      chip: { label: "Sáb", day: "10" },
      title: "vs Rival C",
      subtitle: "Partido · Local · Liga",
      trail: { text: "10:30", tone: "plain" },
    });
  });

  it("un partido sin lado ni competición es solo «Partido»", () => {
    const [week] = build([
      game("g-1", "2026-10-10T08:30:00Z", {
        game: { opponent: "Rival C", competition: null, homeAway: null, score: null },
      }),
    ]);

    expect(week?.items[0]?.subtitle).toBe("Partido");
  });

  it("con varios equipos, el subtítulo empieza por el equipo", () => {
    const weeks = build(
      [
        practice("e-a", "2026-10-08T16:00:00Z"),
        game("g-b", "2026-10-10T08:30:00Z", { teamId: TEAM_B.id }),
      ],
      {},
      [TEAM_A, TEAM_B],
    );

    expect(weeks[0]?.items.map((item) => item.subtitle)).toEqual([
      "Equipo A · Entrenamiento · 45 min · Pabellón 2",
      "Equipo B · Partido · Local · Liga",
    ]);
  });

  it("las horas y los días salen en la zona del club", () => {
    const [week] = build([practice("e-1", "2026-10-08T16:00:00Z")], { tz: "America/Mexico_City" });

    expect(week?.items[0]?.trail?.text).toBe("10:00");
  });

  it("un entreno sin plan no sale: su detalle sería un 404", () => {
    expect(build([practice("bare", "2026-10-08T16:00:00Z", { plan: null })])).toEqual([]);
  });

  it("un partido sin sus datos, o un evento de un equipo que no se está viendo, no sale", () => {
    const weeks = build([
      game("sin-datos", "2026-10-10T08:30:00Z", { game: null }),
      practice("otro-equipo", "2026-10-08T16:00:00Z", { teamId: TEAM_B.id }),
    ]);

    expect(weeks).toEqual([]);
  });
});

describe("buildAgenda · cómo acabó", () => {
  const past = (events: AgendaEvent[]) => build(events, { scope: "past" })[0]?.items ?? [];

  it("en lo anterior, la fila lleva el mes en vez del día de la semana", () => {
    const [item] = past([practice("e-1", "2026-10-05T16:00:00Z", { status: "done" })]);

    expect(item?.chip).toEqual({ label: "oct", day: "5" });
  });

  it("un entreno hecho dice «Hecho»; uno cancelado, «Cancelada»", () => {
    const items = past([
      practice("hecho", "2026-10-06T16:00:00Z", { status: "done" }),
      practice("cancelado", "2026-10-05T16:00:00Z", { status: "cancelled" }),
    ]);

    expect(items.map((item) => item.trail)).toEqual([
      { text: "Hecho", tone: "done" },
      { text: "Cancelada", tone: "plain" },
    ]);
  });

  it("un entreno que pasó sin hacerse conserva su hora", () => {
    const [item] = past([practice("pasado", "2026-10-05T16:00:00Z")]);

    expect(item?.trail).toEqual({ text: "18:00", tone: "plain" });
  });

  it("un partido jugado enseña su marcador, el del club primero, y cómo se lee", () => {
    const [item] = past([
      game("jugado", "2026-10-03T08:30:00Z", {
        status: "done",
        game: { opponent: "Rival C", competition: null, homeAway: "away", score: { for: 61, against: 58 } },
      }),
    ]);

    expect(item?.trail).toEqual({ text: "61–58", spoken: "61 a 58", tone: "plain" });
  });

  it("un partido cancelado dice «Cancelado»; uno que ya empezó sin marcador, «Sin resultado»", () => {
    const items = past([
      game("empezado", "2026-10-06T08:30:00Z"),
      game("cancelado", "2026-10-05T08:30:00Z", { status: "cancelled" }),
    ]);

    expect(items.map((item) => item.trail?.text)).toEqual(["Sin resultado", "Cancelado"]);
  });
});
