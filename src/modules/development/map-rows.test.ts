import { describe, expect, it } from "vitest";
import { toGoalFormOptions, toPlayerProfile, type GoalRow, type NoteRow, type PlayerRow } from "./map-rows";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TZ = "Europe/Madrid";
const ME = uuid(900);
const OTHER = uuid(901);

const player: PlayerRow = {
  jersey_number: 7,
  position: "Base",
  people: { id: uuid(1), first_name: "Ana", last_name: "Pino" },
  teams: [{ id: uuid(2), name: "Equipo A", categories: { name: "Categoría" } }],
};

const goal = (n: number, status: GoalRow["status"], extra: Partial<GoalRow> = {}): GoalRow => ({
  id: uuid(100 + n),
  title: `Objetivo ${n}`,
  description: null,
  status,
  achieved_at: status === "achieved" ? "2026-10-06T16:00:00Z" : null,
  created_at: `2026-09-${String(10 + n).padStart(2, "0")}T10:00:00Z`,
  focus_areas: null,
  standards: null,
  ...extra,
});

const note = (n: number, author: string, extra: Partial<NoteRow> = {}): NoteRow => ({
  id: uuid(200 + n),
  body: `Nota ${n}`,
  visibility: "private",
  created_at: `2026-10-0${n}T18:00:00Z`,
  updated_at: `2026-10-0${n}T18:00:00Z`,
  author_id: author,
  author: { first_name: "Eva", last_name: "Luz" },
  ...extra,
});

describe("toPlayerProfile", () => {
  it("el jugador con su equipo y su categoría, sin año de nacimiento", () => {
    const profile = toPlayerProfile({ player, goals: [], notes: [], userId: ME, timezone: TZ });

    expect(profile).toEqual({
      personId: uuid(1),
      firstName: "Ana",
      lastName: "Pino",
      jerseyNumber: 7,
      position: "Base",
      team: { id: uuid(2), name: "Equipo A", categoryName: "Categoría" },
      activeGoals: [],
      pastGoals: [],
      notes: [],
    });
    expect(JSON.stringify(profile)).not.toMatch(/birth/);
  });

  it("sin persona o sin equipo (RLS no los deja ver): null", () => {
    expect(toPlayerProfile({ player: { ...player, people: null }, goals: [], notes: [], userId: ME, timezone: TZ })).toBeNull();
    expect(toPlayerProfile({ player: { ...player, teams: [] }, goals: [], notes: [], userId: ME, timezone: TZ })).toBeNull();
  });

  it("activos por antigüedad; el historial con los logrados y archivados, lo último primero", () => {
    const profile = toPlayerProfile({
      player,
      goals: [
        goal(3, "active"),
        goal(1, "achieved", { achieved_at: "2026-10-01T10:00:00Z" }),
        goal(2, "active"),
        goal(4, "archived"),
        goal(5, "achieved", { achieved_at: "2026-10-06T21:30:00Z" }),
      ],
      notes: [],
      userId: ME,
      timezone: TZ,
    });

    expect(profile?.activeGoals.map((g) => g.title)).toEqual(["Objetivo 2", "Objetivo 3"]);
    expect(profile?.pastGoals.map((g) => g.title)).toEqual(["Objetivo 5", "Objetivo 1", "Objetivo 4"]);
    // La fecha de logro, en la zona del club: las 21:30 UTC del 6 son ya el 6 en Madrid (23:30).
    expect(profile?.pastGoals[0]?.achievedOn).toBe("Martes 6 oct");
    expect(profile?.pastGoals[2]?.achievedOn).toBeNull();
  });

  it("lo que trabaja cada objetivo: su foco y su Standard (regla 8)", () => {
    const profile = toPlayerProfile({
      player,
      goals: [
        goal(1, "active", {
          focus_areas: [{ id: uuid(300), name: "Técnica" }],
          standards: { id: uuid(301), number: 4, title: "Bote con las dos manos" },
        }),
      ],
      notes: [],
      userId: ME,
      timezone: TZ,
    });

    expect(profile?.activeGoals[0]).toMatchObject({
      focus: { id: uuid(300), name: "Técnica" },
      standard: { id: uuid(301), number: 4, title: "Bote con las dos manos" },
    });
  });

  it("notas de la más reciente a la más antigua; solo las mías se editan", () => {
    const profile = toPlayerProfile({
      player,
      goals: [],
      notes: [
        note(1, ME),
        note(3, OTHER, { visibility: "staff", author: null }),
        note(2, ME, { updated_at: "2026-10-04T09:00:00Z" }),
      ],
      userId: ME,
      timezone: TZ,
    });

    expect(profile?.notes).toEqual([
      {
        id: uuid(203),
        body: "Nota 3",
        visibility: "staff",
        writtenOn: "Sábado 3 oct",
        edited: false,
        authorName: null,
        isMine: false,
      },
      {
        id: uuid(202),
        body: "Nota 2",
        visibility: "private",
        writtenOn: "Viernes 2 oct",
        edited: true,
        authorName: "Eva Luz",
        isMine: true,
      },
      {
        id: uuid(201),
        body: "Nota 1",
        visibility: "private",
        writtenOn: "Jueves 1 oct",
        edited: false,
        authorName: "Eva Luz",
        isMine: true,
      },
    ]);
  });
});

describe("toGoalFormOptions", () => {
  it("los focos en su orden y los Standards por número", () => {
    expect(
      toGoalFormOptions(
        [{ id: uuid(1), name: "Técnica" }],
        [
          { id: uuid(3), number: 7, title: "Siete" },
          { id: uuid(2), number: 2, title: "Dos" },
        ],
      ),
    ).toEqual({
      focusAreas: [{ id: uuid(1), name: "Técnica" }],
      standards: [
        { id: uuid(2), number: 2, title: "Dos" },
        { id: uuid(3), number: 7, title: "Siete" },
      ],
    });
  });
});
