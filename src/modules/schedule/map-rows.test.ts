import { describe, expect, it } from "vitest";
import { toAgendaEvents, type AgendaRow } from "./map-rows";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
function row(overrides: Partial<AgendaRow> = {}): AgendaRow {
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
  title: "Salida de presión",
  practice_items: [
    { sort: 2, minutes: 15 },
    { sort: 0, minutes: 10 },
    { sort: 1, minutes: 20 },
  ],
};
const GAME = {
  opponent_name: "Rival C",
  competition_name: "Liga",
  home_away: "away",
  score_for: 61,
  score_against: 58,
};

describe("toAgendaEvents", () => {
  it("un entreno con su plan: el título y los minutos de sus ítems por orden de sort", () => {
    expect(toAgendaEvents([row({ practice_plans: PLAN })])).toEqual([
      {
        id: "event-1",
        teamId: "team-a",
        kind: "practice",
        status: "scheduled",
        startsAt: "2026-10-06T16:00:00+00:00",
        endsAt: "2026-10-06T17:15:00+00:00",
        location: "Pabellón 2",
        plan: { title: "Salida de presión", itemMinutes: [10, 20, 15] },
        game: null,
      },
    ]);
  });

  it("un partido con sus datos y su marcador", () => {
    const [event] = toAgendaEvents([row({ kind: "game", status: "done", games: GAME })]);

    expect(event?.game).toEqual({
      opponent: "Rival C",
      competition: "Liga",
      homeAway: "away",
      score: { for: 61, against: 58 },
    });
    expect(event?.plan).toBeNull();
  });

  it("lee igual una relación que llega como objeto que como lista de un elemento", () => {
    const asObjects = toAgendaEvents([row({ practice_plans: PLAN, games: GAME })]);
    const asLists = toAgendaEvents([row({ practice_plans: [PLAN], games: [GAME] })]);

    expect(asLists).toEqual(asObjects);
  });

  it("sin plan o sin partido (null o lista vacía), `null`", () => {
    const [empty] = toAgendaEvents([row({ practice_plans: [], games: [] })]);

    expect(empty?.plan).toBeNull();
    expect(empty?.game).toBeNull();
  });

  it("un plan sin ítems (lista vacía o null) no tiene minutos", () => {
    const [none, missing] = toAgendaEvents([
      row({ practice_plans: { ...PLAN, practice_items: [] } }),
      row({ practice_plans: { ...PLAN, practice_items: null } }),
    ]);

    expect(none?.plan?.itemMinutes).toEqual([]);
    expect(missing?.plan?.itemMinutes).toEqual([]);
  });

  it("medio marcador no es un marcador", () => {
    const [event] = toAgendaEvents([row({ kind: "game", games: { ...GAME, score_against: null } })]);

    expect(event?.game?.score).toBeNull();
  });

  it("un local o visitante que no se reconoce no se inventa", () => {
    const [event] = toAgendaEvents([row({ kind: "game", games: { ...GAME, home_away: "neutral" } })]);

    expect(event?.game?.homeAway).toBeNull();
  });

  it("no cambia el orden de los ítems que recibe", () => {
    const items = [...PLAN.practice_items];
    toAgendaEvents([row({ practice_plans: { ...PLAN, practice_items: items } })]);

    expect(items).toEqual(PLAN.practice_items);
  });
});
