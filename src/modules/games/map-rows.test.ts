import { describe, expect, it } from "vitest";
import { toGameDetail, toGameListItems, type GameDetailRow, type GameEventRow } from "./map-rows";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Europe/Madrid";
const NOW = "2026-10-08T10:00:00Z";
const TEAMS = [{ id: uuid(1), name: "Equipo A" }];

const row = (extra: Partial<GameEventRow> = {}): GameEventRow => ({
  id: uuid(10),
  team_id: uuid(1),
  status: "scheduled",
  starts_at: "2026-10-10T08:30:00Z",
  ends_at: "2026-10-10T10:00:00Z",
  location: "Pabellón",
  games: [{ opponent_name: "Rival", competition_name: "Liga", home_away: "home", score_for: null, score_against: null }],
  ...extra,
});

describe("toGameListItems", () => {
  it("un partido próximo: hora en la zona del club, local, sin marcador", () => {
    expect(toGameListItems([row()], TEAMS, TZ, NOW)).toEqual([
      {
        eventId: uuid(10),
        teamId: uuid(1),
        teamName: "Equipo A",
        opponent: "Rival",
        competition: "Liga",
        homeAway: "home",
        status: "scheduled",
        started: false,
        slotLabel: "Sábado 10 oct · 10:30 · Local",
        dateChip: { dow: "Sáb", day: "10" },
        monthChip: { month: "oct", day: "10" },
        time: "10:30",
        location: "Pabellón",
        score: null,
      },
    ]);
  });

  it("uno jugado lleva su marcador; uno que ya empezó está «started»", () => {
    const [played] = toGameListItems(
      [
        row({
          status: "done",
          starts_at: "2026-10-03T08:30:00Z",
          ends_at: "2026-10-03T10:00:00Z",
          games: { opponent_name: "Rival", competition_name: null, home_away: "away", score_for: 61, score_against: 58 },
        }),
      ],
      TEAMS,
      TZ,
      NOW,
    );
    expect(played).toMatchObject({ started: true, score: { for: 61, against: 58 }, homeAway: "away" });
  });

  it("un evento sin partido o de un equipo que no es de la lista no se pinta", () => {
    expect(toGameListItems([row({ games: null }), row({ team_id: uuid(99) })], TEAMS, TZ, NOW)).toEqual([]);
  });

  it("un local o visitante que no se reconoce no se inventa", () => {
    const [item] = toGameListItems(
      [row({ games: { opponent_name: "R", competition_name: null, home_away: "neutral", score_for: null, score_against: null } })],
      TEAMS,
      TZ,
      NOW,
    );
    expect(item?.homeAway).toBeNull();
    expect(item?.slotLabel).toBe("Sábado 10 oct · 10:30");
  });
});

describe("toGameDetail", () => {
  const detail = (extra: Partial<GameDetailRow> = {}): GameDetailRow => ({
    ...row(),
    teams: { name: "Equipo A" },
    games: [{ opponent_name: "Rival", competition_name: null, home_away: null, score_for: null, score_against: null, opponent_notes: "Zona 2-3" }],
    ...extra,
  });

  it("los valores del formulario en el reloj del club y la duración en minutos", () => {
    expect(toGameDetail(detail(), TZ, NOW)).toMatchObject({
      teamName: "Equipo A",
      opponentNotes: "Zona 2-3",
      form: { date: "2026-10-10", time: "10:30", durationMinutes: 90 },
    });
  });

  it("sin partido o sin equipo: null", () => {
    expect(toGameDetail(detail({ games: null }), TZ, NOW)).toBeNull();
    expect(toGameDetail(detail({ teams: null }), TZ, NOW)).toBeNull();
  });
});
