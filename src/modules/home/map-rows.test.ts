import { describe, expect, it } from "vitest";
import { toHomeEvents, type EventRow } from "./map-rows";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

function eventRow(overrides: Partial<EventRow> = {}): EventRow {
  return {
    id: "event-1",
    team_id: "team-a",
    kind: "practice",
    status: "scheduled",
    starts_at: "2026-10-06T16:00:00+00:00",
    ends_at: "2026-10-06T17:15:00+00:00",
    location: "Pabellón 2",
    practice_plans: null,
    games: null,
    ...overrides,
  };
}

const PLAN = {
  title: "Transición + rebote defensivo",
  primary_focus: { name: "Defensa" },
  secondary_focus: { name: "Rebote" },
  practice_items: [
    { sort: 0, minutes: 10 },
    { sort: 1, minutes: 20 },
    { sort: 2, minutes: 15 },
  ],
};

const GAME = { opponent_name: "Rival C", competition_name: "Liga base", home_away: "home" };

describe("toHomeEvents", () => {
  it("copia los campos del evento tal cual", () => {
    expect(toHomeEvents([eventRow({ kind: "game", status: "done" })])).toEqual([
      {
        id: "event-1",
        teamId: "team-a",
        kind: "game",
        status: "done",
        startsAt: "2026-10-06T16:00:00+00:00",
        endsAt: "2026-10-06T17:15:00+00:00",
        location: "Pabellón 2",
        plan: null,
        game: null,
      },
    ]);
  });

  it("lee el plan y el partido tanto si llegan como lista como si llegan como objeto", () => {
    const asObjects = toHomeEvents([
      eventRow({ kind: "game", practice_plans: PLAN, games: GAME }),
    ]);
    const asArrays = toHomeEvents([
      eventRow({
        kind: "game",
        practice_plans: [
          {
            ...PLAN,
            primary_focus: [{ name: "Defensa" }],
            secondary_focus: [{ name: "Rebote" }],
          },
        ],
        games: [GAME],
      }),
    ]);

    expect(asArrays).toEqual(asObjects);
    expect(asObjects[0]?.plan).toEqual({
      title: "Transición + rebote defensivo",
      focus: ["Defensa", "Rebote"],
      itemMinutes: [10, 20, 15],
    });
    expect(asObjects[0]?.game).toEqual({
      opponent: "Rival C",
      competition: "Liga base",
      homeAway: "home",
    });
  });

  it("sin plan o con una lista de plan vacía, plan es null", () => {
    expect(toHomeEvents([eventRow({ practice_plans: null })])[0]?.plan).toBeNull();
    expect(toHomeEvents([eventRow({ practice_plans: [] })])[0]?.plan).toBeNull();
  });

  it("sin partido o con una lista de partido vacía, game es null", () => {
    expect(toHomeEvents([eventRow({ kind: "game", games: null })])[0]?.game).toBeNull();
    expect(toHomeEvents([eventRow({ kind: "game", games: [] })])[0]?.game).toBeNull();
  });

  it("los focos van primero el principal y luego el secundario", () => {
    const [event] = toHomeEvents([
      eventRow({
        practice_plans: {
          ...PLAN,
          primary_focus: { name: "Tiro" },
          secondary_focus: { name: "Pase" },
        },
      }),
    ]);

    expect(event?.plan?.focus).toEqual(["Tiro", "Pase"]);
  });

  it("sin foco secundario sale solo el principal; sin ninguno, ninguno", () => {
    const only = toHomeEvents([
      eventRow({ practice_plans: { ...PLAN, secondary_focus: null } }),
    ])[0];
    const none = toHomeEvents([
      eventRow({ practice_plans: { ...PLAN, primary_focus: null, secondary_focus: null } }),
    ])[0];
    const secondaryOnly = toHomeEvents([
      eventRow({ practice_plans: { ...PLAN, primary_focus: null, secondary_focus: { name: "Pase" } } }),
    ])[0];

    expect(only?.plan?.focus).toEqual(["Defensa"]);
    expect(none?.plan?.focus).toEqual([]);
    expect(secondaryOnly?.plan?.focus).toEqual(["Pase"]);
  });

  it("si el foco principal y el secundario son el mismo, sale una vez", () => {
    const [event] = toHomeEvents([
      eventRow({
        practice_plans: {
          ...PLAN,
          primary_focus: { name: "Defensa" },
          secondary_focus: { name: "Defensa" },
        },
      }),
    ]);

    expect(event?.plan?.focus).toEqual(["Defensa"]);
  });

  it("ordena los minutos de los ítems por sort, no por el orden en que llegan", () => {
    const [event] = toHomeEvents([
      eventRow({
        practice_plans: {
          ...PLAN,
          practice_items: [
            { sort: 2, minutes: 15 },
            { sort: 0, minutes: 10 },
            { sort: 1, minutes: 20 },
          ],
        },
      }),
    ]);

    expect(event?.plan?.itemMinutes).toEqual([10, 20, 15]);
  });

  it("no cambia la lista de ítems que recibe", () => {
    const items = [
      { sort: 2, minutes: 15 },
      { sort: 0, minutes: 10 },
    ];
    toHomeEvents([eventRow({ practice_plans: { ...PLAN, practice_items: items } })]);

    expect(items).toEqual([
      { sort: 2, minutes: 15 },
      { sort: 0, minutes: 10 },
    ]);
  });

  it("un plan sin ítems (lista vacía o null) tiene una lista de minutos vacía", () => {
    expect(
      toHomeEvents([eventRow({ practice_plans: { ...PLAN, practice_items: [] } })])[0]?.plan?.itemMinutes,
    ).toEqual([]);
    expect(
      toHomeEvents([eventRow({ practice_plans: { ...PLAN, practice_items: null } })])[0]?.plan?.itemMinutes,
    ).toEqual([]);
  });

  it("home_away solo admite home o away; cualquier otra cosa es null", () => {
    const sides = ["home", "away", null, "neutral", ""].map(
      (home_away) =>
        toHomeEvents([eventRow({ kind: "game", games: { ...GAME, home_away } })])[0]?.game?.homeAway,
    );

    expect(sides).toEqual(["home", "away", null, null, null]);
  });

  it("deja competition a null y respeta el orden de las filas", () => {
    const events = toHomeEvents([
      eventRow({ id: "b", kind: "game", games: { ...GAME, competition_name: null } }),
      eventRow({ id: "a" }),
    ]);

    expect(events.map((event) => event.id)).toEqual(["b", "a"]);
    expect(events[0]?.game?.competition).toBeNull();
  });

  it("sin filas no hay eventos", () => {
    expect(toHomeEvents([])).toEqual([]);
  });
});

