import { beforeEach, expect, it, vi } from "vitest";
import type { LiveSession } from "@/modules/live/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), getLiveSession: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/live/queries", () => ({ getLiveSession: mocks.getLiveSession }));
vi.mock("./live-screen", () => ({ LiveScreen: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (href: string) => {
    throw new Error(`REDIRECT ${href}`);
  },
}));

import LivePage from "./page";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const DETAIL = `/c/club-a/train/${EVENT}`;

const SESSION: LiveSession = {
  eventId: EVENT,
  clubSlug: "club-a",
  title: "Sesión",
  startsAt: "2026-11-17T18:00:00+01:00",
  items: [
    {
      id: "00000000-0000-4000-8000-0000000000a1",
      title: "Ejercicio",
      phase: null,
      minutes: 10,
      diagramUrl: null,
      videoUrl: null,
      keyPoints: [],
      standards: [],
      completed: null,
      actualMinutes: null,
    },
  ],
  live: { startedAt: null, position: null },
};

const open = () => LivePage({ params: Promise.resolve({ club: "club-a", eventId: EVENT }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
});

it("una sesión abierta pinta el directo con ella", async () => {
  mocks.getLiveSession.mockResolvedValue({ status: "open", session: SESSION });

  const page = await open();

  expect(page.props).toMatchObject({ session: SESSION, clubSlug: "club-a" });
});

it("una sesión hecha lleva a su ficha", async () => {
  mocks.getLiveSession.mockResolvedValue({ status: "done" });

  await expect(open()).rejects.toThrow(`REDIRECT ${DETAIL}`);
});

it("una sesión sin ejercicios lleva a su ficha", async () => {
  mocks.getLiveSession.mockResolvedValue({ status: "open", session: { ...SESSION, items: [] } });

  await expect(open()).rejects.toThrow(`REDIRECT ${DETAIL}`);
});

it("una sesión que no se ve es un 404", async () => {
  mocks.getLiveSession.mockResolvedValue(null);

  await expect(open()).rejects.toThrow("NOT_FOUND");
});

it("sin club no se lee nada", async () => {
  mocks.getClubContext.mockResolvedValue(null);

  await expect(open()).rejects.toThrow("NOT_FOUND");
  expect(mocks.getLiveSession).not.toHaveBeenCalled();
});
