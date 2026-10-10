import { describe, expect, it } from "vitest";
import { errorsByRow, phaseOptions, sameRows, toItem, toRow, withSavedIds, type Row } from "./practice-rows";

const SAVED = {
  id: "00000000-0000-4000-8000-000000000001",
  drillId: null,
  title: "Rueda de pases",
  phase: "Activación",
  minutes: 10,
  notes: null,
};

const A: Row = toRow(SAVED);
const B: Row = { key: "nuevo-1", drillId: null, title: "Tres calles", phase: null, minutes: 15, notes: "Sin bote." };

describe("toRow y toItem", () => {
  it("la clave de un ítem guardado es su id", () => {
    expect(A).toStrictEqual({ ...SAVED, key: SAVED.id });
  });

  it("lo que se envía no lleva la clave: un ítem guardado va con su id y uno nuevo, sin esa propiedad", () => {
    expect(toItem(A)).toStrictEqual(SAVED);
    expect(toItem(B)).toStrictEqual({
      drillId: null,
      title: "Tres calles",
      phase: null,
      minutes: 15,
      notes: "Sin bote.",
    });
  });

  it("la línea de una propuesta (`hint`) tampoco se envía, tenga o no id la fila", () => {
    const hint = "Rebote · 2 puntos clave";

    expect(toItem({ ...A, hint })).toStrictEqual(SAVED);
    expect(toItem({ ...B, hint })).toStrictEqual(toItem(B));
    expect(toItem({ ...B, hint })).not.toHaveProperty("hint");
  });
});

describe("sameRows", () => {
  it("dos listas con las mismas filas, en el mismo orden y con lo mismo escrito son la misma", () => {
    expect(sameRows([A, B], [{ ...A }, { ...B }])).toBe(true);
    expect(sameRows([], [])).toBe(true);
  });

  it("la línea de una propuesta (`hint`) no cuenta como cambio: con ella, sin ella o con otra, es la misma lista", () => {
    const hinted = { ...B, hint: "Rebote · 2 puntos clave" };

    expect(sameRows([A, hinted], [A, B])).toBe(true);
    expect(sameRows([A, B], [A, hinted])).toBe(true);
    expect(sameRows([A, hinted], [A, { ...B, hint: "Pase · 1 variante" }])).toBe(true);
  });

  it.each([
    ["otro orden", [B, A]],
    ["una fila menos", [A]],
    ["una fila más", [A, B, { ...B, key: "nuevo-2" }]],
    ["otros minutos", [A, { ...B, minutes: 20 }]],
    ["otro título", [{ ...A, title: "Rueda de pases " }, B]],
    ["otra fase", [{ ...A, phase: null }, B]],
    ["otras notas", [A, { ...B, notes: null }]],
    ["la misma fila quitada y añadida de nuevo", [A, { ...B, key: "nuevo-2" }]],
  ])("con %s, no", (_what, other) => {
    expect(sameRows([A, B], other)).toBe(false);
  });
});

describe("errorsByRow", () => {
  const KEYS = ["k0", "k1", "k2"];

  it("reparte cada error en la fila que ocupaba esa posición al enviar, campo a campo", () => {
    const errors = errorsByRow(
      { "items.1.title": "Escribe un título.", "items.1.notes": "Máximo 500 caracteres." },
      KEYS,
    );

    expect([...errors.keys()]).toEqual(["k1"]);
    expect(errors.get("k1")).toEqual({ title: "Escribe un título.", notes: "Máximo 500 caracteres." });
  });

  it("las da de arriba abajo, lleguen como lleguen: la primera es la que se abre", () => {
    const errors = errorsByRow({ "items.2.title": "c", "items.0.minutes": "a", "items.1.phase": "b" }, KEYS);

    expect([...errors.keys()]).toEqual(["k0", "k1", "k2"]);
  });

  it("lo que no es de un campo de una fila, o es de una posición que no se envió, no cuenta", () => {
    const errors = errorsByRow({ items: "Demasiados.", eventId: "x", "items.7.title": "y", "items.x.title": "z" }, KEYS);

    expect(errors.size).toBe(0);
  });
});

describe("phaseOptions", () => {
  it("sin filas: «Sin fase» y las fases de una sesión, en su orden", () => {
    expect(phaseOptions([]).map((option) => option.label)).toEqual([
      "Sin fase",
      "Activación",
      "Técnica",
      "Táctica",
      "Rebote",
      "Transición",
      "Defensa",
      "Competición",
      "Vuelta a la calma",
    ]);
    expect(phaseOptions([])[0]).toEqual({ value: "", label: "Sin fase" });
  });

  it("las fases propias de las filas van detrás, una vez cada una", () => {
    const options = phaseOptions([A, { ...B, phase: "Juego reducido" }, { ...B, phase: "Juego reducido" }]);

    expect(options.slice(9)).toEqual([{ value: "Juego reducido", label: "Juego reducido" }]);
  });
});

describe("withSavedIds", () => {
  const NEW_A: Row = { key: "new-1", drillId: null, title: "A", phase: null, minutes: 10, notes: null };
  const NEW_B: Row = { key: "new-2", drillId: null, title: "B", phase: null, minutes: 15, notes: null };
  const ID_A = "00000000-0000-4000-8000-000000000aa1";
  const ID_B = "00000000-0000-4000-8000-000000000bb2";

  it("pone el id devuelto a cada fila por posición", () => {
    const result = withSavedIds([NEW_A, NEW_B], [ID_A, ID_B]);

    expect(result[0]).toEqual({ ...NEW_A, id: ID_A });
    expect(result[1]).toEqual({ ...NEW_B, id: ID_B });
  });

  it("las filas que ya tenían id lo conservan", () => {
    const withId: Row = { ...NEW_A, id: ID_A };
    const result = withSavedIds([withId, NEW_B], [ID_A, ID_B]);

    expect(result[0].id).toBe(ID_A);
    expect(result[1].id).toBe(ID_B);
  });

  it("si las longitudes no coinciden, devuelve la lista sin tocar", () => {
    const result = withSavedIds([NEW_A, NEW_B], [ID_A]);

    expect(result).toEqual([NEW_A, NEW_B]);
  });

  it("lista vacía devuelve lista vacía", () => {
    expect(withSavedIds([], [])).toEqual([]);
  });
});
