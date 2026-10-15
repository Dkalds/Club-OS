import { describe, expect, it } from "vitest";
import {
  ACCESS_LABEL,
  ageBandLabel,
  ageOf,
  byListName,
  dayLabel,
  fullName,
  listName,
  matchesPerson,
  normalize,
  seasonDates,
  STAFF_ROLE_LABEL,
  STAFF_ROLE_OPTIONS,
  toAgeBand,
} from "./format";

// Datos neutros y ficticios: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("dayLabel", () => {
  it.each([
    ["2026-09-01", "1 sep 2026"],
    ["2027-06-30", "30 jun 2027"],
    ["2026-01-09", "9 ene 2026"],
    ["2026-12-31", "31 dic 2026"],
  ])("%s es «%s»: el día sin cero delante, el mes abreviado y el año", (day, label) => {
    expect(dayLabel(day)).toBe(label);
  });

  it("dice los doce meses en español, en minúsculas y sin punto", () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      dayLabel(`2026-${String(index + 1).padStart(2, "0")}-15`).split(" ")[1],
    );

    expect(months).toEqual(["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]);
  });

  it.each([
    ["un mes que no existe", "2026-13-01"],
    ["el mes cero", "2026-00-10"],
    ["una fecha con hora", "2026-09-01T10:00:00Z"],
    ["sin ceros", "2026-9-1"],
    ["un texto cualquiera", "pronto"],
    ["vacío", ""],
  ])("%s se queda tal cual", (_case, day) => {
    expect(dayLabel(day)).toBe(day);
  });

  it("no depende de la zona del dispositivo: es un día de calendario, no un instante", () => {
    // Con `new Date("2026-09-01")` y una zona al oeste de UTC saldría el 31 de agosto.
    expect(dayLabel("2026-09-01")).toBe("1 sep 2026");
    expect(dayLabel("2026-01-01")).toBe("1 ene 2026");
  });
});

describe("seasonDates", () => {
  it("el inicio y el fin, con raya corta entre espacios", () => {
    expect(seasonDates("2026-09-01", "2027-06-30")).toBe("1 sep 2026 – 30 jun 2027");
  });

  it("lo que no es un día se deja como llega", () => {
    expect(seasonDates("", "2027-06-30")).toBe(" – 30 jun 2027");
  });
});

describe("ageOf", () => {
  it.each([
    ["U12", 12],
    ["U8", 8],
    ["U99", 99],
    ["U0", 0],
  ])("%s es %d", (ageBand, age) => {
    expect(ageOf(ageBand)).toBe(age);
  });

  it.each(["u12", "U123", "U", "12", "Sub 12", "U12 ", " U12", "U1a", ""])("«%s» no tiene esa forma: null", (ageBand) => {
    expect(ageOf(ageBand)).toBeNull();
  });
});

describe("ageBandLabel", () => {
  it("U12 es «Sub 12»", () => {
    expect(ageBandLabel("U12")).toBe("Sub 12");
    expect(ageBandLabel("U8")).toBe("Sub 8");
  });

  it("la edad cero también se dice: no se confunde con «sin edad»", () => {
    expect(ageBandLabel("U0")).toBe("Sub 0");
  });

  it("lo que no tiene esa forma se enseña tal cual", () => {
    expect(ageBandLabel("Sénior")).toBe("Sénior");
    expect(ageBandLabel("")).toBe("");
  });
});

describe("toAgeBand", () => {
  it("una edad como la guarda la base", () => {
    expect(toAgeBand(12)).toBe("U12");
    expect(toAgeBand(8)).toBe("U8");
  });

  it("es la inversa de ageOf en todo el rango que admite el esquema", () => {
    for (let age = 1; age <= 99; age += 1) {
      expect(ageOf(toAgeBand(age))).toBe(age);
    }
  });
});

describe("listName y fullName", () => {
  const person = { firstName: "Ana", lastName: "García López" };

  it("listName: «Apellidos, Nombre»", () => {
    expect(listName(person)).toBe("García López, Ana");
  });

  it("fullName: «Nombre Apellidos»", () => {
    expect(fullName(person)).toBe("Ana García López");
  });
});

describe("las etiquetas", () => {
  it("los papeles del cuerpo técnico, el principal primero", () => {
    expect(STAFF_ROLE_LABEL).toEqual({ head_coach: "Entrenador principal", assistant: "Ayudante" });
    expect(STAFF_ROLE_OPTIONS).toEqual([
      { value: "head_coach", label: "Entrenador principal" },
      { value: "assistant", label: "Ayudante" },
    ]);
  });

  it("el rol con el que entra en la app quien tiene cuenta", () => {
    expect(ACCESS_LABEL).toEqual({
      admin: "Dirección",
      coach: "Cuerpo técnico",
      player: "Jugador",
      guardian: "Familia",
    });
  });
});

describe("normalize", () => {
  it("quita tildes y diéresis", () => {
    expect(normalize("áéíóú")).toBe("aeiou");
    expect(normalize("ÁÉÍÓÚ")).toBe("aeiou");
    expect(normalize("Agüero")).toBe("aguero");
  });

  it("pasa a minúsculas", () => {
    expect(normalize("GARCÍA")).toBe("garcia");
  });

  it("deja un solo espacio entre palabras y ninguno en los extremos", () => {
    expect(normalize("  Ana   María \t de\nla  O ")).toBe("ana maria de la o");
  });

  it("vacío o solo espacios es vacío", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });

  it("las tildes escritas como letra más acento suelto (NFD) dan lo mismo", () => {
    expect(normalize("García")).toBe(normalize("García"));
  });

  // La virgulilla es un signo como la tilde: «ñ» se compara como «n». Quien busca «nunez»
  // encuentra a «Núñez», y al revés.
  it("la ñ se compara como n", () => {
    expect(normalize("Núñez")).toBe("nunez");
  });
});

describe("matchesPerson", () => {
  const person = { firstName: "María José", lastName: "Núñez Álvarez" };

  it("una búsqueda vacía, o de solo espacios, deja pasar a todas", () => {
    expect(matchesPerson(person, "")).toBe(true);
    expect(matchesPerson(person, "   ")).toBe(true);
  });

  it("no distingue tildes: se encuentra con y sin ellas", () => {
    expect(matchesPerson(person, "alvarez")).toBe(true);
    expect(matchesPerson(person, "Álvarez")).toBe(true);
    expect(matchesPerson(person, "maria jose")).toBe(true);
    expect(matchesPerson({ firstName: "Maria", lastName: "Alvarez" }, "maría álvarez")).toBe(true);
  });

  it("no distingue mayúsculas", () => {
    expect(matchesPerson(person, "NÚÑEZ")).toBe(true);
    expect(matchesPerson(person, "mArÍa")).toBe(true);
  });

  it("basta con parte de una palabra, en el nombre o en los apellidos", () => {
    expect(matchesPerson(person, "jos")).toBe(true);
    expect(matchesPerson(person, "lvar")).toBe(true);
  });

  it("varias palabras, en cualquier orden: apellidos antes que el nombre", () => {
    expect(matchesPerson(person, "núñez maría")).toBe(true);
    expect(matchesPerson(person, "alvarez jose nunez")).toBe(true);
  });

  it("todas las palabras tienen que estar: una que no está, y no sale", () => {
    expect(matchesPerson(person, "maría pérez")).toBe(false);
    expect(matchesPerson(person, "zzz")).toBe(false);
  });

  it("los espacios de más en la búsqueda no cuentan", () => {
    expect(matchesPerson(person, "  maría    núñez  ")).toBe(true);
  });

  it("no busca en lo que no es el nombre: el año de nacimiento no se encuentra", () => {
    expect(matchesPerson({ ...person, birthYear: 2014 } as typeof person, "2014")).toBe(false);
  });
});

describe("byListName", () => {
  const person = (n: number, firstName: string, lastName: string) => ({ id: uuid(n), firstName, lastName });
  const sorted = <P extends { id?: string; personId?: string; firstName: string; lastName: string }>(people: P[]) =>
    [...people].sort(byListName);

  it("por apellidos y, con los mismos, por nombre", () => {
    const people = [
      person(1, "Zoe", "Blanco"),
      person(2, "Ana", "Vega"),
      person(3, "Ana", "Blanco"),
      person(4, "Luis", "Arias"),
    ];

    expect(sorted(people).map(listName)).toEqual(["Arias, Luis", "Blanco, Ana", "Blanco, Zoe", "Vega, Ana"]);
  });

  it("como se lee en español: la «Á» junto a la «A» y la «Ñ» tras la «N», no al final", () => {
    const people = [
      person(1, "Eva", "Zamora"),
      person(2, "Eva", "Ñíguez"),
      person(3, "Eva", "Álvarez"),
      person(4, "Eva", "Ortiz"),
      person(5, "Eva", "Navas"),
      person(6, "Eva", "Alonso"),
    ];

    expect(sorted(people).map((p) => p.lastName)).toEqual([
      "Alonso",
      "Álvarez",
      "Navas",
      "Ñíguez",
      "Ortiz",
      "Zamora",
    ]);
  });

  it("el nombre también se ordena en español", () => {
    const people = [person(1, "Oscar", "Ruiz"), person(2, "Óliver", "Ruiz"), person(3, "Ángel", "Ruiz")];

    expect(sorted(people).map((p) => p.firstName)).toEqual(["Ángel", "Óliver", "Oscar"]);
  });

  it("con el mismo nombre y los mismos apellidos, por id: el orden no baila", () => {
    const people = [person(3, "Ana", "Vega"), person(1, "Ana", "Vega"), person(2, "Ana", "Vega")];

    expect(sorted(people).map((p) => p.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
    expect(sorted([...people].reverse()).map((p) => p.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
  });

  it("quien no lleva `id` desempata por `personId` (el cuerpo técnico y la plantilla)", () => {
    const seat = (n: number) => ({ personId: uuid(n), firstName: "Ana", lastName: "Vega" });

    expect(sorted([seat(2), seat(1)]).map((p) => p.personId)).toEqual([uuid(1), uuid(2)]);
  });

  it("sin ningún id, dos personas iguales empatan", () => {
    const same = { firstName: "Ana", lastName: "Vega" };

    expect(byListName(same, { ...same })).toBe(0);
  });
});
