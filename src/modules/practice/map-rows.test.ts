import { describe, expect, it } from "vitest";
import {
  toPracticeDetail,
  toPracticeListItems,
  toStaffTeamOptions,
  toTeamOptions,
  type PracticeDetailRow,
  type PracticeListRow,
  type PracticePlanRow,
  type StaffTeamRow,
} from "./map-rows";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

const MADRID = { timezone: "Europe/Madrid", canManage: true };

// Tres Standards (uno por número) y dos ejercicios que comparten el segundo. El tercero está en
// borrador: a quien entrena se lo esconde RLS, pero la dirección lo ve, y no se enseña.
const STANDARD_1 = { id: "std-1", number: 1, title: "COMPETIR", description: "Se compite siempre.", status: "published" } as const;
const STANDARD_2 = { id: "std-2", number: 2, title: "COMUNICAR", description: "Se habla en cada acción.", status: "published" } as const;
const STANDARD_3 = { id: "std-3", number: 3, title: "AYUDAR", description: "Borrador.", status: "draft" } as const;

const SHOWN_1 = { id: "std-1", number: 1, title: "COMPETIR", description: "Se compite siempre." };
const SHOWN_2 = { id: "std-2", number: 2, title: "COMUNICAR", description: "Se habla en cada acción." };

const DRILL_A = {
  title: "Rueda de tiros",
  drill_standards: [{ standards: STANDARD_2 }, { standards: STANDARD_1 }],
};
const DRILL_B = {
  title: "Finalizaciones 1x0",
  // El tercer vínculo apunta a un Standard que RLS no deja ver: llega `null`.
  drill_standards: [{ standards: STANDARD_2 }, { standards: STANDARD_3 }, { standards: null }],
};

// Los mismos ejercicios con cada relación como lista de uno (y vacía donde llegaba `null`).
const DRILL_A_AS_LISTS = {
  title: DRILL_A.title,
  drill_standards: [{ standards: [STANDARD_2] }, { standards: [STANDARD_1] }],
};
const DRILL_B_AS_LISTS = {
  title: DRILL_B.title,
  drill_standards: [{ standards: [STANDARD_2] }, { standards: [STANDARD_3] }, { standards: [] }],
};

// Tres ítems en desorden de `sort`: el 0 con ejercicio y sin título propio, el 1 con ejercicio
// y título propio, el 2 un bloque libre.
const ITEM_FREE = {
  id: "item-c",
  sort: 2,
  phase: "Táctica",
  drill_id: null,
  title_override: "Bloque libre",
  minutes: 15,
  notes: null,
  drills: null,
};
const ITEM_FIRST = {
  id: "item-a",
  sort: 0,
  phase: "Técnica",
  drill_id: "drill-a",
  title_override: null,
  minutes: 20,
  notes: "Por parejas",
  drills: DRILL_A,
};
const ITEM_SECOND = {
  id: "item-b",
  sort: 1,
  phase: null,
  drill_id: "drill-b",
  title_override: "Título propio",
  minutes: 25,
  notes: null,
  drills: DRILL_B,
};

const PLAN: PracticePlanRow = {
  id: "plan-1",
  title: "Transición + rebote defensivo",
  notes: "Llevar petos",
  updated_at: "2026-11-10T09:30:00.123456+00:00",
  primary_focus: { id: "focus-1", name: "Defensa" },
  secondary_focus: { id: "focus-2", name: "Rebote" },
  practice_items: [ITEM_FREE, ITEM_FIRST, ITEM_SECOND],
};

function detailRow(overrides: Partial<PracticeDetailRow> = {}): PracticeDetailRow {
  return {
    id: "event-1",
    team_id: "team-a",
    status: "scheduled",
    starts_at: "2026-11-17T17:00:00+00:00",
    ends_at: "2026-11-17T18:15:00+00:00",
    location: "Pabellón 2",
    teams: { name: "Equipo A" },
    practice_plans: PLAN,
    ...overrides,
  };
}

/** La misma fila con `overrides` en el plan. */
function withPlan(overrides: Partial<PracticePlanRow>): PracticeDetailRow {
  return detailRow({ practice_plans: { ...PLAN, ...overrides } });
}

describe("toPracticeDetail", () => {
  it("arma el entrenamiento: ítems en su orden, Standards sin repetir y solo los publicados", () => {
    const detail = toPracticeDetail(detailRow(), MADRID);

    expect(detail).toEqual({
      eventId: "event-1",
      planId: "plan-1",
      teamId: "team-a",
      teamName: "Equipo A",
      status: "scheduled",
      startsAt: "2026-11-17T17:00:00+00:00",
      endsAt: "2026-11-17T18:15:00+00:00",
      slotLabel: "Martes 17 nov · 18:00–19:15",
      location: "Pabellón 2",
      title: "Transición + rebote defensivo",
      primaryFocus: { id: "focus-1", name: "Defensa" },
      secondaryFocus: { id: "focus-2", name: "Rebote" },
      notes: "Llevar petos",
      items: [
        { id: "item-a", drillId: "drill-a", title: "Rueda de tiros", phase: "Técnica", minutes: 20, notes: "Por parejas" },
        { id: "item-b", drillId: "drill-b", title: "Título propio", phase: null, minutes: 25, notes: null },
        { id: "item-c", drillId: null, title: "Bloque libre", phase: "Táctica", minutes: 15, notes: null },
      ],
      standards: [SHOWN_1, SHOWN_2],
      updatedAt: "2026-11-10T09:30:00.123456+00:00",
      canEdit: true,
    });
  });

  it("el título del ítem es el propio y, sin él, el del ejercicio; sin ninguno, «Ejercicio»", () => {
    const hiddenDrill = { ...ITEM_FIRST, id: "item-d", sort: 3, drill_id: "drill-x", drills: null };
    const detail = toPracticeDetail(
      withPlan({ practice_items: [ITEM_FIRST, ITEM_SECOND, hiddenDrill] }),
      MADRID,
    );

    expect(detail?.items.map((item) => item.title)).toEqual([
      "Rueda de tiros",
      "Título propio",
      "Ejercicio",
    ]);
  });

  it("ordena los Standards por número y cuenta cada uno una vez aunque varios ejercicios lo traigan", () => {
    const sameDrillTwice = { ...ITEM_FIRST, id: "item-e", sort: 4 };
    const detail = toPracticeDetail(
      withPlan({ practice_items: [ITEM_SECOND, ITEM_FIRST, sameDrillTwice] }),
      MADRID,
    );

    expect(detail?.standards).toEqual([SHOWN_1, SHOWN_2]);
  });

  it("lee las relaciones embebidas igual como objeto que como lista de uno", () => {
    const asLists = toPracticeDetail(
      detailRow({
        teams: [{ name: "Equipo A" }],
        practice_plans: [
          {
            ...PLAN,
            primary_focus: [{ id: "focus-1", name: "Defensa" }],
            secondary_focus: [{ id: "focus-2", name: "Rebote" }],
            practice_items: [
              { ...ITEM_FREE, drills: [] },
              { ...ITEM_FIRST, drills: [DRILL_A_AS_LISTS] },
              { ...ITEM_SECOND, drills: [DRILL_B_AS_LISTS] },
            ],
          },
        ],
      }),
      MADRID,
    );

    expect(asLists).toEqual(toPracticeDetail(detailRow(), MADRID));
    expect(asLists?.items).toHaveLength(3);
  });

  it("sin plan (null o lista vacía) no hay entrenamiento", () => {
    expect(toPracticeDetail(detailRow({ practice_plans: null }), MADRID)).toBeNull();
    expect(toPracticeDetail(detailRow({ practice_plans: [] }), MADRID)).toBeNull();
  });

  it("sin focos, lugar ni notas los deja a null; sin ítems, listas vacías", () => {
    const detail = toPracticeDetail(
      {
        ...withPlan({ primary_focus: null, secondary_focus: null, notes: null, practice_items: null }),
        location: null,
      },
      MADRID,
    );

    expect(detail).toMatchObject({
      primaryFocus: null,
      secondaryFocus: null,
      notes: null,
      location: null,
      items: [],
      standards: [],
    });
  });

  it("solo el foco secundario puede faltar", () => {
    const detail = toPracticeDetail(withPlan({ secondary_focus: null }), MADRID);

    expect(detail?.primaryFocus).toEqual({ id: "focus-1", name: "Defensa" });
    expect(detail?.secondaryFocus).toBeNull();
  });

  it("deja el nombre del equipo vacío si no llega la fila del equipo", () => {
    expect(toPracticeDetail(detailRow({ teams: null }), MADRID)?.teamName).toBe("");
    expect(toPracticeDetail(detailRow({ teams: [] }), MADRID)?.teamName).toBe("");
  });

  it("la hora sale en la zona del club, no en la del dispositivo", () => {
    const detail = toPracticeDetail(detailRow(), { timezone: "America/Mexico_City", canManage: true });

    expect(detail?.slotLabel).toBe("Martes 17 nov · 11:00–12:15");
  });

  it("solo se edita lo programado, y solo con permiso para gestionar sesiones", () => {
    const edit = (status: PracticeDetailRow["status"], canManage: boolean) =>
      toPracticeDetail(detailRow({ status }), { timezone: "Europe/Madrid", canManage })?.canEdit;

    expect(edit("scheduled", true)).toBe(true);
    expect(edit("scheduled", false)).toBe(false);
    expect(edit("done", true)).toBe(false);
    expect(edit("cancelled", true)).toBe(false);
  });

  it("no cambia la lista de ítems que recibe", () => {
    const items = [ITEM_FREE, ITEM_FIRST, ITEM_SECOND];
    toPracticeDetail(withPlan({ practice_items: items }), MADRID);

    expect(items.map((item) => item.id)).toEqual(["item-c", "item-a", "item-b"]);
  });
});

describe("toPracticeListItems", () => {
  const TEAMS = [
    { id: "team-a", name: "Equipo A" },
    { id: "team-b", name: "Equipo B" },
  ];

  const PLAN = {
    title: "Transición + rebote defensivo",
    practice_items: [{ minutes: 20 }, { minutes: 25 }, { minutes: 15 }],
  };

  function listRow(overrides: Partial<PracticeListRow> = {}): PracticeListRow {
    return {
      id: "event-1",
      team_id: "team-a",
      status: "scheduled",
      starts_at: "2026-11-17T17:00:00+00:00",
      location: "Pabellón 2",
      practice_plans: PLAN,
      ...overrides,
    };
  }

  it("da el día y la hora en la zona del club, el equipo y el título, los minutos, los ejercicios y el lugar", () => {
    expect(toPracticeListItems([listRow()], TEAMS, "Europe/Madrid")).toEqual([
      {
        eventId: "event-1",
        teamName: "Equipo A",
        dow: "Mar",
        day: "17",
        time: "18:00",
        title: "Transición + rebote defensivo",
        totalMinutes: 60,
        itemCount: 3,
        status: "scheduled",
        location: "Pabellón 2",
      },
    ]);
  });

  it("un entrenamiento sin lugar lo deja en null, tal cual", () => {
    const [item] = toPracticeListItems([listRow({ location: null })], TEAMS, "Europe/Madrid");

    expect(item?.location).toBeNull();
  });

  it("el día puede cambiar con la zona: las 23:30 UTC ya son del día siguiente en Madrid", () => {
    const [item] = toPracticeListItems(
      [listRow({ starts_at: "2026-11-17T23:30:00+00:00" })],
      TEAMS,
      "Europe/Madrid",
    );

    expect(item).toMatchObject({ dow: "Mié", day: "18", time: "00:30" });
  });

  it("sin plan (null, lista vacía o sin ítems) es «Entrenamiento sin plan», con 0 min y 0 ejercicios", () => {
    const items = toPracticeListItems(
      [
        listRow({ id: "a", practice_plans: null }),
        listRow({ id: "b", practice_plans: [] }),
        listRow({ id: "c", practice_plans: { title: "Con título", practice_items: null } }),
      ],
      TEAMS,
      "Europe/Madrid",
    );

    expect(items.map((item) => [item.title, item.totalMinutes, item.itemCount])).toEqual([
      ["Entrenamiento sin plan", 0, 0],
      ["Entrenamiento sin plan", 0, 0],
      ["Con título", 0, 0],
    ]);
  });

  it("lee el plan igual como objeto que como lista de uno", () => {
    const asObjects = toPracticeListItems([listRow()], TEAMS, "Europe/Madrid");
    const asLists = toPracticeListItems([listRow({ practice_plans: [PLAN] })], TEAMS, "Europe/Madrid");

    expect(asLists).toEqual(asObjects);
  });

  it("respeta el orden de las filas y el estado de cada una", () => {
    const items = toPracticeListItems(
      [
        listRow({ id: "b", team_id: "team-b", status: "done" }),
        listRow({ id: "a", status: "cancelled" }),
      ],
      TEAMS,
      "Europe/Madrid",
    );

    expect(items.map((item) => [item.eventId, item.teamName, item.status])).toEqual([
      ["b", "Equipo B", "done"],
      ["a", "Equipo A", "cancelled"],
    ]);
  });

  it("sin filas no hay entrenamientos", () => {
    expect(toPracticeListItems([], TEAMS, "Europe/Madrid")).toEqual([]);
  });
});

describe("toTeamOptions", () => {
  it("deja solo id y nombre, por nombre y, a igual nombre, por id", () => {
    const rows = [
      { id: "team-3", name: "Equipo B", seasons: { is_current: true } },
      { id: "team-2", name: "Equipo B", seasons: { is_current: true } },
      { id: "team-1", name: "Equipo A", seasons: { is_current: true } },
    ];

    expect(toTeamOptions(rows)).toEqual([
      { id: "team-1", name: "Equipo A" },
      { id: "team-2", name: "Equipo B" },
      { id: "team-3", name: "Equipo B" },
    ]);
  });

  it("sin filas no hay equipos", () => {
    expect(toTeamOptions([])).toEqual([]);
  });
});

describe("toStaffTeamOptions", () => {
  it("lee el equipo igual como objeto que como lista de uno, y ordena por nombre", () => {
    const rows: StaffTeamRow[] = [
      { teams: { id: "team-b", name: "Equipo B" } },
      { teams: [{ id: "team-a", name: "Equipo A" }] },
    ];

    expect(toStaffTeamOptions(rows)).toEqual([
      { id: "team-a", name: "Equipo A" },
      { id: "team-b", name: "Equipo B" },
    ]);
  });

  it("salta las filas sin equipo", () => {
    const rows: StaffTeamRow[] = [{ teams: null }, { teams: [] }, { teams: { id: "team-a", name: "Equipo A" } }];

    expect(toStaffTeamOptions(rows)).toEqual([{ id: "team-a", name: "Equipo A" }]);
  });
});
