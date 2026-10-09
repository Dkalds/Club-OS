import { describe, expect, it } from "vitest";
import { demoCredentials, demoRoles } from "./demo-login";

// Emails neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const COACH = "coach@club-a.test";
const ADMIN = "admin@club-a.test";
const PASSWORD = "una-clave-larga-de-demo";

const FULL = {
  DEMO_LOGIN_COACH_EMAIL: COACH,
  DEMO_LOGIN_ADMIN_EMAIL: ADMIN,
  DEMO_LOGIN_PASSWORD: PASSWORD,
};

describe("demoRoles", () => {
  it("sin variables no hay ningún acceso de demo", () => {
    expect(demoRoles({})).toEqual([]);
  });

  it("con las tres variables, entrenador y dirección, en ese orden", () => {
    expect(demoRoles(FULL)).toEqual(["coach", "admin"]);
  });

  it("solo sale el rol que tiene su email", () => {
    expect(demoRoles({ DEMO_LOGIN_ADMIN_EMAIL: ADMIN, DEMO_LOGIN_PASSWORD: PASSWORD })).toEqual([
      "admin",
    ]);
  });

  it.each([
    ["no está", undefined],
    ["está vacía", ""],
    ["son solo espacios", "   "],
  ])("sin contraseña no hay ninguno: %s", (_name, password) => {
    expect(demoRoles({ ...FULL, DEMO_LOGIN_PASSWORD: password })).toEqual([]);
  });
});

describe("demoCredentials", () => {
  it("devuelve el email del rol y la contraseña común", () => {
    expect(demoCredentials("coach", FULL)).toEqual({ email: COACH, password: PASSWORD });
    expect(demoCredentials("admin", FULL)).toEqual({ email: ADMIN, password: PASSWORD });
  });

  it("recorta el email y lo pasa a minúsculas", () => {
    expect(demoCredentials("coach", { ...FULL, DEMO_LOGIN_COACH_EMAIL: "  Coach@Club-A.TEST " })).toEqual({
      email: COACH,
      password: PASSWORD,
    });
  });

  it("no toca la contraseña", () => {
    const password = "  con espacios y MAYÚSCULAS  ";
    expect(demoCredentials("coach", { ...FULL, DEMO_LOGIN_PASSWORD: password })?.password).toBe(
      password,
    );
  });

  // Un botón público nunca puede abrir la cuenta de una persona: `.test` es un dominio
  // reservado (RFC 2606) que solo usan los usuarios de ejemplo del seed.
  it.each([
    ["de un dominio real", "persona@example.com"],
    ["que solo contiene .test", "persona@club.test.example.com"],
    ["mal escrito", "no-es-email"],
    ["vacío", ""],
  ])("un email %s no vale: ese rol no tiene demo", (_name, email) => {
    const env = { ...FULL, DEMO_LOGIN_COACH_EMAIL: email };

    expect(demoCredentials("coach", env)).toBeNull();
    expect(demoRoles(env)).toEqual(["admin"]);
  });
});
