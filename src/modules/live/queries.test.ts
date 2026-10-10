import { afterEach, expect, it, vi } from "vitest";
import type { Board } from "@/modules/board/types";
import type { ClubContext } from "@/modules/tenancy/queries";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), signedUrl: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/media/storage", () => ({ signedUrl: mocks.signedUrl }));

import { getLiveSession } from "./queries";
import type { LiveSession } from "./types";

const ORG = "5b0e1c4e-2a53-4f6b-9a0c-1d2e3f4a5b6c";
const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const PLAN = "00000000-0000-4000-8000-0000000000a1";
const ITEM1 = "00000000-0000-4000-8000-0000000000b1";
const ITEM2 = "00000000-0000-4000-8000-0000000000b2";
const DRILL = "00000000-0000-4000-8000-0000000000d1";
const MEDIA = "00000000-0000-4000-8000-0000000000m1";
const STD = "00000000-0000-4000-8000-0000000000s1";

const CTX: ClubContext = clubContext("coach");

type Reply = { data: unknown; error: unknown };
const ok = (data: unknown): Reply => ({ data, error: null });

const STARTS = "2026-11-17T18:00:00+01:00";
const ENDS = "2026-11-17T19:15:00+01:00";

const eventRow = {
  id: EVENT,
  organization_id: ORG,
  status: "scheduled",
  starts_at: STARTS,
  ends_at: ENDS,
  practice_plans: [
    {
      id: PLAN,
      title: "Sesión de hoy",
      updated_at: "2026-11-17T17:20:00.250000+00:00",
      live_started_at: null,
      live_position: null,
      practice_items: [
        {
          id: ITEM2,
          sort: 2,
          phase: null,
          minutes: 5,
          title_override: null,
          drill_id: null,
          completed: null,
          actual_minutes: null,
          drills: null,
        },
        {
          id: ITEM1,
          sort: 1,
          phase: "Ataque",
          minutes: 10,
          title_override: null,
          drill_id: DRILL,
          completed: true,
          actual_minutes: 9,
          drills: {
            title: "Salida de presión",
            diagram_media_id: MEDIA,
            video_url: "https://youtu.be/abc123",
            media_assets: { path: "org/abc/drills/def/img.png" },
            drill_coaching_points: [
              { is_key: true, sort: 1, text: "Punto clave 1" },
              { is_key: true, sort: 2, text: "Punto clave 2" },
              { is_key: false, sort: 3, text: "Punto no clave" },
              { is_key: true, sort: 4, text: "Punto clave 3" },
              { is_key: true, sort: 5, text: "Punto clave 4" },
            ],
            drill_standards: [
              { standards: { number: 3, title: "Estándar 3" } },
              { standards: { number: 1, title: "Estándar 1" } },
            ],
          },
        },
      ],
    },
  ],
};

function useDb(reply: Reply) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(reply),
  };
  mocks.createClient.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
}

afterEach(() => vi.clearAllMocks());

/** La sesión abierta de la respuesta; falla si no lo es. */
async function openSession(): Promise<LiveSession> {
  const result = await getLiveSession(CTX, EVENT);
  if (result?.status !== "open") throw new Error("se esperaba una sesión abierta");
  return result.session;
}

it("sesión no encontrada → null", async () => {
  useDb(ok(null));
  expect(await getLiveSession(CTX, EVENT)).toBeNull();
});

it("un id que no es un uuid → null sin consultar", async () => {
  useDb(ok(eventRow));
  expect(await getLiveSession(CTX, "no-es-un-id")).toBeNull();
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it("sesión cancelada → null", async () => {
  useDb(ok({ ...eventRow, status: "cancelled" }));
  expect(await getLiveSession(CTX, EVENT)).toBeNull();
});

it("sesión hecha → done, sin sesión que dirigir", async () => {
  useDb(ok({ ...eventRow, status: "done" }));
  expect(await getLiveSession(CTX, EVENT)).toEqual({ status: "done" });
});

it("evento sin plan → null", async () => {
  useDb(ok({ ...eventRow, practice_plans: [] }));
  expect(await getLiveSession(CTX, EVENT)).toBeNull();
});

it("un error de lectura lanza", async () => {
  useDb({ data: null, error: { code: "XX000", message: "boom" } });
  await expect(getLiveSession(CTX, EVENT)).rejects.toThrow("live.session");
});

it("items en orden ascendente por sort", async () => {
  mocks.signedUrl.mockResolvedValue("https://storage.example.com/img.png");
  useDb(ok(eventRow));
  const session = await openSession();
  expect(session.items[0].id).toBe(ITEM1);
  expect(session.items[1].id).toBe(ITEM2);
});

it("solo los primeros 3 coaching points is_key", async () => {
  mocks.signedUrl.mockResolvedValue("https://storage.example.com/img.png");
  useDb(ok(eventRow));
  const session = await openSession();
  expect(session.items[0].keyPoints).toHaveLength(3);
  expect(session.items[0].keyPoints[0]).toBe("Punto clave 1");
});

it("standards del ejercicio", async () => {
  mocks.signedUrl.mockResolvedValue("https://storage.example.com/img.png");
  useDb(ok(eventRow));
  const session = await openSession();
  expect(session.items[0].standards).toHaveLength(2);
  expect(session.items[0].standards[0]).toMatchObject({ number: 3, title: "Estándar 3" });
});

it("ítem sin drill → keyPoints vacíos, sin diagrama ni vídeo", async () => {
  useDb(ok(eventRow));
  const session = await openSession();
  expect(session.items[1].keyPoints).toHaveLength(0);
  expect(session.items[1].diagramUrl).toBeNull();
  expect(session.items[1].videoUrl).toBeNull();
});

it("el vídeo y lo registrado de cada ejercicio", async () => {
  mocks.signedUrl.mockResolvedValue(null);
  useDb(ok(eventRow));
  const session = await openSession();
  expect(session.items[0]).toMatchObject({
    videoUrl: "https://youtu.be/abc123",
    completed: true,
    actualMinutes: 9,
  });
  expect(session.items[1]).toMatchObject({ completed: null, actualMinutes: null });
});

it("devuelve clubSlug y eventId", async () => {
  mocks.signedUrl.mockResolvedValue(null);
  useDb(ok(eventRow));
  const session = await openSession();
  expect(session.clubSlug).toBe(CTX.org.slug);
  expect(session.eventId).toBe(EVENT);
});

it("sin empezar: el servidor no tiene inicio ni posición", async () => {
  mocks.signedUrl.mockResolvedValue(null);
  useDb(ok(eventRow));
  const session = await openSession();
  expect(session.live).toEqual({ startedAt: null, position: null, updatedAt: "2026-11-17T17:20:00.250000+00:00" });
});

it("en curso: cuándo se inició y por qué ejercicio va", async () => {
  mocks.signedUrl.mockResolvedValue(null);
  const [plan] = eventRow.practice_plans;
  useDb(
    ok({
      ...eventRow,
      practice_plans: [{ ...plan, live_started_at: "2026-11-17T17:02:00+00:00", live_position: 1 }],
    }),
  );
  const session = await openSession();
  expect(session.live).toEqual({ startedAt: "2026-11-17T17:02:00+00:00", position: 1, updatedAt: "2026-11-17T17:20:00.250000+00:00" });
});

// ── La pizarra y cómo se organiza ────────────────────────────────────────────────────────

/** Una pizarra válida y pequeña: el 1 pasa al 2 y corta. */
const BOARD: Board = {
  version: 1,
  court: "half",
  tokens: [
    { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
    { id: "a2", kind: "attacker", label: "2", at: { x: 20, y: 60 } },
    { id: "ball", kind: "ball", at: { x: 53, y: 80 } },
  ],
  steps: [
    {
      note: "El 1 pasa al 2 y corta",
      moves: [
        { token: "ball", kind: "pass", to: { x: 23, y: 60 } },
        { token: "a1", kind: "cut", to: { x: 50, y: 30 } },
      ],
    },
  ],
};

const IMAGE_PATH = "org/abc/drills/def/img.png";
const SIGNED = "https://storage.example.com/img.png";

/** La misma sesión con `overrides` en el ejercicio de su ítem con ejercicio (el primero por `sort`). */
function withDrill(overrides: Record<string, unknown>) {
  const [plan] = eventRow.practice_plans;
  return {
    ...eventRow,
    practice_plans: [
      {
        ...plan,
        practice_items: plan.practice_items.map((item) =>
          item.drills ? { ...item, drills: { ...item.drills, ...overrides } } : item,
        ),
      },
    ],
  };
}

it("un ejercicio con pizarra la lleva, ya validada", async () => {
  mocks.signedUrl.mockResolvedValue(SIGNED);
  useDb(ok(withDrill({ board: { ...BOARD, autor: "alguien" } })));

  const session = await openSession();

  expect(session.items[0].board).toEqual(BOARD);
  expect(session.items[0].board).not.toHaveProperty("autor");
});

it("con pizarra no se firma la imagen: manda la pizarra y la URL no se usaría", async () => {
  mocks.signedUrl.mockResolvedValue(SIGNED);
  // El ejercicio de la sesión tiene las dos cosas: imagen subida (`media_assets`) y pizarra.
  useDb(ok(withDrill({ board: BOARD })));

  const session = await openSession();

  expect(mocks.signedUrl).not.toHaveBeenCalled();
  expect(session.items[0].diagramUrl).toBeNull();
  expect(session.items[0].board).toEqual(BOARD);
});

it("sin pizarra y con imagen, se firma como antes y la clave `board` no está", async () => {
  mocks.signedUrl.mockResolvedValue(SIGNED);
  useDb(ok(withDrill({ board: null })));

  const session = await openSession();

  expect(mocks.signedUrl).toHaveBeenCalledTimes(1);
  expect(mocks.signedUrl).toHaveBeenCalledWith(IMAGE_PATH, expect.any(Number));
  expect(session.items[0].diagramUrl).toBe(SIGNED);
  expect(session.items[0]).not.toHaveProperty("board");
});

it("sin la columna en la fila es lo mismo: se firma la imagen y no hay `board`", async () => {
  mocks.signedUrl.mockResolvedValue(SIGNED);
  useDb(ok(eventRow));

  const session = await openSession();

  expect(mocks.signedUrl).toHaveBeenCalledTimes(1);
  expect(session.items[0].diagramUrl).toBe(SIGNED);
  expect(session.items[0]).not.toHaveProperty("board");
});

it.each([
  ["otra versión", { ...BOARD, version: 2 }],
  ["sin fichas", { ...BOARD, tokens: [] }],
  ["un objeto de la versión 1 sin nada más", { version: 1 }],
  ["un texto", "una pizarra"],
])("una pizarra rota (%s) es como no tenerla: sin `board`, y con la imagen firmada", async (_name, board) => {
  mocks.signedUrl.mockResolvedValue(SIGNED);
  useDb(ok(withDrill({ board })));

  const session = await openSession();

  expect(session.items[0]).not.toHaveProperty("board");
  expect(mocks.signedUrl).toHaveBeenCalledWith(IMAGE_PATH, expect.any(Number));
  expect(session.items[0].diagramUrl).toBe(SIGNED);
});

it("con pizarra y sin imagen: la pizarra, sin diagrama y sin firmar nada", async () => {
  useDb(ok(withDrill({ board: BOARD, diagram_media_id: null, media_assets: null })));

  const session = await openSession();

  expect(session.items[0].board).toEqual(BOARD);
  expect(session.items[0].diagramUrl).toBeNull();
  expect(mocks.signedUrl).not.toHaveBeenCalled();
});

it("la pizarra no quita lo demás del ejercicio: título, vídeo, puntos clave y Standards", async () => {
  useDb(ok(withDrill({ board: BOARD })));

  const session = await openSession();

  expect(session.items[0]).toMatchObject({
    id: ITEM1,
    title: "Salida de presión",
    videoUrl: "https://youtu.be/abc123",
    keyPoints: ["Punto clave 1", "Punto clave 2", "Punto clave 3"],
    completed: true,
    actualMinutes: 9,
  });
  expect(session.items[0].standards).toHaveLength(2);
});

it("cómo se organiza: `setup` es el `setup_md` del ejercicio, recortado", async () => {
  mocks.signedUrl.mockResolvedValue(null);
  useDb(ok(withDrill({ setup_md: "  \nDos filas en la línea de fondo.\n\nUn balón por pareja.\n  " })));

  const session = await openSession();

  // Solo se recortan los extremos: lo de dentro es Markdown y queda tal cual.
  expect(session.items[0].setup).toBe("Dos filas en la línea de fondo.\n\nUn balón por pareja.");
});

it.each([
  ["null", null],
  ["vacío", ""],
  ["solo espacios y saltos de línea", "  \n\t "],
])("un `setup_md` %s deja el ítem sin la clave `setup`", async (_name, setup_md) => {
  mocks.signedUrl.mockResolvedValue(null);
  useDb(ok(withDrill({ setup_md })));

  const session = await openSession();

  // Ni `""` ni `undefined`: la clave no viaja.
  expect(session.items[0]).not.toHaveProperty("setup");
});

it("sin la columna `setup_md` en la fila tampoco hay `setup`", async () => {
  mocks.signedUrl.mockResolvedValue(null);
  useDb(ok(eventRow));

  const session = await openSession();

  expect(session.items[0]).not.toHaveProperty("setup");
});

it("la pizarra y cómo se organiza no dependen una de otra", async () => {
  mocks.signedUrl.mockResolvedValue(SIGNED);
  useDb(ok(withDrill({ board: BOARD, setup_md: "Por parejas." })));
  const both = (await openSession()).items[0];
  expect(both.board).toEqual(BOARD);
  expect(both.setup).toBe("Por parejas.");

  useDb(ok(withDrill({ board: { version: 2 }, setup_md: "Por parejas." })));
  const onlySetup = (await openSession()).items[0];
  expect(onlySetup).not.toHaveProperty("board");
  expect(onlySetup.setup).toBe("Por parejas.");
});

it("un ítem sin ejercicio no lleva pizarra ni cómo se organiza, y no firma nada", async () => {
  useDb(ok(withDrill({ board: BOARD, setup_md: "Por parejas." })));

  const session = await openSession();

  // El segundo ítem es un bloque libre (`drills: null`); el primero, con pizarra, tampoco firma.
  expect(session.items[1].id).toBe(ITEM2);
  expect(session.items[1]).not.toHaveProperty("board");
  expect(session.items[1]).not.toHaveProperty("setup");
  expect(session.items[1].diagramUrl).toBeNull();
  expect(mocks.signedUrl).not.toHaveBeenCalled();
});
