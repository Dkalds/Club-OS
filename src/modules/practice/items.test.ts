import { describe, expect, it } from "vitest";
import { DEFAULT_PHASES, changeMinutes, moveItem, phaseBlocks, totalMinutes } from "./items";

describe("DEFAULT_PHASES", () => {
  it("son las ocho fases del contrato, en su orden", () => {
    expect(DEFAULT_PHASES).toEqual([
      "Activación",
      "Técnica",
      "Táctica",
      "Rebote",
      "Transición",
      "Defensa",
      "Competición",
      "Vuelta a la calma",
    ]);
  });
});

describe("totalMinutes", () => {
  it("suma los minutos de todos los ítems", () => {
    const items = [10, 15, 15, 20, 15].map((minutes) => ({ minutes }));

    expect(totalMinutes(items)).toBe(75);
  });

  it("una sesión sin ítems suma 0", () => {
    expect(totalMinutes([])).toBe(0);
  });
});

describe("moveItem", () => {
  it("lleva el primero al final", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("lleva el último al principio", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("mueve una posición y deja el resto en su sitio", () => {
    expect(moveItem([1, 2, 3, 4], 1, 2)).toEqual([1, 3, 2, 4]);
    expect(moveItem([1, 2, 3, 4], 2, 1)).toEqual([1, 3, 2, 4]);
  });

  it("con el mismo índice no cambia nada", () => {
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("un índice fuera de rango no cambia nada", () => {
    expect(moveItem(["a", "b", "c"], 0, 5)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 5, 0)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], -1, 1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 0.5, 2)).toEqual(["a", "b", "c"]);
  });

  it("una lista vacía sigue vacía", () => {
    expect(moveItem([], 0, 0)).toEqual([]);
  });

  it("mueve cualquier tipo de elemento sin compararlo", () => {
    const first = { id: 1 };
    const second = { id: 2 };

    expect(moveItem([first, second], 0, 1)).toEqual([second, first]);
  });

  it("no muta la entrada y devuelve una lista nueva aunque no cambie nada", () => {
    const items = ["a", "b", "c"];
    const moved = moveItem(items, 0, 2);
    const same = moveItem(items, 1, 1);
    const outOfRange = moveItem(items, 0, 5);

    expect(items).toEqual(["a", "b", "c"]);
    expect(moved).not.toBe(items);
    expect(same).not.toBe(items);
    expect(outOfRange).not.toBe(items);
  });
});

describe("changeMinutes", () => {
  /** La lista de un solo ítem con `minutes`, cambiada en `delta`, y el resultado. */
  function change(minutes: number, delta: 5 | -5): number {
    return changeMinutes([{ minutes }], 0, delta)[0].minutes;
  }

  it("al subir, redondea al siguiente múltiplo de 5", () => {
    expect(change(10, 5)).toBe(15);
    expect(change(12, 5)).toBe(15);
  });

  it("al bajar, redondea al múltiplo de 5 anterior", () => {
    expect(change(12, -5)).toBe(10);
    expect(change(15, -5)).toBe(10);
  });

  it("al bajar no pasa de 1 minuto", () => {
    expect(change(5, -5)).toBe(1);
    expect(change(1, -5)).toBe(1);
  });

  it("al subir desde 1 salta al 5", () => {
    expect(change(1, 5)).toBe(5);
  });

  it("al subir no pasa de 120 minutos", () => {
    expect(change(120, 5)).toBe(120);
    expect(change(118, 5)).toBe(120);
    expect(change(115, 5)).toBe(120);
  });

  it("solo cambia el ítem del índice dado y conserva el resto de sus campos", () => {
    const items = [
      { id: "a", minutes: 10 },
      { id: "b", minutes: 20 },
      { id: "c", minutes: 30 },
    ];

    expect(changeMinutes(items, 1, 5)).toEqual([
      { id: "a", minutes: 10 },
      { id: "b", minutes: 25 },
      { id: "c", minutes: 30 },
    ]);
  });

  it("un índice fuera de rango devuelve una copia sin cambios", () => {
    const items = [{ minutes: 10 }, { minutes: 20 }];

    for (const index of [-1, 2, 0.5]) {
      const result = changeMinutes(items, index, 5);

      expect(result).toEqual([{ minutes: 10 }, { minutes: 20 }]);
      expect(result).not.toBe(items);
    }
  });

  it("no muta la entrada ni sus ítems", () => {
    const items = [{ minutes: 10 }, { minutes: 20 }];
    const changed = changeMinutes(items, 0, 5);

    expect(items).toEqual([{ minutes: 10 }, { minutes: 20 }]);
    expect(changed).not.toBe(items);
    expect(changed[0]).not.toBe(items[0]);
  });
});

describe("phaseBlocks", () => {
  const items = [
    { phase: "Activación", minutes: 10 },
    { phase: "Técnica", minutes: 15 },
    { phase: "Técnica", minutes: 15 },
    { phase: null, minutes: 20 },
    { phase: "Técnica", minutes: 15 },
  ];

  it("agrupa los ítems consecutivos de la misma fase", () => {
    const blocks = phaseBlocks(items);

    expect(blocks.map((block) => block.phase)).toEqual(["Activación", "Técnica", null, "Técnica"]);
    expect(blocks.map((block) => block.items.length)).toEqual([1, 2, 1, 1]);
  });

  it("cada bloque dice en qué ítem empieza", () => {
    expect(phaseBlocks(items).map((block) => block.startIndex)).toEqual([0, 1, 3, 4]);
  });

  it("cada bloque suma los minutos de sus ítems", () => {
    expect(phaseBlocks(items).map((block) => block.minutes)).toEqual([10, 30, 20, 15]);
  });

  it("una misma fase separada por otra abre un bloque nuevo", () => {
    const blocks = phaseBlocks(items);

    expect(blocks[1].phase).toBe("Técnica");
    expect(blocks[3].phase).toBe("Técnica");
  });

  it("junta los ítems sin fase consecutivos", () => {
    const blocks = phaseBlocks([
      { phase: null, minutes: 5 },
      { phase: null, minutes: 10 },
    ]);

    expect(blocks).toEqual([
      {
        phase: null,
        startIndex: 0,
        items: [
          { phase: null, minutes: 5 },
          { phase: null, minutes: 10 },
        ],
        minutes: 15,
      },
    ]);
  });

  it("conserva los propios ítems, con todos sus campos, dentro de cada bloque", () => {
    const first = { id: "a", phase: "Técnica", minutes: 10 };
    const second = { id: "b", phase: "Técnica", minutes: 5 };

    expect(phaseBlocks([first, second])[0].items).toEqual([first, second]);
  });

  it("sin ítems no hay bloques", () => {
    expect(phaseBlocks([])).toEqual([]);
  });

  it("no muta la entrada", () => {
    const input = [
      { phase: "Técnica", minutes: 10 },
      { phase: "Técnica", minutes: 5 },
    ];
    const snapshot = structuredClone(input);

    phaseBlocks(input);

    expect(input).toEqual(snapshot);
  });
});
