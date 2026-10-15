import { describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { getConsentStatus, getConsentTexts } from "./queries";

// Un doble mínimo: aplica el `eq`/`is`/`in` por tabla y devuelve lo que toque. RLS no se
// simula. Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).

type Row = Record<string, unknown>;

function installDatabase({
  userId = "user-1",
  consents = [] as Row[],
  guardianships = [] as Row[],
  activeImageConsents = [] as Row[],
  branding = { terms_text: "Condiciones.", image_consent_text: "Imagen." } as Row,
}: {
  userId?: string | null;
  consents?: Row[];
  guardianships?: Row[];
  activeImageConsents?: Row[];
  branding?: Row;
} = {}) {
  mocks.createClient.mockResolvedValue({
    auth: { getClaims: async () => ({ data: userId ? { claims: { sub: userId } } : null, error: null }) },
    from: (table: string) => {
      if (table === "consents") {
        const eq: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          eq: (c: string, v: unknown) => ((eq[c] = v), builder),
          is: () => builder,
          in: () => Promise.resolve({ data: activeImageConsents, error: null }),
          // Aplica de verdad el filtro por autor, como hace PostgREST.
          limit: () =>
            Promise.resolve({
              data: consents.filter((row) => !("granted_by" in eq) || row.granted_by === eq.granted_by),
              error: null,
            }),
        };
        return builder;
      }
      if (table === "organization_branding") {
        const builder = { select: () => builder, eq: () => builder, single: () => Promise.resolve({ data: branding, error: null }) };
        return builder;
      }
      let calls = 0;
      const builder = {
        select: () => builder,
        eq: () => {
          calls += 1;
          return calls < 2 ? builder : Promise.resolve({ data: guardianships, error: null });
        },
      };
      return builder;
    },
  });
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = clubContext("admin");
const COACH = clubContext("coach");

describe("getConsentTexts", () => {
  it("lee los dos textos vigentes del club", async () => {
    installDatabase({ branding: { terms_text: "Condiciones de prueba.", image_consent_text: "Imagen de prueba." } });

    expect(await getConsentTexts(COACH)).toEqual({
      termsText: "Condiciones de prueba.",
      imageConsentText: "Imagen de prueba.",
    });
  });
});

describe("getConsentStatus", () => {
  it("sin ninguna fila de términos: needsTerms true", async () => {
    installDatabase();

    expect(await getConsentStatus(COACH)).toMatchObject({ needsTerms: true });
  });

  it("con una fila de términos suya: needsTerms false", async () => {
    installDatabase({ consents: [{ id: uuid(1), granted_by: "user-1" }] });

    expect(await getConsentStatus(COACH)).toMatchObject({ needsTerms: false });
  });

  it("dirección ve los términos de otros (RLS), pero solo cuentan los suyos", async () => {
    installDatabase({ consents: [{ id: uuid(1), granted_by: "otra-cuenta" }] });

    expect(await getConsentStatus(ADMIN)).toMatchObject({ needsTerms: true });
  });

  it("sin sesión verificada: needsTerms true", async () => {
    installDatabase({ userId: null });

    expect(await getConsentStatus(COACH)).toMatchObject({ needsTerms: true });
  });

  it("un admin sin persona: nunca tiene tutelas pendientes", async () => {
    installDatabase();

    expect(await getConsentStatus(ADMIN)).toEqual({ needsTerms: true, pendingGuardianships: [] });
  });

  it("un tutor sin tutelas: lista vacía", async () => {
    installDatabase({ guardianships: [] });

    expect(await getConsentStatus(COACH)).toMatchObject({ pendingGuardianships: [] });
  });

  it("una tutela sin consentimiento de imagen activo: pendiente", async () => {
    installDatabase({
      guardianships: [{ child_person_id: uuid(2), child: { first_name: "Hijo", last_name: "Ficticio" } }],
      activeImageConsents: [],
    });

    expect(await getConsentStatus(COACH)).toMatchObject({
      pendingGuardianships: [{ personId: uuid(2), firstName: "Hijo", lastName: "Ficticio" }],
    });
  });

  it("una tutela con un consentimiento de imagen ya activo: no está pendiente", async () => {
    installDatabase({
      guardianships: [{ child_person_id: uuid(2), child: { first_name: "Hijo", last_name: "Ficticio" } }],
      activeImageConsents: [{ person_id: uuid(2) }],
    });

    expect(await getConsentStatus(COACH)).toMatchObject({ pendingGuardianships: [] });
  });
});
