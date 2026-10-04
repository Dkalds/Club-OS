import { afterEach, describe, expect, it, vi } from "vitest";
import { can } from "@/lib/permissions";
import type { ClubContext } from "@/modules/tenancy/queries";
import { clubContext } from "@/modules/tenancy/test-support";
import { drillPermissions } from "./permissions";
import type { DrillStatus } from "./types";

// `can` es el de verdad salvo donde un test lo cambia (ver «publicar y archivar siguen al guard»).
vi.mock("@/lib/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/permissions")>();
  return { ...actual, can: vi.fn(actual.can) };
});
const { can: realCan } = await vi.importActual<typeof import("@/lib/permissions")>("@/lib/permissions");

afterEach(() => {
  vi.mocked(can).mockImplementation(realCan);
});

type Result = ReturnType<typeof drillPermissions>;

const NOTHING: Result = { edit: false, publish: false, archive: false };

/**
 * Lo que debe poder hacer cada rol según el estado del ejercicio. Está escrito a mano, caso
 * a caso, y no calculado con la misma regla que el código: así el test no repite sus fallos.
 */
describe("drillPermissions", () => {
  describe("admin: edita siempre; publica lo que no está publicado y archiva lo que no está archivado", () => {
    it.each([
      ["draft", { edit: true, publish: true, archive: true }],
      ["published", { edit: true, publish: false, archive: true }],
      ["archived", { edit: true, publish: true, archive: false }],
    ] as const)("ejercicio %s", (status, expected) => {
      // Da igual quién lo escribió.
      expect(drillPermissions(clubContext("admin"), { status, createdByMe: true })).toEqual(expected);
      expect(drillPermissions(clubContext("admin"), { status, createdByMe: false })).toEqual(expected);
    });
  });

  describe("entrenador: solo edita su borrador", () => {
    it("su borrador: edita, pero no publica ni archiva", () => {
      expect(drillPermissions(clubContext("coach"), { status: "draft", createdByMe: true })).toEqual({
        edit: true,
        publish: false,
        archive: false,
      });
    });

    it("el borrador de otro: nada", () => {
      expect(drillPermissions(clubContext("coach"), { status: "draft", createdByMe: false })).toEqual(NOTHING);
    });

    it.each(["published", "archived"] as const)(
      "un ejercicio %s no lo toca, ni siquiera el suyo",
      (status) => {
        expect(drillPermissions(clubContext("coach"), { status, createdByMe: true })).toEqual(NOTHING);
        expect(drillPermissions(clubContext("coach"), { status, createdByMe: false })).toEqual(NOTHING);
      },
    );
  });

  describe.each(["player", "guardian"] as const)("%s: nada, en ningún estado", (role) => {
    const statuses: DrillStatus[] = ["draft", "published", "archived"];

    it.each(statuses)("ejercicio %s", (status) => {
      expect(drillPermissions(clubContext(role), { status, createdByMe: true })).toEqual(NOTHING);
      expect(drillPermissions(clubContext(role), { status, createdByMe: false })).toEqual(NOTHING);
    });
  });

  it("devuelve siempre las tres claves, con booleanos", () => {
    const result = drillPermissions(clubContext("coach"), { status: "published", createdByMe: false });

    expect(Object.keys(result).sort()).toEqual(["archive", "edit", "publish"]);
    expect(Object.values(result).every((value) => typeof value === "boolean")).toBe(true);
  });

  // Los botones y el guard de la acción (`can(ctx, "drill.publish")`) son la misma regla: si
  // la tabla de `ALLOWED_ROLES` cambia, el botón no se queda con la regla vieja.
  describe("publicar y archivar siguen al guard de las acciones", () => {
    /** `drill.publish` pasa a ser solo de `role` (de nadie con `null`); lo demás sigue igual. */
    function publishOnlyFor(role: ClubContext["membership"]["role"] | null) {
      vi.mocked(can).mockImplementation((ctx, action) =>
        action === "drill.publish" ? ctx.membership.role === role : realCan(ctx, action),
      );
    }

    it("si `drill.publish` pasa a ser del entrenador, el entrenador ve los botones de su estado", () => {
      publishOnlyFor("coach");

      const draft = drillPermissions(clubContext("coach"), { status: "draft", createdByMe: false });
      const published = drillPermissions(clubContext("coach"), { status: "published", createdByMe: false });
      const archived = drillPermissions(clubContext("coach"), { status: "archived", createdByMe: false });

      expect(draft).toEqual({ edit: false, publish: true, archive: true });
      expect(published).toEqual({ edit: false, publish: false, archive: true });
      expect(archived).toEqual({ edit: false, publish: true, archive: false });
    });

    it("si `drill.publish` deja de ser del admin, el admin edita pero no publica ni archiva", () => {
      publishOnlyFor(null);

      for (const status of ["draft", "published", "archived"] as const) {
        expect(drillPermissions(clubContext("admin"), { status, createdByMe: true })).toEqual({
          edit: true,
          publish: false,
          archive: false,
        });
      }
    });

    it("pregunta por `drill.publish`, no por el rol", () => {
      vi.mocked(can).mockClear();

      drillPermissions(clubContext("admin"), { status: "draft", createdByMe: true });

      expect(vi.mocked(can)).toHaveBeenCalledWith(expect.anything(), "drill.publish");
    });
  });
});
