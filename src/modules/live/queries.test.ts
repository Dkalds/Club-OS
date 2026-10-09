import { afterEach, expect, it, vi } from "vitest";
import type { ClubContext } from "@/modules/tenancy/queries";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), signedUrl: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/modules/media/storage", () => ({ signedUrl: mocks.signedUrl }));

import { getLiveSession } from "./queries";

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
      practice_items: [
        {
          id: ITEM2,
          sort: 2,
          phase: null,
          minutes: 5,
          title_override: null,
          drill_id: null,
          drills: null,
        },
        {
          id: ITEM1,
          sort: 1,
          phase: "Ataque",
          minutes: 10,
          title_override: null,
          drill_id: DRILL,
          drills: {
            title: "Salida de presión",
            diagram_media_id: MEDIA,
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

it("sesión no encontrada → null", async () => {
  useDb(ok(null));
  const result = await getLiveSession(CTX, EVENT);
  expect(result).toBeNull();
});

it("sesión no scheduled → null", async () => {
  useDb(ok({ ...eventRow, status: "done" }));
  const result = await getLiveSession(CTX, EVENT);
  expect(result).toBeNull();
});

it("items en orden ascendente por sort", async () => {
  mocks.signedUrl.mockResolvedValue("https://storage.example.com/img.png");
  useDb(ok(eventRow));
  const session = await getLiveSession(CTX, EVENT);
  expect(session?.items[0].id).toBe(ITEM1);
  expect(session?.items[1].id).toBe(ITEM2);
});

it("solo los primeros 3 coaching points is_key", async () => {
  mocks.signedUrl.mockResolvedValue("https://storage.example.com/img.png");
  useDb(ok(eventRow));
  const session = await getLiveSession(CTX, EVENT);
  expect(session?.items[0].keyPoints).toHaveLength(3);
  expect(session?.items[0].keyPoints[0]).toBe("Punto clave 1");
});

it("standards del ejercicio", async () => {
  mocks.signedUrl.mockResolvedValue("https://storage.example.com/img.png");
  useDb(ok(eventRow));
  const session = await getLiveSession(CTX, EVENT);
  expect(session?.items[0].standards).toHaveLength(2);
  expect(session?.items[0].standards[0]).toMatchObject({ number: 3, title: "Estándar 3" });
});

it("ítem sin drill → keyPoints vacíos, diagramUrl null", async () => {
  useDb(ok(eventRow));
  const session = await getLiveSession(CTX, EVENT);
  expect(session?.items[1].keyPoints).toHaveLength(0);
  expect(session?.items[1].diagramUrl).toBeNull();
});

it("devuelve clubSlug y eventId", async () => {
  mocks.signedUrl.mockResolvedValue(null);
  useDb(ok(eventRow));
  const session = await getLiveSession(CTX, EVENT);
  expect(session?.clubSlug).toBe(CTX.org.slug);
  expect(session?.eventId).toBe(EVENT);
});
