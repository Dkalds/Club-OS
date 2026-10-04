import { describe, expect, it } from "vitest";
import {
  AGE_OPTIONS,
  MAX_QUERY_LENGTH,
  MINUTE_OPTIONS,
  PLAYER_OPTIONS,
  filterHref,
  hasActiveFilters,
  parseDrillFilters,
} from "./filters";
import type { DrillFilters } from "./types";

// Slug neutro: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const PATH = "/c/club-a/drills";

/** Lo que haría Next con la query de la URL que devuelve `filterHref`. */
function parseHref(href: string): DrillFilters {
  const query = href.split("?")[1] ?? "";
  return parseDrillFilters(Object.fromEntries(new URLSearchParams(query)));
}

describe("opciones de los chips", () => {
  it("son las de la especificación", () => {
    expect(AGE_OPTIONS).toEqual([8, 10, 12, 14, 16, 18]);
    expect(PLAYER_OPTIONS).toEqual([4, 6, 8, 10, 12, 14, 16]);
    expect(MINUTE_OPTIONS).toEqual([5, 10, 15, 20, 30]);
  });

  it("ninguna genera una URL que el parser descarte", () => {
    for (const age of AGE_OPTIONS) expect(parseDrillFilters({ age: String(age) })).toEqual({ age });
    for (const players of PLAYER_OPTIONS) {
      expect(parseDrillFilters({ players: String(players) })).toEqual({ players });
    }
    for (const minutes of MINUTE_OPTIONS) {
      expect(parseDrillFilters({ minutes: String(minutes) })).toEqual({ minutes });
    }
  });
});

describe("parseDrillFilters", () => {
  it("recorta q y convierte los enteros", () => {
    expect(parseDrillFilters({ q: "  transicion ", age: "12", players: "10" })).toEqual({
      q: "transicion",
      age: 12,
      players: 10,
    });
  });

  it("ignora en silencio todo lo inválido", () => {
    expect(
      parseDrillFilters({ age: "abc", players: "0", minutes: "500", focus: "DROP TABLE" }),
    ).toEqual({});
  });

  it("sin parámetros no hay filtros", () => {
    expect(parseDrillFilters({})).toEqual({});
    expect(parseDrillFilters({ q: undefined, age: undefined })).toEqual({});
  });

  it("no conserva claves con valor undefined", () => {
    const parsed = parseDrillFilters({ q: undefined, age: "abc", focus: "rebote", minutes: "nope" });

    expect(Object.keys(parsed)).toEqual(["focus"]);
    expect(Object.keys(parseDrillFilters({ age: "x", players: "x" }))).toEqual([]);
  });

  it("ignora los parámetros que no son filtros", () => {
    expect(parseDrillFilters({ utm_source: "mail", page: "2", focus: "rebote" })).toEqual({
      focus: "rebote",
    });
  });

  it("toma el primer valor de cada array", () => {
    expect(parseDrillFilters({ q: ["uno", "dos"], age: ["14", "10"], focus: ["rebote", "tiro"] })).toEqual({
      q: "uno",
      age: 14,
      focus: "rebote",
    });
  });

  it("solo mira el primero: si es inválido no salta al siguiente", () => {
    expect(parseDrillFilters({ age: ["abc", "12"], focus: ["MAL", "rebote"] })).toEqual({});
  });

  it("un array vacío cuenta como ausente", () => {
    expect(parseDrillFilters({ q: [], age: [], focus: [] })).toEqual({});
  });

  describe("q", () => {
    it.each(["", "   ", "\t\n"])("«%s» (vacío o en blanco) queda ausente", (q) => {
      expect(parseDrillFilters({ q })).toEqual({});
    });

    it("conserva mayúsculas, tildes y espacios interiores", () => {
      expect(parseDrillFilters({ q: "  Transición  rápida " })).toEqual({ q: "Transición  rápida" });
    });

    it("se trunca a 80 caracteres", () => {
      const parsed = parseDrillFilters({ q: "a".repeat(200) });

      expect(parsed.q).toBe("a".repeat(80));
    });

    it("MAX_QUERY_LENGTH es 80 y es el corte de la búsqueda (lo que una pantalla pasa a maxLength)", () => {
      expect(MAX_QUERY_LENGTH).toBe(80);
      expect(parseDrillFilters({ q: "a".repeat(MAX_QUERY_LENGTH + 1) }).q).toBe("a".repeat(MAX_QUERY_LENGTH));
    });

    it("exactamente 80 no se toca", () => {
      expect(parseDrillFilters({ q: "b".repeat(80) })).toEqual({ q: "b".repeat(80) });
    });

    it("tras truncar no queda un espacio al final", () => {
      const q = `${"a".repeat(79)} ${"b".repeat(10)}`;

      expect(parseDrillFilters({ q })).toEqual({ q: "a".repeat(79) });
    });

    // `?q=%00` llega como un NUL, que una columna `text` de Postgres no puede guardar: la
    // búsqueda fallaría con un error de la base de datos en vez de no encontrar nada.
    it("un NUL (?q=%00) o cualquier carácter de control queda ausente, no llega a la búsqueda", () => {
      expect(parseDrillFilters({ q: "\u0000" })).toEqual({});
      expect(parseDrillFilters({ q: "\u0000\u0000" })).toEqual({});
      expect(parseDrillFilters({ q: "\u001f\u007f\u0085" })).toEqual({});
    });

    it("los caracteres de control entre palabras se leen como un espacio", () => {
      expect(parseDrillFilters({ q: "pase\u0000rapido" })).toEqual({ q: "pase rapido" });
      expect(parseDrillFilters({ q: "pase\trapido\nsalida" })).toEqual({ q: "pase rapido salida" });
      expect(parseDrillFilters({ q: "\u0000 pase \u0000" })).toEqual({ q: "pase" });
    });

    it("ningún carácter de control sobrevive en la q resultante", () => {
      const controls = Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)).join("");
      const parsed = parseDrillFilters({ q: `a${controls}b\u007f\u0080\u009fc` });

      // Cada carácter de control es un espacio: los 32 de ASCII, luego DEL y dos de C1.
      expect(parsed.q).toBe(`a${" ".repeat(32)}b${" ".repeat(3)}c`);
      expect(parsed.q).not.toMatch(/\p{Cc}/u);
    });

    it("no parte un carácter fuera del plano básico (la URL resultante no falla)", () => {
      const parsed = parseDrillFilters({ q: `${"a".repeat(79)}😀😀` });

      expect(Array.from(parsed.q ?? "")).toHaveLength(80);
      expect(() => encodeURIComponent(parsed.q ?? "")).not.toThrow();
      expect(() => filterHref(PATH, parsed, {})).not.toThrow();
    });
  });

  describe("focus y principle", () => {
    it.each(["rebote", "transicion-defensiva", "a1-b2", "3x3", "x"])("«%s» es un slug válido", (slug) => {
      expect(parseDrillFilters({ focus: slug, principle: slug })).toEqual({ focus: slug, principle: slug });
    });

    it.each([
      "",
      "Rebote",
      "REBOTE",
      "rebote-",
      "-rebote",
      "rebote--tiro",
      "rebote_tiro",
      "rebote tiro",
      "DROP TABLE",
      "rebote;",
      "rebote'",
      "ñandú",
      "../etc",
      "%27",
    ])("«%s» no es un slug y se ignora", (slug) => {
      expect(parseDrillFilters({ focus: slug, principle: slug })).toEqual({});
    });
  });

  describe("enteros", () => {
    it.each([
      ["age", 8, 18],
      ["players", 1, 40],
      ["minutes", 1, 120],
    ] as const)("%s admite de %i a %i, ambos incluidos", (key, min, max) => {
      expect(parseDrillFilters({ [key]: String(min) })).toEqual({ [key]: min });
      expect(parseDrillFilters({ [key]: String(max) })).toEqual({ [key]: max });
      expect(parseDrillFilters({ [key]: String(min - 1) })).toEqual({});
      expect(parseDrillFilters({ [key]: String(max + 1) })).toEqual({});
    });

    it.each(["12.5", "12.0", "1e1", " 12", "12 ", "+12", "-12", "0x0c", "12abc", "１２", "", "NaN", "Infinity"])(
      "«%s» no es un entero decimal sin más y se ignora",
      (value) => {
        expect(parseDrillFilters({ age: value, players: value, minutes: value })).toEqual({});
      },
    );

    it("los ceros a la izquierda valen: «012» es 12", () => {
      expect(parseDrillFilters({ age: "012", players: "007", minutes: "0030" })).toEqual({
        age: 12,
        players: 7,
        minutes: 30,
      });
    });

    it("una cifra desmesurada se ignora, no desborda", () => {
      expect(parseDrillFilters({ age: "9".repeat(400), players: "1".repeat(30) })).toEqual({});
    });
  });
});

describe("filterHref", () => {
  it("quita el filtro cuyo valor del patch es undefined", () => {
    expect(filterHref(PATH, { focus: "rebote", age: 12 }, { focus: undefined })).toBe(
      "/c/club-a/drills?age=12",
    );
  });

  it("sin filtros devuelve la ruta sin «?»", () => {
    expect(filterHref(PATH, {}, {})).toBe(PATH);
    expect(filterHref(PATH, { focus: "rebote" }, { focus: undefined })).toBe(PATH);
  });

  it("serializa siempre en el orden q, focus, principle, age, players, minutes", () => {
    const href = filterHref(
      PATH,
      { minutes: 15, q: "pase" },
      { players: 8, age: 12, principle: "ventaja", focus: "tiro" },
    );

    expect(href).toBe("/c/club-a/drills?q=pase&focus=tiro&principle=ventaja&age=12&players=8&minutes=15");
  });

  it("el patch pisa al filtro actual y el resto se conserva", () => {
    expect(filterHref(PATH, { age: 12, focus: "rebote" }, { age: 14 })).toBe(
      "/c/club-a/drills?focus=rebote&age=14",
    );
    expect(filterHref(PATH, { focus: "rebote", age: 12 }, { minutes: 10 })).toBe(
      "/c/club-a/drills?focus=rebote&age=12&minutes=10",
    );
  });

  it("acepta números y cadenas en el patch", () => {
    expect(filterHref(PATH, {}, { age: 14 })).toBe(filterHref(PATH, {}, { age: "14" }));
  });

  it("un valor vacío o en blanco en el patch quita el filtro", () => {
    expect(filterHref(PATH, { q: "pase", age: 12 }, { q: "" })).toBe("/c/club-a/drills?age=12");
    expect(filterHref(PATH, { q: "pase", age: 12 }, { q: "   " })).toBe("/c/club-a/drills?age=12");
  });

  it("no ensucia la URL con claves que no tienen valor", () => {
    expect(filterHref(PATH, { q: undefined, age: undefined }, { focus: "rebote" })).toBe(
      "/c/club-a/drills?focus=rebote",
    );
  });

  it("no modifica el filtro actual", () => {
    const current = Object.freeze({ focus: "rebote", age: 12 });

    expect(() => filterHref(PATH, current, { focus: undefined, minutes: 10 })).not.toThrow();
    expect(current).toEqual({ focus: "rebote", age: 12 });
  });

  it("una q con espacios, «&», «=», «#», «%» y tildes sobrevive al viaje de ida y vuelta", () => {
    const q = "transición & rebote = 100% #1 ¿sí?";
    const href = filterHref(PATH, {}, { q });
    const url = new URL(href, "http://localhost");

    expect([...url.searchParams.keys()]).toEqual(["q"]);
    expect(url.searchParams.get("q")).toBe(q);
    expect(parseHref(href)).toEqual({ q });
  });

  it("el espacio de los lados de una q no sobrevive al viaje de ida y vuelta: se recorta", () => {
    const href = filterHref(PATH, {}, { q: "rebote " });

    expect(parseHref(href)).toEqual({ q: "rebote" });
  });

  it("la q no se come a los demás filtros aunque lleve «&»", () => {
    const href = filterHref(PATH, { age: 12 }, { q: "a&focus=b" });

    expect(parseHref(href)).toEqual({ q: "a&focus=b", age: 12 });
  });

  it("leer lo que se escribe devuelve los mismos filtros", () => {
    const filters: DrillFilters = {
      q: "salida de presión",
      focus: "rebote",
      principle: "transicion-defensiva",
      age: 12,
      players: 10,
      minutes: 15,
    };

    expect(parseHref(filterHref(PATH, filters, {}))).toEqual(filters);
  });

  it("deja la ruta tal cual", () => {
    expect(filterHref("/c/club-b/drills", { age: 10 }, {})).toBe("/c/club-b/drills?age=10");
  });
});

describe("hasActiveFilters", () => {
  it("sin filtros, no", () => {
    expect(hasActiveFilters({})).toBe(false);
  });

  it("claves sin valor no cuentan", () => {
    expect(hasActiveFilters({ q: undefined, age: undefined })).toBe(false);
  });

  it.each([
    [{ q: "pase" }],
    [{ focus: "rebote" }],
    [{ principle: "ventaja" }],
    [{ age: 12 }],
    [{ players: 10 }],
    [{ minutes: 15 }],
  ] as const)("con %j, sí", (filters) => {
    expect(hasActiveFilters(filters)).toBe(true);
  });
});
