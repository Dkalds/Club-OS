import { afterEach, describe, expect, it } from "vitest";
import {
  addLocalDays,
  dayChip,
  formatEventSlot,
  formatGameSlot,
  greeting,
  localTime,
  startOfLocalDay,
} from "./time";

const MADRID = "Europe/Madrid";
const MEXICO = "America/Mexico_City";

describe("formatEventSlot", () => {
  it("da día, fecha y horas en la zona del club", () => {
    expect(formatEventSlot("2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", MADRID)).toBe(
      "Martes 6 oct · 18:00–19:15",
    );
  });

  it("separa el rango con raya corta (U+2013) y los campos con punto medio (U+00B7)", () => {
    const slot = formatEventSlot("2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", MADRID);
    expect(slot).toBe("Martes 6 oct · 18:00–19:15");
    expect(slot).not.toContain("-");
  });

  it("después del cambio de hora (25 oct) las 17:00Z siguen siendo las 18:00 en Madrid", () => {
    expect(formatEventSlot("2026-10-27T17:00:00Z", "2026-10-27T18:15:00Z", MADRID)).toBe(
      "Martes 27 oct · 18:00–19:15",
    );
    // Antes del cambio, ese mismo reloj de pared eran las 16:00Z.
    expect(formatEventSlot("2026-10-20T16:00:00Z", "2026-10-20T17:15:00Z", MADRID)).toBe(
      "Martes 20 oct · 18:00–19:15",
    );
  });

  it("usa la zona que se le pasa, no la de Madrid", () => {
    expect(formatEventSlot("2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", MEXICO)).toBe(
      "Martes 6 oct · 10:00–11:15",
    );
  });

  it("el día es el del club: pasada la medianoche local ya es el día siguiente", () => {
    expect(formatEventSlot("2026-10-06T22:30:00Z", "2026-10-06T23:45:00Z", MADRID)).toBe(
      "Miércoles 7 oct · 00:30–01:45",
    );
  });

  it("rellena con ceros las horas y los minutos, y no el día del mes", () => {
    expect(formatEventSlot("2026-10-04T05:05:00Z", "2026-10-04T06:09:00Z", MADRID)).toBe(
      "Domingo 4 oct · 07:05–08:09",
    );
  });

  it("acepta ISO con y sin milisegundos y con desfase +00:00", () => {
    const expected = "Martes 6 oct · 18:00–19:15";
    expect(formatEventSlot("2026-10-06T16:00:00.000Z", "2026-10-06T17:15:00.000Z", MADRID)).toBe(
      expected,
    );
    expect(formatEventSlot("2026-10-06T16:00:00+00:00", "2026-10-06T17:15:00+00:00", MADRID)).toBe(
      expected,
    );
  });

  it("nombra todos los días de la semana desde la lista fija en español", () => {
    // 4 oct 2026 es domingo.
    const names = [4, 5, 6, 7, 8, 9, 10].map(
      (day) =>
        formatEventSlot(
          `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`,
          `2026-10-${String(day).padStart(2, "0")}T13:00:00Z`,
          MADRID,
        ).split(" ")[0],
    );
    expect(names).toEqual([
      "Domingo",
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
    ]);
  });

  it("abrevia los doce meses desde la lista fija en español", () => {
    const months = Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      return formatEventSlot(`2026-${month}-15T12:00:00Z`, `2026-${month}-15T13:00:00Z`, MADRID).split(
        " ",
      )[2];
    });
    expect(months).toEqual([
      "ene",
      "feb",
      "mar",
      "abr",
      "may",
      "jun",
      "jul",
      "ago",
      "sep",
      "oct",
      "nov",
      "dic",
    ]);
  });

  it("falla con una fecha o una zona que no existen en vez de pintar NaN", () => {
    expect(() => formatEventSlot("no-es-una-fecha", "2026-10-06T17:15:00Z", MADRID)).toThrow(
      RangeError,
    );
    expect(() => formatEventSlot("2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", "Nada/Nada")).toThrow(
      RangeError,
    );
  });
});

describe("formatGameSlot", () => {
  it("añade «Local» a un partido en casa", () => {
    expect(formatGameSlot("2026-10-10T08:30:00Z", MADRID, "home")).toBe(
      "Sábado 10 oct · 10:30 · Local",
    );
  });

  it("añade «Visitante» a un partido fuera", () => {
    expect(formatGameSlot("2026-10-10T08:30:00Z", MADRID, "away")).toBe(
      "Sábado 10 oct · 10:30 · Visitante",
    );
  });

  it("no añade sufijo si no se sabe dónde se juega", () => {
    expect(formatGameSlot("2026-10-10T08:30:00Z", MADRID, null)).toBe("Sábado 10 oct · 10:30");
  });

  it("muestra la hora en la zona que se le pasa", () => {
    expect(formatGameSlot("2026-10-10T08:30:00Z", MEXICO, "home")).toBe(
      "Sábado 10 oct · 02:30 · Local",
    );
  });
});

describe("dayChip", () => {
  it("devuelve el día de la semana abreviado y el día del mes sin cero", () => {
    expect(dayChip("2026-10-08T16:00:00Z", MADRID)).toEqual({ dow: "Jue", day: "8" });
  });

  it("nombra todos los días abreviados desde la lista fija en español", () => {
    const dows = [4, 5, 6, 7, 8, 9, 10].map(
      (day) => dayChip(`2026-10-${String(day).padStart(2, "0")}T12:00:00Z`, MADRID).dow,
    );
    expect(dows).toEqual(["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]);
  });

  it("cuenta el día en la zona del club, no en UTC", () => {
    // 22:30Z del 6 oct ya es el 7 en Madrid, pero sigue siendo el 6 en México.
    expect(dayChip("2026-10-06T22:30:00Z", MADRID)).toEqual({ dow: "Mié", day: "7" });
    expect(dayChip("2026-10-06T22:30:00Z", MEXICO)).toEqual({ dow: "Mar", day: "6" });
  });
});

describe("localTime", () => {
  it("da la hora local de 24 h con ceros a la izquierda", () => {
    expect(localTime("2026-10-06T16:00:00Z", MADRID)).toBe("18:00");
    expect(localTime("2026-10-06T05:05:00Z", MADRID)).toBe("07:05");
    expect(localTime("2026-10-06T22:30:00Z", MADRID)).toBe("00:30");
  });

  it("respeta el cambio de hora", () => {
    expect(localTime("2026-10-24T16:00:00Z", MADRID)).toBe("18:00"); // CEST, +02:00
    expect(localTime("2026-10-27T17:00:00Z", MADRID)).toBe("18:00"); // CET, +01:00
  });
});

describe("greeting", () => {
  it("saluda según la hora del club", () => {
    expect(greeting("2026-10-06T05:30:00Z", MADRID)).toBe("Buenos días"); // 07:30
    expect(greeting("2026-10-06T12:30:00Z", MADRID)).toBe("Buenas tardes"); // 14:30
    expect(greeting("2026-10-06T19:30:00Z", MADRID)).toBe("Buenas noches"); // 21:30
  });

  it("corta en 06:00, 14:00 y 21:00 locales", () => {
    // Madrid en octubre es UTC+2.
    expect(greeting("2026-10-06T03:59:00Z", MADRID)).toBe("Buenas noches"); // 05:59
    expect(greeting("2026-10-06T04:00:00Z", MADRID)).toBe("Buenos días"); // 06:00
    expect(greeting("2026-10-06T11:59:00Z", MADRID)).toBe("Buenos días"); // 13:59
    expect(greeting("2026-10-06T12:00:00Z", MADRID)).toBe("Buenas tardes"); // 14:00
    expect(greeting("2026-10-06T18:59:00Z", MADRID)).toBe("Buenas tardes"); // 20:59
    expect(greeting("2026-10-06T19:00:00Z", MADRID)).toBe("Buenas noches"); // 21:00
  });

  it("la madrugada también es «noches»", () => {
    expect(greeting("2026-10-06T22:30:00Z", MADRID)).toBe("Buenas noches"); // 00:30
  });

  it("depende de la zona que se le pasa", () => {
    // El mismo instante: 14:30 en Madrid, 06:30 en México.
    expect(greeting("2026-10-06T12:30:00Z", MADRID)).toBe("Buenas tardes");
    expect(greeting("2026-10-06T12:30:00Z", MEXICO)).toBe("Buenos días");
  });
});

describe("startOfLocalDay", () => {
  it("devuelve el instante de las 00:00 locales de ese día", () => {
    // 00:00 del 6 oct en Madrid (CEST) son las 22:00Z del 5.
    expect(startOfLocalDay("2026-10-06T16:00:00Z", MADRID)).toBe("2026-10-05T22:00:00.000Z");
    expect(startOfLocalDay("2026-10-06T16:00:00Z", MEXICO)).toBe("2026-10-06T06:00:00.000Z");
  });

  it("el día es el local: 01:30 del 6 en Madrid es todavía el 5 en UTC", () => {
    expect(startOfLocalDay("2026-10-05T23:30:00Z", MADRID)).toBe("2026-10-05T22:00:00.000Z");
  });

  it("devuelve el mismo instante si ya es medianoche local", () => {
    expect(startOfLocalDay("2026-10-05T22:00:00Z", MADRID)).toBe("2026-10-05T22:00:00.000Z");
  });

  it("acepta ISO con y sin milisegundos y devuelve siempre el formato de toISOString", () => {
    expect(startOfLocalDay("2026-10-06T16:00:00.250Z", MADRID)).toBe("2026-10-05T22:00:00.000Z");
    expect(startOfLocalDay("2026-10-06T16:00:00+00:00", MADRID)).toBe("2026-10-05T22:00:00.000Z");
  });

  it("el día del cambio de hora de octubre dura 25 horas y cada extremo usa su desfase", () => {
    // 25 oct 2026: a las 03:00 CEST se vuelve a las 02:00 CET.
    expect(startOfLocalDay("2026-10-25T10:00:00Z", MADRID)).toBe("2026-10-24T22:00:00.000Z"); // 00:00 CEST
    expect(startOfLocalDay("2026-10-26T10:00:00Z", MADRID)).toBe("2026-10-25T23:00:00.000Z"); // 00:00 CET
  });
});

describe("addLocalDays", () => {
  it("suma días de calendario manteniendo la hora de pared local", () => {
    expect(addLocalDays("2026-10-02T10:00:00Z", 7, MADRID)).toBe("2026-10-09T10:00:00.000Z");
    expect(addLocalDays("2026-10-02T10:00:00Z", 0, MADRID)).toBe("2026-10-02T10:00:00.000Z");
  });

  it("al cruzar el cambio de hora de octubre un día local son 25 horas, no 24", () => {
    // 00:00 del 23 oct (CEST) + 7 días locales = 00:00 del 30 oct (CET), no 7 × 24 h.
    const start = startOfLocalDay("2026-10-23T10:00:00Z", MADRID);
    expect(start).toBe("2026-10-22T22:00:00.000Z");
    expect(addLocalDays(start, 7, MADRID)).toBe("2026-10-29T23:00:00.000Z");
    expect(addLocalDays(start, 7, MADRID)).not.toBe("2026-10-29T22:00:00.000Z");
  });

  it("al cruzar el cambio de hora de marzo un día local son 23 horas", () => {
    // 28 mar 2027: a las 02:00 CET se pasa a las 03:00 CEST.
    const start = startOfLocalDay("2027-03-25T10:00:00Z", MADRID); // 00:00 CET del 25
    expect(start).toBe("2027-03-24T23:00:00.000Z");
    expect(addLocalDays(start, 7, MADRID)).toBe("2027-03-31T22:00:00.000Z"); // 00:00 CEST del 1 abr
  });

  it("suma días hacia atrás con un número negativo", () => {
    expect(addLocalDays("2026-10-30T10:00:00Z", -7, MADRID)).toBe("2026-10-23T09:00:00.000Z");
  });

  it("acepta ISO con milisegundos y devuelve el formato de toISOString", () => {
    expect(addLocalDays("2026-10-02T10:00:00.000Z", 1, MADRID)).toBe("2026-10-03T10:00:00.000Z");
    expect(addLocalDays("2026-10-02T10:00:00+00:00", 1, MADRID)).toBe("2026-10-03T10:00:00.000Z");
  });

  it("en una zona sin cambio de hora coincide con días de 24 h", () => {
    expect(addLocalDays("2026-10-23T10:00:00Z", 7, MEXICO)).toBe("2026-10-30T10:00:00.000Z");
  });
});

describe("independencia de la zona del dispositivo (regla 7)", () => {
  const original = process.env.TZ;

  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });

  it.each(["UTC", "Pacific/Auckland", "America/Los_Angeles"])(
    "da lo mismo con el dispositivo en %s",
    (deviceZone) => {
      process.env.TZ = deviceZone;

      expect(formatEventSlot("2026-10-06T16:00:00Z", "2026-10-06T17:15:00Z", MADRID)).toBe(
        "Martes 6 oct · 18:00–19:15",
      );
      expect(dayChip("2026-10-08T16:00:00Z", MADRID)).toEqual({ dow: "Jue", day: "8" });
      expect(greeting("2026-10-06T12:30:00Z", MADRID)).toBe("Buenas tardes");
      expect(startOfLocalDay("2026-10-06T16:00:00Z", MADRID)).toBe("2026-10-05T22:00:00.000Z");
      expect(addLocalDays("2026-10-22T22:00:00Z", 7, MADRID)).toBe("2026-10-29T23:00:00.000Z");
    },
  );
});
