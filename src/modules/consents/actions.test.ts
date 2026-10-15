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

import { acceptTerms, grantImageConsent, revokeImageConsent } from "./actions";

type Reply = { data: unknown; error: { code: string; message: string } | null };

function installDatabase(rpc: Reply) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  mocks.createClient.mockResolvedValue({
    rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), rpc),
  });
  return calls;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PERSON = uuid(1);
const CONSENT = uuid(2);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("acceptTerms", () => {
  it.each(["admin", "coach", "player", "guardian"] as const)(
    "cualquier rol (%s) puede aceptar los términos",
    async (role) => {
      mocks.requireClub.mockResolvedValue(clubContext(role));
      const calls = installDatabase({ data: CONSENT, error: null });

      const result = await acceptTerms("club-a");

      expect(result).toEqual({ ok: true, data: { consentId: CONSENT } });
      expect(calls).toEqual([{ fn: "grant_terms_consent", args: { p_org: clubContext(role).org.id } }]);
    },
  );

  it("ya aceptados: el P0002 de la función se traduce a NOT_FOUND", async () => {
    mocks.requireClub.mockResolvedValue(clubContext("coach"));
    installDatabase({ data: null, error: { code: "23505", message: "duplicate key" } });

    expect(await acceptTerms("club-a")).toEqual({ ok: false, error: "INVALID" });
  });
});

describe("grantImageConsent", () => {
  it("quien no es tutor: el CONSENT_GRANTOR de la función llega tal cual", async () => {
    mocks.requireClub.mockResolvedValue(clubContext("coach"));
    installDatabase({ data: null, error: { code: "P0001", message: "CONSENT_GRANTOR" } });

    expect(await grantImageConsent("club-a", { personId: PERSON })).toEqual({
      ok: false,
      error: "CONSENT_GRANTOR",
    });
  });

  it("el tutor da el consentimiento de su hijo", async () => {
    mocks.requireClub.mockResolvedValue(clubContext("coach"));
    const calls = installDatabase({ data: CONSENT, error: null });

    const result = await grantImageConsent("club-a", { personId: PERSON });

    expect(result).toEqual({ ok: true, data: { consentId: CONSENT } });
    expect(calls).toEqual([{ fn: "grant_image_consent", args: { p_person: PERSON } }]);
  });
});

describe("revokeImageConsent", () => {
  it("quien no es dirección: NOT_FOUND", async () => {
    mocks.requireClub.mockResolvedValue(clubContext("coach"));
    installDatabase({ data: null, error: { code: "P0002", message: "NOT_FOUND" } });

    expect(await revokeImageConsent("club-a", { consentId: CONSENT })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("dirección revoca", async () => {
    mocks.requireClub.mockResolvedValue(clubContext("admin"));
    const calls = installDatabase({ data: null, error: null });

    expect(await revokeImageConsent("club-a", { consentId: CONSENT })).toEqual({ ok: true, data: null });
    expect(calls).toEqual([{ fn: "revoke_image_consent", args: { p_consent: CONSENT } }]);
  });
});
