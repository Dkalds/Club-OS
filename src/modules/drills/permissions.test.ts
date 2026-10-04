import { describe, expect, it } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";
import { drillPermissions } from "./permissions";
import type { DrillStatus } from "./types";

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
});
