import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireClub: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/guards", () => ({ requireClub: mocks.requireClub }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { updateClub } from "./actions";

type Reply = { data: unknown; error: { code: string; message: string } | null };

function installDatabase({
  orgRows = [{ id: "x" }] as Array<{ id: string }>,
  brandingRows = [{ organization_id: "x" }] as Array<{ organization_id: string }>,
}: { orgRows?: Array<{ id: string }>; brandingRows?: Array<{ organization_id: string }> } = {}) {
  const updates: Array<{ table: string; values: unknown; eq: Record<string, unknown> }> = [];
  mocks.createClient.mockResolvedValue({
    from: (table: string) => {
      const update = { table, values: null as unknown, eq: {} as Record<string, unknown> };
      updates.push(update);
      const rows = table === "organizations" ? orgRows : brandingRows;
      const builder = {
        update: (values: unknown) => ((update.values = values), builder),
        eq: (c: string, v: unknown) => ((update.eq[c] = v), builder),
        select: (): Reply => ({ data: rows, error: null }),
      };
      return builder;
    },
  });
  return updates;
}

const ADMIN = clubContext("admin");
const ORG = ADMIN.org.id;

const INPUT = {
  name: "Club A",
  timezone: "Europe/Madrid",
  displayName: "Club A",
  wordmarkSub: "",
  shortName: "cla",
  wayName: "El camino",
  tagline: "",
  accent: "#5AA9E6",
  wayTerm: "",
  standardsTerm: "",
  termsText: "Condiciones de prueba.",
  imageConsentText: "Imagen de prueba.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClub.mockResolvedValue(ADMIN);
});

describe("updateClub", () => {
  it("guarda el club y su marca, derivando los otros tres colores del acento", async () => {
    const updates = installDatabase();

    const result = await updateClub("club-a", INPUT);

    expect(result).toEqual({ ok: true, data: null });
    expect(updates[0]).toMatchObject({
      table: "organizations",
      values: { name: "Club A", timezone: "Europe/Madrid" },
      eq: { id: ORG },
    });
    expect(updates[1]?.table).toBe("organization_branding");
    const branding = updates[1]?.values as Record<string, unknown>;
    expect(branding.color_accent).toBe("#5aa9e6");
    expect(branding.color_on_accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(branding.short_name).toBe("CLA");
    expect(branding.terms_text).toBe("Condiciones de prueba.");
    expect(branding.terminology).toEqual({});
  });

  it("solo la terminología que se rellena entra en el jsonb", async () => {
    const updates = installDatabase();

    await updateClub("club-a", { ...INPUT, wayTerm: "Nuestra forma", standardsTerm: "Normas" });

    expect((updates[1]?.values as Record<string, unknown>).terminology).toEqual({
      way: "Nuestra forma",
      standards: "Normas",
    });
  });

  it("un acento con mal formato: INVALID, sin tocar la base", async () => {
    const updates = installDatabase();

    const result = await updateClub("club-a", { ...INPUT, accent: "azul" });

    expect(result).toMatchObject({ ok: false, error: "INVALID", fieldErrors: { accent: "Un color en formato #rrggbb." } });
    expect(updates).toEqual([]);
  });

  it("un acento que no contrasta: INVALID, con el tono sugerido en el mensaje", async () => {
    const updates = installDatabase();

    const result = await updateClub("club-a", { ...INPUT, accent: "#1a3550" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID");
    expect(result.fieldErrors?.accent).toMatch(/^No se lee bien sobre el fondo de la app\. Prueba con #[0-9a-f]{6}\.$/);
    expect(updates).toEqual([]);
  });

  it("un club que ya no existe (o no es el suyo): NOT_FOUND", async () => {
    installDatabase({ orgRows: [] });

    expect(await updateClub("club-a", INPUT)).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
