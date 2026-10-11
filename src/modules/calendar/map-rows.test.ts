import { describe, expect, it } from "vitest";
import {
  SCHEDULE_COLUMNS,
  TEAM_SCHEDULES_COLUMNS,
  toSeasonSchedules,
  toTeamSchedule,
  toTeamScheduleList,
  toVenue,
  VENUE_COLUMNS,
  type ScheduleRow,
  type TeamSchedulesRow,
  type VenueRow,
} from "./map-rows";

// Datos neutros y ficticios: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM = uuid(100);
const VENUE = uuid(200);

function scheduleRow(n: number, weekday: number, startTime: string, overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    id: uuid(n),
    team_id: TEAM,
    weekday,
    start_time: startTime,
    duration_minutes: 75,
    venue_id: null,
    venues: null,
    ...overrides,
  };
}

function teamRow(
  n: number,
  name: string,
  category: { name: string; sort: number } | null,
  schedules: ScheduleRow[] | null = [],
): TeamSchedulesRow {
  return { id: uuid(n), name, categories: category, team_schedules: schedules };
}

describe("las columnas que se piden", () => {
  it("de una pista: su id, su nombre y el equipo de cada horario que la lleva", () => {
    expect(VENUE_COLUMNS).toBe("id, name, team_schedules(teams(name))");
  });

  it("de un horario: sus datos y el nombre de su pista", () => {
    expect(SCHEDULE_COLUMNS).toBe("id, team_id, weekday, start_time, duration_minutes, venue_id, venues(name)");
  });

  it("de los equipos: su categoría, sus horarios y la temporada con `!inner`, que deja solo la actual", () => {
    expect(TEAM_SCHEDULES_COLUMNS).toContain("seasons!inner(is_current)");
    expect(TEAM_SCHEDULES_COLUMNS).toContain("categories(name, sort)");
    expect(TEAM_SCHEDULES_COLUMNS).toContain(`team_schedules(${SCHEDULE_COLUMNS})`);
  });
});

describe("toVenue", () => {
  const row = (schedules: VenueRow["team_schedules"]): VenueRow => ({ id: VENUE, name: "Pista 1", team_schedules: schedules });
  /** Un horario en esa pista, del equipo que se diga. */
  const of = (name: string) => ({ teams: { name } });

  it("lleva su id y su nombre", () => {
    expect(toVenue(row([]))).toEqual({ id: VENUE, name: "Pista 1", usedBy: [] });
  });

  it("`usedBy` son los equipos con algún horario en ella", () => {
    expect(toVenue(row([of("Equipo A")])).usedBy).toEqual(["Equipo A"]);
  });

  it("un equipo con varios horarios en la pista sale una sola vez", () => {
    expect(toVenue(row([of("Equipo A"), of("Equipo B"), of("Equipo A")])).usedBy).toEqual(["Equipo A", "Equipo B"]);
  });

  it("van por nombre, como se lee en español, no en el orden en que llegan", () => {
    expect(toVenue(row([of("Equipo Z"), of("equipo b"), of("Équipo A"), of("Equipo Ñ")])).usedBy).toEqual([
      "Équipo A",
      "equipo b",
      "Equipo Ñ",
      "Equipo Z",
    ]);
  });

  it("el equipo se lee igual si la relación llega como objeto o como lista de un elemento", () => {
    expect(toVenue(row([{ teams: [{ name: "Equipo A" }] }, { teams: { name: "Equipo B" } }])).usedBy).toEqual([
      "Equipo A",
      "Equipo B",
    ]);
  });

  it("un horario cuyo equipo no llega no cuenta", () => {
    expect(toVenue(row([{ teams: null }, { teams: [] }])).usedBy).toEqual([]);
  });

  it("sin horarios (la relación vacía o ausente) no la usa nadie", () => {
    expect(toVenue(row([])).usedBy).toEqual([]);
    expect(toVenue(row(null)).usedBy).toEqual([]);
  });
});

describe("toTeamSchedule", () => {
  it("pasa de las columnas de la base a los nombres del módulo", () => {
    expect(
      toTeamSchedule(scheduleRow(1, 2, "18:00:00", { duration_minutes: 90, venue_id: VENUE, venues: { name: "Pista 1" } })),
    ).toEqual({
      id: uuid(1),
      teamId: TEAM,
      weekday: 2,
      startTime: "18:00",
      durationMinutes: 90,
      venueId: VENUE,
      venueName: "Pista 1",
    });
  });

  it.each([
    ["18:00:00", "18:00"],
    ["09:05:00", "09:05"],
    ["00:00:00", "00:00"],
    ["18:00", "18:00"],
  ])("la hora de la base %s se recorta a `HH:mm`: %s", (stored, shown) => {
    expect(toTeamSchedule(scheduleRow(1, 2, stored)).startTime).toBe(shown);
  });

  it("la pista se lee igual si la relación llega como objeto o como lista de un elemento", () => {
    const asObject = toTeamSchedule(scheduleRow(1, 2, "18:00:00", { venue_id: VENUE, venues: { name: "Pista 1" } }));
    const asList = toTeamSchedule(scheduleRow(1, 2, "18:00:00", { venue_id: VENUE, venues: [{ name: "Pista 1" }] }));

    expect(asObject.venueName).toBe("Pista 1");
    expect(asList).toEqual(asObject);
  });

  it("sin pista, ni id ni nombre", () => {
    expect(toTeamSchedule(scheduleRow(1, 2, "18:00:00"))).toMatchObject({ venueId: null, venueName: null });
  });

  it("con la relación como lista vacía, sin nombre", () => {
    expect(toTeamSchedule(scheduleRow(1, 2, "18:00:00", { venue_id: VENUE, venues: [] })).venueName).toBeNull();
  });
});

describe("toTeamScheduleList", () => {
  it("ordena de lunes a domingo y, el mismo día, por hora", () => {
    const list = toTeamScheduleList([
      scheduleRow(1, 4, "19:30:00"),
      scheduleRow(2, 2, "18:00:00"),
      scheduleRow(3, 7, "10:00:00"),
      scheduleRow(4, 2, "09:00:00"),
    ]);

    expect(list.map((item) => `${item.weekday} ${item.startTime}`)).toEqual([
      "2 09:00",
      "2 18:00",
      "4 19:30",
      "7 10:00",
    ]);
  });

  it("a igualdad de día y hora, por id", () => {
    const list = toTeamScheduleList([scheduleRow(9, 2, "18:00:00"), scheduleRow(3, 2, "18:00:00")]);

    expect(list.map((item) => item.id)).toEqual([uuid(3), uuid(9)]);
  });

  it("no cambia la lista que recibe", () => {
    const rows = [scheduleRow(1, 4, "19:30:00"), scheduleRow(2, 2, "18:00:00")];

    toTeamScheduleList(rows);

    expect(rows.map((row) => row.id)).toEqual([uuid(1), uuid(2)]);
  });

  it("sin horarios, una lista vacía", () => {
    expect(toTeamScheduleList([])).toEqual([]);
  });
});

describe("toSeasonSchedules", () => {
  it("cada equipo lleva su id, su nombre, su categoría y sus horarios ya ordenados", () => {
    const [team] = toSeasonSchedules([
      teamRow(1, "Equipo A", { name: "Categoría A", sort: 10 }, [
        scheduleRow(11, 4, "19:30:00"),
        scheduleRow(12, 2, "18:00:00", { venue_id: VENUE, venues: { name: "Pista 1" } }),
      ]),
    ]);

    expect(team).toEqual({
      teamId: uuid(1),
      teamName: "Equipo A",
      categoryName: "Categoría A",
      schedules: [
        { id: uuid(12), teamId: TEAM, weekday: 2, startTime: "18:00", durationMinutes: 75, venueId: VENUE, venueName: "Pista 1" },
        { id: uuid(11), teamId: TEAM, weekday: 4, startTime: "19:30", durationMinutes: 75, venueId: null, venueName: null },
      ],
    });
  });

  it("un equipo sin horarios también sale, con su lista vacía", () => {
    expect(toSeasonSchedules([teamRow(1, "Equipo A", { name: "Categoría A", sort: 10 }, [])])[0]?.schedules).toEqual([]);
    expect(toSeasonSchedules([teamRow(1, "Equipo A", { name: "Categoría A", sort: 10 }, null)])[0]?.schedules).toEqual([]);
  });

  it("la categoría se lee igual si llega como objeto o como lista de un elemento", () => {
    const asObject = toSeasonSchedules([teamRow(1, "Equipo A", { name: "Categoría A", sort: 10 })]);
    const asList = toSeasonSchedules([
      { id: uuid(1), name: "Equipo A", categories: [{ name: "Categoría A", sort: 10 }], team_schedules: [] },
    ]);

    expect(asList).toEqual(asObject);
    expect(asList[0]?.categoryName).toBe("Categoría A");
  });

  it("los equipos van por el orden de su categoría, no por su nombre", () => {
    const teams = toSeasonSchedules([
      teamRow(1, "Equipo A", { name: "Categoría mayor", sort: 30 }),
      teamRow(2, "Equipo Z", { name: "Categoría menor", sort: 10 }),
      teamRow(3, "Equipo M", { name: "Categoría media", sort: 20 }),
    ]);

    expect(teams.map((team) => team.teamName)).toEqual(["Equipo Z", "Equipo M", "Equipo A"]);
  });

  it("con el mismo orden, por el nombre de la categoría", () => {
    const teams = toSeasonSchedules([
      teamRow(1, "Equipo A", { name: "Categoría B", sort: 10 }),
      teamRow(2, "Equipo B", { name: "Categoría A", sort: 10 }),
    ]);

    expect(teams.map((team) => team.categoryName)).toEqual(["Categoría A", "Categoría B"]);
  });

  it("dentro de una categoría, por nombre, como se lee en español", () => {
    const category = { name: "Categoría A", sort: 10 };
    const teams = toSeasonSchedules([
      teamRow(1, "Equipo Z", category),
      teamRow(2, "equipo b", category),
      teamRow(3, "Équipo A", category),
      teamRow(4, "Equipo Ñ", category),
    ]);

    expect(teams.map((team) => team.teamName)).toEqual(["Équipo A", "equipo b", "Equipo Ñ", "Equipo Z"]);
  });

  it("dos equipos que se llaman igual en la misma categoría, por id: el orden es estable", () => {
    const category = { name: "Categoría A", sort: 10 };
    const teams = toSeasonSchedules([teamRow(7, "Equipo A", category), teamRow(3, "Equipo A", category)]);

    expect(teams.map((team) => team.teamId)).toEqual([uuid(3), uuid(7)]);
  });

  it("un equipo sin categoría sale con el nombre de categoría vacío, delante de los demás", () => {
    const teams = toSeasonSchedules([
      teamRow(1, "Equipo A", { name: "Categoría A", sort: 10 }),
      teamRow(2, "Equipo B", null),
    ]);

    expect(teams.map((team) => [team.teamName, team.categoryName])).toEqual([
      ["Equipo B", ""],
      ["Equipo A", "Categoría A"],
    ]);
  });

  it("sin equipos, una lista vacía", () => {
    expect(toSeasonSchedules([])).toEqual([]);
  });
});
