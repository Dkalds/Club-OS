import { describe, expect, it } from "vitest";
import { seedSchedule, slotOnSameDay } from "./dates";

const MADRID = "Europe/Madrid";

describe("seedSchedule", () => {
  // Viernes 2 oct 2026, 12:00 en Madrid (UTC+2).
  const friday = new Date("2026-10-02T10:00:00Z");

  it("upcoming: los dos siguientes martes/jueves 18:00–19:15", () => {
    const { upcoming } = seedSchedule(friday, MADRID);
    expect(upcoming).toEqual([
      { startsAt: "2026-10-06T16:00:00.000Z", endsAt: "2026-10-06T17:15:00.000Z" },
      { startsAt: "2026-10-08T16:00:00.000Z", endsAt: "2026-10-08T17:15:00.000Z" },
    ]);
  });

  it("game: el siguiente sábado 10:30–12:00", () => {
    const { game } = seedSchedule(friday, MADRID);
    expect(game).toEqual({
      startsAt: "2026-10-03T08:30:00.000Z",
      endsAt: "2026-10-03T10:00:00.000Z",
    });
  });

  it("past: los cuatro martes/jueves más recientes, del más reciente al más antiguo", () => {
    const { past } = seedSchedule(friday, MADRID);
    // 1 oct (jue), 29 sep (mar), 24 sep (jue), 22 sep (mar).
    expect(past.map((slot) => slot.startsAt)).toEqual([
      "2026-10-01T16:00:00.000Z",
      "2026-09-29T16:00:00.000Z",
      "2026-09-24T16:00:00.000Z",
      "2026-09-22T16:00:00.000Z",
    ]);
    expect(past.map((slot) => slot.endsAt)).toEqual([
      "2026-10-01T17:15:00.000Z",
      "2026-09-29T17:15:00.000Z",
      "2026-09-24T17:15:00.000Z",
      "2026-09-22T17:15:00.000Z",
    ]);
  });

  it("después del cambio de hora (25 oct 2026) sigue siendo las 18:00 en Madrid", () => {
    // Viernes 23 oct: martes 27 oct ya es horario de invierno (UTC+1).
    const { upcoming, game } = seedSchedule(
      new Date("2026-10-23T10:00:00Z"),
      MADRID,
    );
    expect(upcoming[0].startsAt).toBe("2026-10-27T17:00:00.000Z");
    expect(upcoming[0].endsAt).toBe("2026-10-27T18:15:00.000Z");
    // Sábado 24 oct: todavía horario de verano (UTC+2).
    expect(game.startsAt).toBe("2026-10-24T08:30:00.000Z");
  });

  it("el domingo del cambio de hora: lo pasado en horario de verano, lo futuro en invierno", () => {
    // Domingo 25 oct, ya en UTC+1: jue 22 oct (UTC+2) queda atrás, mar 27 oct (UTC+1) delante.
    const { past, upcoming } = seedSchedule(
      new Date("2026-10-25T12:00:00Z"),
      MADRID,
    );
    expect(past[0].startsAt).toBe("2026-10-22T16:00:00.000Z");
    expect(upcoming[0].startsAt).toBe("2026-10-27T17:00:00.000Z");
  });

  it("después del cambio de hora de primavera (29 mar 2026) vuelve a UTC+2", () => {
    // Viernes 27 mar 2026: martes 31 mar ya es horario de verano.
    const { upcoming } = seedSchedule(new Date("2026-03-27T10:00:00Z"), MADRID);
    expect(upcoming[0].startsAt).toBe("2026-03-31T16:00:00.000Z");
  });

  it("compara el inicio del slot, estrictamente: martes a las 17:59 locales, la sesión de hoy es futura", () => {
    // Martes 6 oct 17:59:59 en Madrid = 15:59:59Z.
    const { upcoming, past } = seedSchedule(
      new Date("2026-10-06T15:59:59Z"),
      MADRID,
    );
    expect(upcoming[0].startsAt).toBe("2026-10-06T16:00:00.000Z");
    expect(past[0].startsAt).toBe("2026-10-01T16:00:00.000Z");
  });

  it("compara el inicio del slot, estrictamente: martes a las 18:01 locales, la sesión de hoy ya es pasada", () => {
    const { upcoming, past } = seedSchedule(
      new Date("2026-10-06T16:01:00Z"),
      MADRID,
    );
    expect(upcoming[0].startsAt).toBe("2026-10-08T16:00:00.000Z");
    expect(past[0].startsAt).toBe("2026-10-06T16:00:00.000Z");
  });

  it("el sábado después de las 10:30 locales el partido es el del sábado siguiente", () => {
    // Sábado 3 oct 12:00 en Madrid.
    const { game } = seedSchedule(new Date("2026-10-03T10:00:00Z"), MADRID);
    expect(game.startsAt).toBe("2026-10-10T08:30:00.000Z");
  });

  it("usa el día de la zona, no el de UTC", () => {
    // Domingo 4 oct 00:30 en Madrid = sábado 3 oct 22:30Z. El sábado local ya pasó.
    const { game, past } = seedSchedule(new Date("2026-10-03T22:30:00Z"), MADRID);
    expect(game.startsAt).toBe("2026-10-10T08:30:00.000Z");
    expect(past[0].startsAt).toBe("2026-10-01T16:00:00.000Z");
  });

  it("respeta otra zona horaria", () => {
    // Ciudad de México (UTC-6, sin cambio de hora en 2026). Viernes 2 oct 04:00 locales.
    const { upcoming } = seedSchedule(
      new Date("2026-10-02T10:00:00Z"),
      "America/Mexico_City",
    );
    expect(upcoming[0].startsAt).toBe("2026-10-07T00:00:00.000Z"); // mar 6 oct 18:00
    expect(upcoming[1].startsAt).toBe("2026-10-09T00:00:00.000Z"); // jue 8 oct 18:00
  });

  it("devuelve siempre 2 upcoming y 4 past, ordenados", () => {
    for (let day = 0; day < 14; day += 1) {
      const now = new Date(Date.UTC(2026, 9, 1 + day, 9, 0, 0));
      const { upcoming, past, game } = seedSchedule(now, MADRID);
      expect(upcoming).toHaveLength(2);
      expect(past).toHaveLength(4);
      const starts = (slots: { startsAt: string }[]) =>
        slots.map((slot) => Date.parse(slot.startsAt));
      expect(starts(upcoming).every((t) => t > now.getTime())).toBe(true);
      expect(starts(past).every((t) => t < now.getTime())).toBe(true);
      expect(Date.parse(game.startsAt)).toBeGreaterThan(now.getTime());
      expect(starts(upcoming)).toEqual([...starts(upcoming)].sort((a, b) => a - b));
      expect(starts(past)).toEqual([...starts(past)].sort((a, b) => b - a));
    }
  });
});

describe("slotOnSameDay", () => {
  it("pone otras horas locales en el mismo día de un slot", () => {
    const slot = { startsAt: "2026-10-06T16:00:00.000Z", endsAt: "2026-10-06T17:15:00.000Z" };
    expect(slotOnSameDay(slot, MADRID, "17:00", "18:00")).toEqual({
      startsAt: "2026-10-06T15:00:00.000Z",
      endsAt: "2026-10-06T16:00:00.000Z",
    });
  });

  it("respeta el horario de invierno", () => {
    const slot = { startsAt: "2026-10-27T17:00:00.000Z", endsAt: "2026-10-27T18:15:00.000Z" };
    expect(slotOnSameDay(slot, MADRID, "17:00", "18:00")).toEqual({
      startsAt: "2026-10-27T16:00:00.000Z",
      endsAt: "2026-10-27T17:00:00.000Z",
    });
  });
});
