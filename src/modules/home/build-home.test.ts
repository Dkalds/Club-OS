import { describe, expect, it } from "vitest";
import { buildHome } from "./build-home";
import type { HomeEvent, HomeInput } from "./types";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TZ = "Europe/Madrid";
const NOW = "2026-10-02T10:00:00Z"; // viernes 2 oct, 12:00 en Madrid
const NOW_DST = "2026-10-23T10:00:00Z"; // viernes 23 oct, 12:00 en Madrid; el 25 cambia la hora

const TEAM_A = { id: "team-a", name: "Equipo A", seasonName: "2026-27" };
const TEAM_B = { id: "team-b", name: "Equipo B", seasonName: "2026-27" };

const PLAN = {
  title: "Transición + rebote defensivo",
  focus: ["Defensa", "Rebote"],
  itemMinutes: [10, 15, 15, 20, 15],
};

function practice(id: string, startsAt: string, endsAt: string, overrides: Partial<HomeEvent> = {}): HomeEvent {
  return {
    id,
    teamId: TEAM_A.id,
    kind: "practice",
    status: "scheduled",
    startsAt,
    endsAt,
    location: null,
    plan: null,
    game: null,
    ...overrides,
  };
}

function game(id: string, startsAt: string, endsAt: string, overrides: Partial<HomeEvent> = {}): HomeEvent {
  return {
    id,
    teamId: TEAM_A.id,
    kind: "game",
    status: "scheduled",
    startsAt,
    endsAt,
    location: null,
    plan: null,
    game: { opponent: "Rival C", competition: "Liga base", homeAway: "home" },
    ...overrides,
  };
}

function input(events: HomeEvent[], overrides: Partial<HomeInput> = {}): HomeInput {
  return { firstName: "Ana", teams: [TEAM_A], events, ...overrides };
}

describe("buildHome · próximo entrenamiento", () => {
  it("elige el próximo entrenamiento y suma minutos y ejercicios", () => {
    const home = buildHome(
      input([
        practice("later", "2026-10-08T16:00:00Z", "2026-10-08T17:15:00Z"),
        practice("next", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", {
          plan: PLAN,
          location: "Pabellón 2",
        }),
      ]),
      NOW,
      TZ,
    );

    expect(home.nextPractice).toEqual({
      eventId: "next",
      teamName: "Equipo A",
      slotLabel: "Martes 6 oct · 18:00–19:15",
      title: "Transición + rebote defensivo",
      totalMinutes: 75,
      drillCount: 5,
      focus: ["Defensa", "Rebote"],
      location: "Pabellón 2",
    });
  });

  it("un entrenamiento en curso sigue siendo el próximo", () => {
    const events = [
      practice("running", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", { plan: PLAN }),
      practice("later", "2026-10-08T16:00:00Z", "2026-10-08T17:15:00Z"),
    ];

    // A mitad de sesión (16:30Z, 18:30 en Madrid).
    expect(buildHome(input(events), "2026-10-06T16:30:00Z", TZ).nextPractice?.eventId).toBe(
      "running",
    );
    // Un minuto antes de que acabe.
    expect(buildHome(input(events), "2026-10-06T17:14:00Z", TZ).nextPractice?.eventId).toBe(
      "running",
    );
  });

  it("uno que termina justo ahora ya no cuenta", () => {
    const events = [
      practice("over", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z"),
      practice("later", "2026-10-08T16:00:00Z", "2026-10-08T17:15:00Z"),
    ];

    expect(buildHome(input(events), "2026-10-06T17:15:00Z", TZ).nextPractice?.eventId).toBe("later");
  });

  it("ignora cancelados y pasados", () => {
    const home = buildHome(
      input([
        practice("past", "2026-09-30T16:00:00Z", "2026-09-30T17:15:00Z"),
        practice("today-over", "2026-10-02T08:00:00Z", "2026-10-02T09:15:00Z"),
        practice("cancelled", "2026-10-03T08:00:00Z", "2026-10-03T09:15:00Z", { status: "cancelled" }),
        practice("done", "2026-10-04T08:00:00Z", "2026-10-04T09:15:00Z", { status: "done" }),
        practice("valid", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z"),
      ]),
      NOW,
      TZ,
    );

    expect(home.nextPractice?.eventId).toBe("valid");
    // Cancelados, hechos y pasados tampoco salen en «Esta semana».
    expect(home.week.map((item) => item.eventId)).toEqual(["valid"]);
  });

  it("sin plan: título por defecto y minutos del evento", () => {
    const home = buildHome(
      input([practice("bare", "2026-10-06T16:00:00Z", "2026-10-06T17:30:00Z")]),
      NOW,
      TZ,
    );

    expect(home.nextPractice).toEqual({
      eventId: "bare",
      teamName: "Equipo A",
      slotLabel: "Martes 6 oct · 18:00–19:30",
      title: "Entrenamiento sin plan",
      totalMinutes: 90,
      drillCount: 0,
      focus: [],
      location: null,
    });
    expect(home.week[0]?.subtitle).toBe("Sin plan");
  });

  it("un plan sin ítems tiene 0 min y 0 ejercicios, con su título", () => {
    const home = buildHome(
      input([
        practice("empty", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", {
          plan: { title: "Plan vacío", focus: [], itemMinutes: [] },
        }),
      ]),
      NOW,
      TZ,
    );

    expect(home.nextPractice).toMatchObject({ title: "Plan vacío", totalMinutes: 0, drillCount: 0 });
  });

  it("elige el más temprano aunque lleguen desordenados y no toca la entrada", () => {
    const events = [
      practice("c", "2026-10-08T16:00:00Z", "2026-10-08T17:15:00Z"),
      practice("a", "2026-10-03T08:00:00Z", "2026-10-03T09:15:00Z"),
      practice("b", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z"),
    ];
    const snapshot = structuredClone(events);

    const home = buildHome(input(events), NOW, TZ);

    expect(home.nextPractice?.eventId).toBe("a");
    expect(home.week.map((item) => item.eventId)).toEqual(["a", "b", "c"]);
    expect(events).toEqual(snapshot);
  });

  it("con la misma hora de inicio desempata por id", () => {
    const events = [
      practice("b", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z"),
      practice("a", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z"),
    ];

    const home = buildHome(input(events), NOW, TZ);
    expect(home.nextPractice?.eventId).toBe("a");
    expect(home.week.map((item) => item.eventId)).toEqual(["a", "b"]);
    expect(buildHome(input([...events].reverse()), NOW, TZ).nextPractice?.eventId).toBe("a");
  });

  it("la hora sale en la zona del club, no en la del dispositivo", () => {
    const events = [practice("p", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z")];

    expect(buildHome(input(events), NOW, "America/Mexico_City").nextPractice?.slotLabel).toBe(
      "Martes 6 oct · 10:00–11:15",
    );
  });

  it("el nombre del equipo sale de su id y, si falta, queda vacío sin lanzar", () => {
    const events = [practice("p", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", { teamId: "team-b" })];

    expect(buildHome(input(events, { teams: [TEAM_A, TEAM_B] }), NOW, TZ).nextPractice?.teamName).toBe(
      "Equipo B",
    );
    expect(buildHome(input(events), NOW, TZ).nextPractice?.teamName).toBe("");
  });
});

describe("buildHome · próximo partido", () => {
  it("elige el partido más temprano y le pone etiqueta con Local o Visitante", () => {
    const home = buildHome(
      input([
        game("later", "2026-10-17T08:30:00Z", "2026-10-17T10:00:00Z"),
        game("next", "2026-10-10T08:30:00Z", "2026-10-10T10:00:00Z", {
          game: { opponent: "Rival C", competition: "Liga base", homeAway: "home" },
        }),
        practice("practice", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z"),
      ]),
      NOW,
      TZ,
    );

    expect(home.nextGame).toEqual({
      eventId: "next",
      teamName: "Equipo A",
      slotLabel: "Sábado 10 oct · 10:30 · Local",
      opponent: "Rival C",
      competition: "Liga base",
    });
    expect(home.nextPractice?.eventId).toBe("practice");
  });

  it("sin sede conocida la etiqueta no lleva sufijo y sin competición va a null", () => {
    const home = buildHome(
      input([
        game("g", "2026-10-10T08:30:00Z", "2026-10-10T10:00:00Z", {
          game: { opponent: "Rival C", competition: null, homeAway: null },
        }),
      ]),
      NOW,
      TZ,
    );

    expect(home.nextGame?.slotLabel).toBe("Sábado 10 oct · 10:30");
    expect(home.nextGame?.competition).toBeNull();
  });

  it("un partido en curso sigue siendo el próximo y uno cancelado no cuenta", () => {
    const events = [
      game("cancelled", "2026-10-09T08:30:00Z", "2026-10-09T10:00:00Z", { status: "cancelled" }),
      game("running", "2026-10-10T08:30:00Z", "2026-10-10T10:00:00Z"),
    ];

    expect(buildHome(input(events), "2026-10-10T09:00:00Z", TZ).nextGame?.eventId).toBe("running");
    expect(buildHome(input(events), "2026-10-10T10:00:00Z", TZ).nextGame).toBeNull();
  });

  it("sin datos del partido no se pierde el evento: queda con rival por confirmar", () => {
    const home = buildHome(
      input([game("g", "2026-10-03T08:30:00Z", "2026-10-03T10:00:00Z", { game: null })]),
      NOW,
      TZ,
    );

    expect(home.nextGame).toMatchObject({
      eventId: "g",
      slotLabel: "Sábado 3 oct · 10:30",
      opponent: "Rival por confirmar",
      competition: null,
    });
    expect(home.week[0]?.subtitle).toBe("Rival por confirmar");
  });

  it("sin partidos programados nextGame es null", () => {
    const home = buildHome(
      input([practice("p", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z")]),
      NOW,
      TZ,
    );

    expect(home.nextGame).toBeNull();
  });
});

describe("buildHome · esta semana", () => {
  it("esta semana son 7 días locales desde hoy", () => {
    const home = buildHome(
      input([
        practice("sat", "2026-10-03T08:00:00Z", "2026-10-03T09:15:00Z"), // sáb 3, 10:00
        practice("tue", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", { plan: PLAN }), // mar 6, 18:00
        game("thu", "2026-10-08T08:30:00Z", "2026-10-08T10:00:00Z"), // jue 8, 10:30
        practice("fri", "2026-10-09T16:00:00Z", "2026-10-09T17:15:00Z"), // vie 9, 18:00: fuera
      ]),
      NOW,
      TZ,
    );

    expect(home.week).toEqual([
      {
        eventId: "sat",
        kind: "practice",
        dow: "Sáb",
        day: "3",
        title: "Entrenamiento",
        subtitle: "Sin plan",
        time: "10:00",
      },
      {
        eventId: "tue",
        kind: "practice",
        dow: "Mar",
        day: "6",
        title: "Entrenamiento",
        subtitle: "Transición + rebote defensivo",
        time: "18:00",
      },
      {
        eventId: "thu",
        kind: "game",
        dow: "Jue",
        day: "8",
        title: "Partido",
        subtitle: "vs Rival C · Local",
        time: "10:30",
      },
    ]);
  });

  it("la semana termina a las 24:00 locales del día 8: 23:30 entra y 00:30 del día 9 no", () => {
    const home = buildHome(
      input([
        practice("late-thu", "2026-10-08T21:30:00Z", "2026-10-08T22:15:00Z"), // jue 8, 23:30 local
        practice("early-fri", "2026-10-08T22:30:00Z", "2026-10-08T23:15:00Z"), // vie 9, 00:30 local
      ]),
      NOW,
      TZ,
    );

    expect(home.week.map((item) => [item.eventId, item.dow, item.day, item.time])).toEqual([
      ["late-thu", "Jue", "8", "23:30"],
    ]);
  });

  it("la semana empieza a las 00:00 locales de hoy, no en este instante", () => {
    // Empezó a las 00:30 locales de hoy (22:30Z del 1 oct) y sigue en marcha: es de hoy.
    const home = buildHome(
      input([practice("today", "2026-10-01T22:30:00Z", "2026-10-02T11:00:00Z")]),
      NOW,
      TZ,
    );

    expect(home.week.map((item) => item.eventId)).toEqual(["today"]);
  });

  it("semana que cruza el cambio de hora", () => {
    const home = buildHome(
      input([
        practice("tue", "2026-10-27T17:00:00Z", "2026-10-27T18:15:00Z"), // 18:00 CET
        practice("thu", "2026-10-29T17:00:00Z", "2026-10-29T18:15:00Z"), // 18:00 CET
        practice("next-day", "2026-10-29T23:30:00Z", "2026-10-30T00:45:00Z"), // 30 oct, 00:30 CET: fuera
      ]),
      NOW_DST,
      TZ,
    );

    expect(home.week.map((item) => [item.eventId, item.dow, item.day, item.time])).toEqual([
      ["tue", "Mar", "27", "18:00"],
      ["thu", "Jue", "29", "18:00"],
    ]);
  });

  it("el día 29 a las 23:30 locales entra y a las 00:00 locales del 30 no (un día local son 25 h)", () => {
    // Si la semana se calculara como 7 × 24 h terminaría a las 22:00Z y perdería el primero.
    const home = buildHome(
      input([
        practice("last-minute", "2026-10-29T22:30:00Z", "2026-10-29T22:59:00Z"), // 29 oct, 23:30 CET
        practice("boundary", "2026-10-29T23:00:00Z", "2026-10-29T23:45:00Z"), // 30 oct, 00:00 CET
      ]),
      NOW_DST,
      TZ,
    );

    expect(home.week.map((item) => [item.eventId, item.day, item.time])).toEqual([
      ["last-minute", "29", "23:30"],
    ]);
  });

  it("el día del cambio de hora aparece una vez cada evento, sin perder ni duplicar", () => {
    const home = buildHome(
      input([
        practice("before", "2026-10-24T22:30:00Z", "2026-10-24T23:15:00Z"), // 25 oct, 00:30 CEST
        practice("after", "2026-10-25T09:00:00Z", "2026-10-25T10:15:00Z"), // 25 oct, 10:00 CET
        practice("monday", "2026-10-26T08:00:00Z", "2026-10-26T09:15:00Z"), // 26 oct, 09:00 CET
      ]),
      NOW_DST,
      TZ,
    );

    expect(home.week.map((item) => [item.eventId, item.dow, item.day, item.time])).toEqual([
      ["before", "Dom", "25", "00:30"],
      ["after", "Dom", "25", "10:00"],
      ["monday", "Lun", "26", "09:00"],
    ]);
  });

  it("el subtítulo de un partido sin sede no lleva sufijo", () => {
    const home = buildHome(
      input([
        game("away", "2026-10-03T08:30:00Z", "2026-10-03T10:00:00Z", {
          game: { opponent: "Rival C", competition: null, homeAway: "away" },
        }),
        game("unknown", "2026-10-04T08:30:00Z", "2026-10-04T10:00:00Z", {
          game: { opponent: "Rival D", competition: null, homeAway: null },
        }),
      ]),
      NOW,
      TZ,
    );

    expect(home.week.map((item) => item.subtitle)).toEqual(["vs Rival C · Visitante", "vs Rival D"]);
  });
});

describe("buildHome · equipos, saludo y estado vacío", () => {
  it("sin equipos: hasTeams false y todo vacío", () => {
    expect(buildHome({ firstName: "Ana", teams: [], events: [] }, NOW, TZ)).toEqual({
      greeting: "Buenos días",
      firstName: "Ana",
      kicker: null,
      nextPractice: null,
      nextGame: null,
      week: [],
      hasTeams: false,
    });
  });

  it("con equipo pero sin eventos: hasTeams true, kicker y nada más", () => {
    expect(buildHome(input([]), NOW, TZ)).toEqual({
      greeting: "Buenos días",
      firstName: "Ana",
      kicker: "Equipo A · Temporada 2026-27",
      nextPractice: null,
      nextGame: null,
      week: [],
      hasTeams: true,
    });
  });

  it("con dos equipos el subtítulo lleva el equipo delante", () => {
    const home = buildHome(
      input(
        [
          practice("a", "2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", { plan: PLAN }),
          practice("b", "2026-10-07T16:00:00Z", "2026-10-07T17:15:00Z", { teamId: TEAM_B.id }),
          game("c", "2026-10-08T08:30:00Z", "2026-10-08T10:00:00Z", { teamId: TEAM_B.id }),
        ],
        { teams: [TEAM_A, TEAM_B] },
      ),
      NOW,
      TZ,
    );

    expect(home.week.map((item) => item.subtitle)).toEqual([
      "Equipo A · Transición + rebote defensivo",
      "Equipo B · Sin plan",
      "Equipo B · vs Rival C · Local",
    ]);
    expect(home.kicker).toBe("2 equipos · Temporada 2026-27");
  });

  it("con varios equipos la temporada del kicker es la del primero", () => {
    const home = buildHome(
      input([], {
        teams: [
          { id: "team-a", name: "Equipo A", seasonName: "2026-27" },
          { id: "team-b", name: "Equipo B", seasonName: "2025-26" },
          { id: "team-c", name: "Equipo C", seasonName: "2025-26" },
        ],
      }),
      NOW,
      TZ,
    );

    expect(home.kicker).toBe("3 equipos · Temporada 2026-27");
  });

  it("pasa el nombre tal cual, incluso vacío", () => {
    expect(buildHome(input([], { firstName: "" }), NOW, TZ).firstName).toBe("");
    expect(buildHome(input([], { firstName: "Ana" }), NOW, TZ).firstName).toBe("Ana");
  });

  it("el saludo sale de la hora del club", () => {
    expect(buildHome(input([]), "2026-10-02T05:30:00Z", TZ).greeting).toBe("Buenos días");
    expect(buildHome(input([]), "2026-10-02T12:30:00Z", TZ).greeting).toBe("Buenas tardes");
    expect(buildHome(input([]), "2026-10-02T19:30:00Z", TZ).greeting).toBe("Buenas noches");
    // 12:30Z son las 06:30 en México: la misma hora, otro saludo.
    expect(buildHome(input([]), "2026-10-02T12:30:00Z", "America/Mexico_City").greeting).toBe(
      "Buenos días",
    );
  });
});
