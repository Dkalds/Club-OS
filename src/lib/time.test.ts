import { afterEach, describe, expect, it } from "vitest";
import {
  addLocalDays,
  dayMonth,
  dayChip,
  defaultSessionDate,
  formatDate,
  formatEventSlot,
  formatGameSlot,
  greeting,
  isoToLocalInputs,
  localTime,
  nextWeeklySlot,
  startOfLocalDay,
  startOfLocalWeek,
  zonedDateTimeToIso,
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

  it.each(["2026-11-17T18:00:00", "2026-11-17T18:00:00.000", "2026-11-17", "2026-11-17 18:00:00"])(
    "rechaza %s: sin Z ni desfase no es un instante y se leería en la zona del dispositivo",
    (naive) => {
      expect(() => formatEventSlot(naive, "2026-11-17T19:00:00Z", MADRID)).toThrow(RangeError);
      expect(() => formatEventSlot("2026-11-17T17:00:00Z", naive, MADRID)).toThrow(
        "Fecha o zona horaria no válidas",
      );
    },
  );

  it("acepta un desfase distinto de cero y lo respeta", () => {
    // 18:00 en Madrid (+01:00 en noviembre) son las 11:00 en México (-06:00).
    expect(formatEventSlot("2026-11-17T18:00:00+01:00", "2026-11-17T19:15:00+01:00", MADRID)).toBe(
      "Martes 17 nov · 18:00–19:15",
    );
    expect(formatEventSlot("2026-11-17T11:00:00-06:00", "2026-11-17T12:15:00-06:00", MADRID)).toBe(
      "Martes 17 nov · 18:00–19:15",
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

describe("zonedDateTimeToIso", () => {
  it("convierte día y hora del club a un instante ISO en UTC", () => {
    expect(zonedDateTimeToIso("2026-11-17", "18:00", MADRID)).toBe("2026-11-17T17:00:00.000Z"); // CET
    expect(zonedDateTimeToIso("2026-07-07", "18:00", MADRID)).toBe("2026-07-07T16:00:00.000Z"); // CEST
    expect(zonedDateTimeToIso("2026-10-06", "10:00", MEXICO)).toBe("2026-10-06T16:00:00.000Z");
  });

  it("una hora que no existe por el cambio de hora se adelanta lo que dura el hueco", () => {
    // 29 mar 2026: a las 02:00 CET se pasa a las 03:00 CEST, así que las 02:30 no existen.
    expect(zonedDateTimeToIso("2026-03-29", "02:30", MADRID)).toBe("2026-03-29T01:30:00.000Z"); // 03:30 CEST
    expect(localTime(zonedDateTimeToIso("2026-03-29", "02:30", MADRID), MADRID)).toBe("03:30");
  });

  it("una hora que se repite toma su primera ocurrencia", () => {
    // 25 oct 2026: a las 03:00 CEST se vuelve a las 02:00 CET, así que las 02:30 pasan dos veces.
    expect(zonedDateTimeToIso("2026-10-25", "02:30", MADRID)).toBe("2026-10-25T00:30:00.000Z"); // CEST
  });

  it.each([
    ["día que no existe", "2026-02-30", "18:00"],
    ["mes que no existe", "2026-13-01", "18:00"],
    ["día cero", "2026-11-00", "18:00"],
    ["29 de febrero de un año no bisiesto", "2026-02-29", "18:00"],
    ["hora fuera de rango", "2026-11-17", "25:00"],
    ["las 24:00", "2026-11-17", "24:00"],
    ["minutos fuera de rango", "2026-11-17", "18:60"],
    ["fecha con barras", "17/11/2026", "18:00"],
    ["fecha sin ceros", "2026-1-7", "18:00"],
    ["hora sin ceros", "2026-11-17", "8:00"],
    ["hora con segundos", "2026-11-17", "18:00:00"],
    ["campos vacíos", "", ""],
  ])("rechaza %s", (_name, date, time) => {
    expect(() => zonedDateTimeToIso(date, time, MADRID)).toThrow(RangeError);
    expect(() => zonedDateTimeToIso(date, time, MADRID)).toThrow("Fecha u hora no válidas");
  });

  it("una zona que no existe también falla en vez de devolver NaN", () => {
    expect(() => zonedDateTimeToIso("2026-11-17", "18:00", "Nada/Nada")).toThrow(RangeError);
  });

  it("acepta el 29 de febrero de un año bisiesto", () => {
    expect(zonedDateTimeToIso("2028-02-29", "18:00", MADRID)).toBe("2028-02-29T17:00:00.000Z");
  });
});

describe("isoToLocalInputs", () => {
  it("da la fecha y la hora de los campos del formulario en la zona del club", () => {
    expect(isoToLocalInputs("2026-11-17T17:00:00.000Z", MADRID)).toEqual({
      date: "2026-11-17",
      time: "18:00",
    });
  });

  it("el día es el del club: pasada la medianoche local ya es el día siguiente", () => {
    expect(isoToLocalInputs("2026-10-06T22:30:00.000Z", MADRID)).toEqual({
      date: "2026-10-07",
      time: "00:30",
    });
    expect(isoToLocalInputs("2026-10-06T22:30:00.000Z", MEXICO)).toEqual({
      date: "2026-10-06",
      time: "16:30",
    });
  });

  it("rellena con ceros el mes, el día, la hora y los minutos", () => {
    expect(isoToLocalInputs("2026-01-05T08:05:00.000Z", MADRID)).toEqual({
      date: "2026-01-05",
      time: "09:05",
    });
  });

  it("ida y vuelta con zonedDateTimeToIso en Madrid y en México", () => {
    for (const tz of [MADRID, MEXICO]) {
      const iso = zonedDateTimeToIso("2026-11-17", "18:00", tz);
      expect(isoToLocalInputs(iso, tz)).toEqual({ date: "2026-11-17", time: "18:00" });
    }
    expect(isoToLocalInputs("2026-11-18T00:00:00.000Z", MEXICO)).toEqual({
      date: "2026-11-17",
      time: "18:00",
    });
  });

  it("rechaza un ISO sin Z ni desfase", () => {
    expect(() => isoToLocalInputs("2026-11-17T18:00:00", MADRID)).toThrow(RangeError);
  });
});

describe("nextWeeklySlot", () => {
  const TUESDAY_18H_CEST = "2026-10-20T16:00:00.000Z";

  it("suma semanas de calendario: tras el cambio de hora del 25 oct sigue siendo a las 18:00", () => {
    // Martes 20 oct 18:00 CEST; ahora es el miércoles 21, 10:00 en Madrid.
    expect(nextWeeklySlot(TUESDAY_18H_CEST, "2026-10-21T08:00:00.000Z", MADRID)).toBe(
      "2026-10-27T17:00:00.000Z", // martes 27 oct 18:00 CET, no las 16:00Z de 7 × 24 h
    );
  });

  it("si el inicio es futuro, el siguiente es una semana después del inicio", () => {
    expect(nextWeeklySlot(TUESDAY_18H_CEST, "2026-10-06T08:00:00.000Z", MADRID)).toBe(
      "2026-10-27T17:00:00.000Z",
    );
  });

  it("si el inicio fue hace tres semanas, da el primero posterior a ahora", () => {
    const start = "2026-10-06T16:00:00.000Z"; // martes 6 oct, 18:00 CEST
    // El martes 27 a las 10:00 todavía no ha llegado la sesión de ese día.
    expect(nextWeeklySlot(start, "2026-10-27T09:00:00.000Z", MADRID)).toBe("2026-10-27T17:00:00.000Z");
    // Pasada la sesión de ese día, la siguiente es la del martes 3 nov.
    expect(nextWeeklySlot(start, "2026-10-27T18:30:00.000Z", MADRID)).toBe("2026-11-03T17:00:00.000Z");
  });

  it("es estrictamente posterior: en el instante exacto de una sesión da la de la semana siguiente", () => {
    expect(nextWeeklySlot(TUESDAY_18H_CEST, "2026-10-27T17:00:00.000Z", MADRID)).toBe(
      "2026-11-03T17:00:00.000Z",
    );
    expect(nextWeeklySlot(TUESDAY_18H_CEST, TUESDAY_18H_CEST, MADRID)).toBe("2026-10-27T17:00:00.000Z");
  });

  it("con un inicio de hace años no se salta ninguna semana", () => {
    // 6 oct 2020 también fue martes, 313 semanas antes.
    expect(nextWeeklySlot("2020-10-06T16:00:00.000Z", "2026-10-02T08:00:00.000Z", MADRID)).toBe(
      "2026-10-06T16:00:00.000Z",
    );
    // Del invierno al verano las 18:00 locales pasan de las 17:00Z a las 16:00Z: a las 16:30Z
    // la sesión de ese martes ya ha pasado, aunque no hayan pasado 65 × 168 h desde el inicio.
    expect(nextWeeklySlot("2025-01-14T17:00:00.000Z", "2026-04-14T16:30:00.000Z", MADRID)).toBe(
      "2026-04-21T16:00:00.000Z",
    );
  });

  // El borde de la semana por la que se empieza a contar. Martes 6 oct, 18:00 CEST; ahora es el
  // martes 27 a las 17:30 CET. Tras el cambio de hora las 18:00 son las 17:00Z: desde el inicio
  // han pasado tres semanas de 168 h y media hora, y aun así la sesión de ese martes no ha
  // llegado. Empezar una semana más tarde se la saltaría.
  it("con tres semanas de 168 h ya cumplidas, la sesión de ese día que aún no ha llegado es la siguiente", () => {
    expect(
      nextWeeklySlot("2026-10-06T16:00:00.000Z", "2026-10-27T16:30:00.000Z", "Europe/Madrid"),
    ).toBe("2026-10-27T17:00:00.000Z");
  });

  it("cuenta las semanas desde el inicio: un hueco de cambio de hora no desplaza las siguientes", () => {
    // Domingo 22 mar 2026, 02:30 CET. El 29 las 02:30 no existen (03:30 CEST) y el 5 abr vuelven.
    expect(nextWeeklySlot("2026-03-22T01:30:00.000Z", "2026-03-28T12:00:00.000Z", MADRID)).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(nextWeeklySlot("2026-03-22T01:30:00.000Z", "2026-03-29T12:00:00.000Z", MADRID)).toBe(
      "2026-04-05T00:30:00.000Z", // 02:30 CEST, no 03:30
    );
  });

  it("en una zona sin cambio de hora son semanas de 168 h", () => {
    expect(nextWeeklySlot("2026-10-06T16:00:00.000Z", "2026-10-21T08:00:00.000Z", MEXICO)).toBe(
      "2026-10-27T16:00:00.000Z",
    );
  });

  it("devuelve un ISO en UTC aunque la entrada lleve desfase", () => {
    expect(nextWeeklySlot("2026-10-20T18:00:00+02:00", "2026-10-21T10:00:00+02:00", MADRID)).toBe(
      "2026-10-27T17:00:00.000Z",
    );
  });

  it("rechaza un instante sin Z ni desfase en vez de leerlo en la zona del dispositivo", () => {
    expect(() => nextWeeklySlot("2026-10-20T18:00:00", "2026-10-21T08:00:00.000Z", MADRID)).toThrow(
      RangeError,
    );
    expect(() => nextWeeklySlot(TUESDAY_18H_CEST, "2026-10-21T10:00:00", MADRID)).toThrow(RangeError);
  });
});

describe("defaultSessionDate", () => {
  const AT_18 = "18:00";

  it("antes de la hora por defecto propone hoy", () => {
    // Martes 6 oct 2026 en Madrid (CEST, UTC+2): las 10:00 y las 17:59:59.
    expect(defaultSessionDate("2026-10-06T08:00:00.000Z", MADRID, AT_18)).toBe("2026-10-06");
    expect(defaultSessionDate("2026-10-06T15:59:59.999Z", MADRID, AT_18)).toBe("2026-10-06");
  });

  it("a la hora exacta propone mañana: una sesión que empieza ahora ya no está por venir", () => {
    expect(defaultSessionDate("2026-10-06T16:00:00.000Z", MADRID, AT_18)).toBe("2026-10-07");
  });

  it("pasada la hora por defecto propone mañana", () => {
    expect(defaultSessionDate("2026-10-06T16:00:01.000Z", MADRID, AT_18)).toBe("2026-10-07");
    expect(defaultSessionDate("2026-10-06T19:30:00.000Z", MADRID, AT_18)).toBe("2026-10-07");
  });

  it("la hora que cuenta es la que se le pasa", () => {
    // Las 10:00 en Madrid: unas 09:30 ya han pasado; unas 10:01, no.
    expect(defaultSessionDate("2026-10-06T08:00:00.000Z", MADRID, "09:30")).toBe("2026-10-07");
    expect(defaultSessionDate("2026-10-06T08:00:00.000Z", MADRID, "10:01")).toBe("2026-10-06");
  });

  it("mañana cruza el mes y el año: justo antes de la medianoche del 31 de diciembre es el 1 de enero", () => {
    // Las 23:59:59 del 31 dic en Madrid (CET, UTC+1).
    expect(defaultSessionDate("2026-12-31T22:59:59.000Z", MADRID, AT_18)).toBe("2027-01-01");
  });

  it("el día es el del club, no el de UTC", () => {
    // Martes 6 oct, 21:30 en Ciudad de México (UTC−6): en UTC ya es miércoles 7. Hoy es el 6
    // del club y mañana, el 7; contando desde el día de UTC saldría el 8.
    expect(defaultSessionDate("2026-10-07T03:30:00.000Z", MEXICO, AT_18)).toBe("2026-10-07");
    // Y a las 17:00 de allí son las 23:00 UTC del 6: aún no son las 18:00 del club.
    expect(defaultSessionDate("2026-10-06T23:00:00.000Z", MEXICO, AT_18)).toBe("2026-10-06");
    // Al revés, en Madrid: las 00:30 del 7 son las 22:30 UTC del 6, y hoy ya es 7.
    expect(defaultSessionDate("2026-10-06T22:30:00.000Z", MADRID, AT_18)).toBe("2026-10-07");
  });

  it("mañana es el día siguiente del calendario, no 24 h después: con el cambio de hora de octubre", () => {
    // Sábado 24 oct 2026, 20:00 CEST. El domingo 25 dura 25 horas.
    expect(defaultSessionDate("2026-10-24T18:00:00.000Z", MADRID, AT_18)).toBe("2026-10-25");
    // Y el propio domingo, a las 19:00 CET: mañana es lunes 26.
    expect(defaultSessionDate("2026-10-25T18:00:00.000Z", MADRID, AT_18)).toBe("2026-10-26");
    // Ese domingo las 18:00 son las 17:00Z, no las 16:00Z: a las 16:30Z todavía es hoy.
    expect(defaultSessionDate("2026-10-25T16:30:00.000Z", MADRID, AT_18)).toBe("2026-10-25");
  });

  it("y con el de marzo: el sábado por la noche propone el domingo de 23 horas, no el lunes", () => {
    // Sábado 28 mar 2026, 23:30 CET: 24 h después ya sería lunes 30, 00:30 CEST.
    expect(defaultSessionDate("2026-03-28T22:30:00.000Z", MADRID, AT_18)).toBe("2026-03-29");
  });

  it("rechaza un instante sin Z ni desfase, una hora que no existe y una zona que no existe", () => {
    expect(() => defaultSessionDate("2026-10-06T18:00:00", MADRID, AT_18)).toThrow(RangeError);
    expect(() => defaultSessionDate("2026-10-06T16:00:00.000Z", MADRID, "25:00")).toThrow(RangeError);
    expect(() => defaultSessionDate("2026-10-06T16:00:00.000Z", "Europa/Madrid", AT_18)).toThrow(RangeError);
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
      expect(zonedDateTimeToIso("2026-11-17", "18:00", MADRID)).toBe("2026-11-17T17:00:00.000Z");
      expect(zonedDateTimeToIso("2026-03-29", "02:30", MADRID)).toBe("2026-03-29T01:30:00.000Z");
      // La hora que se repite: con el servidor en UTC salía la segunda ocurrencia.
      expect(zonedDateTimeToIso("2026-10-25", "02:30", MADRID)).toBe("2026-10-25T00:30:00.000Z");
      expect(isoToLocalInputs("2026-11-17T17:00:00.000Z", MADRID)).toEqual({
        date: "2026-11-17",
        time: "18:00",
      });
      expect(nextWeeklySlot("2026-10-20T16:00:00.000Z", "2026-10-21T08:00:00.000Z", MADRID)).toBe(
        "2026-10-27T17:00:00.000Z",
      );
      expect(defaultSessionDate("2026-10-06T22:30:00.000Z", MADRID, "18:00")).toBe("2026-10-07");
      expect(defaultSessionDate("2026-10-06T16:30:00.000Z", MADRID, "18:00")).toBe("2026-10-07");
    },
  );
});

describe("formatDate", () => {
  it("el día en la zona del club: «Martes 6 oct»", () => {
    expect(formatDate("2026-10-06T16:00:00Z", "Europe/Madrid")).toBe("Martes 6 oct");
  });

  it("un instante de madrugada en UTC cae en el día del club, no en el del servidor", () => {
    expect(formatDate("2026-10-06T22:30:00Z", "Europe/Madrid")).toBe("Miércoles 7 oct");
    expect(formatDate("2026-10-06T22:30:00Z", "America/Mexico_City")).toBe("Martes 6 oct");
  });
});



describe("startOfLocalWeek", () => {
  it("el lunes a las 00:00 del club, sea cual sea el día de la semana", () => {
    // Miércoles 7 oct y domingo 11 oct, en Madrid (UTC+2): el lunes 5 a las 00:00.
    expect(startOfLocalWeek("2026-10-07T10:00:00Z", "Europe/Madrid")).toBe("2026-10-04T22:00:00.000Z");
    expect(startOfLocalWeek("2026-10-11T21:30:00Z", "Europe/Madrid")).toBe("2026-10-04T22:00:00.000Z");
  });

  it("el propio lunes es el principio de su semana", () => {
    expect(startOfLocalWeek("2026-10-05T07:00:00Z", "Europe/Madrid")).toBe("2026-10-04T22:00:00.000Z");
    // Lunes 12 a las 00:30 en Madrid ya es la semana siguiente.
    expect(startOfLocalWeek("2026-10-11T22:30:00Z", "Europe/Madrid")).toBe("2026-10-11T22:00:00.000Z");
  });

  it("el mismo instante puede caer en semanas distintas según la zona", () => {
    // Lunes 12, 01:00 en Madrid; domingo 11, 17:00 en Ciudad de México.
    const instant = "2026-10-11T23:00:00Z";

    expect(startOfLocalWeek(instant, "Europe/Madrid")).toBe("2026-10-11T22:00:00.000Z");
    expect(startOfLocalWeek(instant, "America/Mexico_City")).toBe("2026-10-05T06:00:00.000Z");
  });

  it("la semana del cambio de hora empieza en su lunes, y la siguiente, una hora de reloj después", () => {
    // Domingo 25 oct 2026: Madrid pasa de UTC+2 a UTC+1.
    expect(startOfLocalWeek("2026-10-25T17:00:00Z", "Europe/Madrid")).toBe("2026-10-18T22:00:00.000Z");
    expect(startOfLocalWeek("2026-10-26T08:00:00Z", "Europe/Madrid")).toBe("2026-10-25T23:00:00.000Z");
  });
});

describe("dayMonth", () => {
  it("el día y el mes abreviado, en la zona del club", () => {
    expect(dayMonth("2026-10-18T22:00:00.000Z", "Europe/Madrid")).toBe("19 oct");
    expect(dayMonth("2026-10-18T22:00:00.000Z", "America/Mexico_City")).toBe("18 oct");
  });
});
