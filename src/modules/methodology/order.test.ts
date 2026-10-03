import { describe, expect, it } from "vitest";
import { moveAt, moveId } from "./order";

describe("moveId", () => {
  it("sube un elemento una posición", () => {
    expect(moveId(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
  });

  it("baja un elemento una posición", () => {
    expect(moveId(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("el primero no sube", () => {
    expect(moveId(["a", "b", "c"], "a", "up")).toEqual(["a", "b", "c"]);
  });

  it("el último no baja", () => {
    expect(moveId(["a", "b", "c"], "c", "down")).toEqual(["a", "b", "c"]);
  });

  it("un id desconocido no cambia nada", () => {
    expect(moveId(["a", "b", "c"], "z", "up")).toEqual(["a", "b", "c"]);
    expect(moveId(["a", "b", "c"], "z", "down")).toEqual(["a", "b", "c"]);
  });

  it("una lista vacía sigue vacía", () => {
    expect(moveId([], "a", "up")).toEqual([]);
  });

  it("no muta la entrada", () => {
    const ids = ["a", "b", "c"];
    const moved = moveId(ids, "b", "up");

    expect(ids).toEqual(["a", "b", "c"]);
    expect(moved).not.toBe(ids);
  });

  it("devuelve una lista nueva aunque no cambie nada", () => {
    const ids = ["a", "b"];

    expect(moveId(ids, "a", "up")).not.toBe(ids);
    expect(moveId(ids, "z", "down")).not.toBe(ids);
  });
});

describe("moveAt", () => {
  it("baja el primero", () => {
    expect(moveAt(["x", "y"], 0, "down")).toEqual(["y", "x"]);
  });

  it("sube el último", () => {
    expect(moveAt(["x", "y"], 1, "up")).toEqual(["y", "x"]);
  });

  it("mueve solo ese elemento y deja el resto en su sitio", () => {
    expect(moveAt([1, 2, 3, 4], 2, "up")).toEqual([1, 3, 2, 4]);
    expect(moveAt([1, 2, 3, 4], 1, "down")).toEqual([1, 3, 2, 4]);
  });

  it("en los extremos no hay movimiento", () => {
    expect(moveAt(["x", "y"], 0, "up")).toEqual(["x", "y"]);
    expect(moveAt(["x", "y"], 1, "down")).toEqual(["x", "y"]);
  });

  it("un índice fuera de rango no cambia nada", () => {
    expect(moveAt(["x", "y"], -1, "down")).toEqual(["x", "y"]);
    expect(moveAt(["x", "y"], 2, "up")).toEqual(["x", "y"]);
    expect(moveAt(["x", "y"], 0.5, "down")).toEqual(["x", "y"]);
  });

  it("mueve cualquier tipo de elemento sin compararlo", () => {
    const first = { id: 1 };
    const second = { id: 2 };

    expect(moveAt([first, second], 0, "down")).toEqual([second, first]);
  });

  it("no muta la entrada", () => {
    const items = ["x", "y", "z"];
    const moved = moveAt(items, 0, "down");

    expect(items).toEqual(["x", "y", "z"]);
    expect(moved).not.toBe(items);
  });
});
