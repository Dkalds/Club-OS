import { describe, expect, it } from "vitest";
import {
  bySlot,
  endTime,
  practiceCount,
  scheduleLabel,
  timeLabel,
  timeRange,
  WEEKDAY_LABEL,
  WEEKDAY_OPTIONS,
} from "./format";
import type { TeamSchedule } from "./types";

// Datos neutros y ficticios: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function schedule(n: number, weekday: number, startTime: string, overrides: Partial<TeamSchedule> = {}): TeamSchedule {
  return {
    id: uuid(n),
    teamId: uuid(100),
    weekday,
    startTime,
    durationMinutes: 75,
    venueId: null,
    venueName: null,
    ...overrides,
  };
}

describe("los días de la semana", () => {
  it("van por su número ISO: 1 es lunes y 7, domingo", () => {
    expect(WEEKDAY_LABEL).toEqual({
      1: "Lunes",
      2: "Martes",
      3: "Miércoles",
      4: "Jueves",
      5: "Viernes",
      6: "Sábado",
      7: "Domingo",
    });
  });

  it("el 0 no es ningún día: el domingo es el 7", () => {
    expect(WEEKDAY_LABEL[0]).toBeUndefined();
    expect(WEEKDAY_LABEL[8]).toBeUndefined();
  });

  it("las opciones del selector son los siete, de lunes a domingo, con el número como texto", () => {
    expect(WEEKDAY_OPTIONS).toEqual([
      { value: "1", label: "Lunes" },
      { value: "2", label: "Martes" },
      { value: "3", label: "Miércoles" },
      { value: "4", label: "Jueves" },
      { value: "5", label: "Viernes" },
      { value: "6", label: "Sábado" },
      { value: "7", label: "Domingo" },
    ]);
  });
});

describe("timeLabel", () => {
  it.each([
    ["18:00:00", "18:00"],
    ["09:05:00", "09:05"],
    ["00:00:00", "00:00"],
    ["23:59:59", "23:59"],
  ])("la hora de la base %s es «%s» en un campo de hora", (time, label) => {
    expect(timeLabel(time)).toBe(label);
  });

  it("una hora que ya viene como `HH:mm` se queda igual", () => {
    expect(timeLabel("18:00")).toBe("18:00");
  });
});

describe("endTime", () => {
  it.each([
    ["18:00", 75, "19:15"],
    ["09:05", 55, "10:00"],
    ["10:00", 15, "10:15"],
    ["10:00", 240, "14:00"],
    ["00:00", 0, "00:00"],
  ])("lo que empieza a las %s y dura %i min acaba a las %s", (start, minutes, end) => {
    expect(endTime(start, minutes)).toBe(end);
  });

  it.each([
    ["23:30", 60, "00:30"],
    ["23:00", 60, "00:00"],
    ["22:00", 240, "02:00"],
    ["23:59", 1, "00:00"],
  ])("cruza la medianoche: de las %s, %i min después son las %s", (start, minutes, end) => {
    expect(endTime(start, minutes)).toBe(end);
  });

  it("escribe siempre dos cifras en la hora y en los minutos", () => {
    expect(endTime("08:00", 65)).toBe("09:05");
  });
});

describe("timeRange", () => {
  it("es «inicio–fin», con raya corta y sin espacios", () => {
    expect(timeRange("18:00", 75)).toBe("18:00–19:15");
    expect(timeRange("18:00", 75)).toContain("–");
    expect(timeRange("18:00", 75)).not.toMatch(/[-— ]/);
  });

  it("cruzando la medianoche el fin es la hora del reloj, sin el día", () => {
    expect(timeRange("23:30", 60)).toBe("23:30–00:30");
  });
});

describe("scheduleLabel", () => {
  it("con pista: el día, la franja y la pista, separados por un punto medio", () => {
    expect(scheduleLabel(schedule(1, 2, "18:00", { venueId: uuid(9), venueName: "Pista 1" }))).toBe(
      "Martes · 18:00–19:15 · Pista 1",
    );
  });

  it("sin pista, sin su parte y sin separador suelto", () => {
    expect(scheduleLabel(schedule(1, 2, "18:00"))).toBe("Martes · 18:00–19:15");
  });

  it("le basta con el día, la hora, la duración y el nombre de la pista", () => {
    expect(scheduleLabel({ weekday: 7, startTime: "10:30", durationMinutes: 90, venueName: null })).toBe(
      "Domingo · 10:30–12:00",
    );
  });

  it("un día que no existe no deja un separador delante de la franja", () => {
    expect(scheduleLabel({ weekday: 9, startTime: "10:30", durationMinutes: 90, venueName: null })).toBe("10:30–12:00");
  });
});

describe("bySlot", () => {
  it("ordena por día, de lunes a domingo", () => {
    const sorted = [schedule(1, 7, "10:00"), schedule(2, 1, "20:00"), schedule(3, 4, "09:00")].sort(bySlot);

    expect(sorted.map((item) => item.weekday)).toEqual([1, 4, 7]);
  });

  it("el mismo día, por hora", () => {
    const sorted = [schedule(1, 2, "19:30"), schedule(2, 2, "09:00"), schedule(3, 2, "18:00")].sort(bySlot);

    expect(sorted.map((item) => item.startTime)).toEqual(["09:00", "18:00", "19:30"]);
  });

  it("a igualdad de día y hora, por id: el orden no depende de cómo lleguen", () => {
    const a = schedule(1, 2, "18:00");
    const b = schedule(2, 2, "18:00");

    expect([b, a].sort(bySlot).map((item) => item.id)).toEqual([a.id, b.id]);
    expect([a, b].sort(bySlot).map((item) => item.id)).toEqual([a.id, b.id]);
  });

  it("el día manda sobre la hora", () => {
    const sorted = [schedule(1, 3, "08:00"), schedule(2, 2, "21:00")].sort(bySlot);

    expect(sorted.map((item) => item.id)).toEqual([uuid(2), uuid(1)]);
  });
});

describe("practiceCount", () => {
  it.each([
    [1, "1 entrenamiento"],
    [0, "0 entrenamientos"],
    [2, "2 entrenamientos"],
    [32, "32 entrenamientos"],
  ])("%i es «%s»", (count, label) => {
    expect(practiceCount(count)).toBe(label);
  });
});
