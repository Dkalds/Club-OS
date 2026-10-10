import { describe, expect, it } from "vitest";
import { liveProgressSchema } from "./schema";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const ITEM = "00000000-0000-4000-8000-0000000000b1";

const valid = {
  clubSlug: "club-a",
  eventId: EVENT,
  items: [{ id: ITEM, completed: true, actualMinutes: 10 }],
  finished: false,
};

it("acepta un cuerpo válido", () => {
  const result = liveProgressSchema.safeParse(valid);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.items[0].actualMinutes).toBe(10);
  }
});

it("acepta actualMinutes nulo en un ítem", () => {
  const body = { ...valid, items: [{ id: ITEM, completed: false, actualMinutes: null }] };
  expect(liveProgressSchema.safeParse(body).success).toBe(true);
});

it("acepta actualMinutes de sesión opcional", () => {
  const body = { ...valid, actualMinutes: 45 };
  const result = liveProgressSchema.safeParse(body);
  expect(result.success).toBe(true);
  if (result.success) expect(result.data.actualMinutes).toBe(45);
});

it("eventId no uuid → falla", () => {
  const result = liveProgressSchema.safeParse({ ...valid, eventId: "no-es-uuid" });
  expect(result.success).toBe(false);
});

it("ítem sin id → falla", () => {
  const result = liveProgressSchema.safeParse({
    ...valid,
    items: [{ completed: true, actualMinutes: null }],
  });
  expect(result.success).toBe(false);
});

it("actualMinutes de ítem fuera de rango → falla", () => {
  const result = liveProgressSchema.safeParse({
    ...valid,
    items: [{ id: ITEM, completed: true, actualMinutes: 200 }],
  });
  expect(result.success).toBe(false);
});

it("clubSlug vacío → falla", () => {
  expect(liveProgressSchema.safeParse({ ...valid, clubSlug: "" }).success).toBe(false);
});

describe("sin items", () => {
  it("acepta lista vacía", () => {
    expect(liveProgressSchema.safeParse({ ...valid, items: [] }).success).toBe(true);
  });
});

describe("estado del directo", () => {
  it("acepta el inicio en ISO y la posición", () => {
    const body = { ...valid, startedAt: "2026-11-17T17:02:00.000Z", position: 3 };
    const result = liveProgressSchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startedAt).toBe("2026-11-17T17:02:00.000Z");
      expect(result.data.position).toBe(3);
    }
  });

  it("acepta el inicio con desfase", () => {
    const body = { ...valid, startedAt: "2026-11-17T18:02:00+01:00" };
    expect(liveProgressSchema.safeParse(body).success).toBe(true);
  });

  it("sin ellos sigue siendo válido", () => {
    const result = liveProgressSchema.safeParse(valid);
    expect(result.success && result.data.startedAt).toBeUndefined();
  });

  it("un inicio que no es una fecha → falla", () => {
    expect(liveProgressSchema.safeParse({ ...valid, startedAt: "ayer" }).success).toBe(false);
  });

  it("posición fuera de 0–29 o con decimales → falla", () => {
    for (const position of [-1, 30, 1.5]) {
      expect(liveProgressSchema.safeParse({ ...valid, position }).success).toBe(false);
    }
  });
});
