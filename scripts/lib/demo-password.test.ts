import { describe, expect, it } from "vitest";
import {
  MIN_DEMO_PASSWORD_LENGTH,
  applyDemoPasswords,
  planDemoPasswords,
  setDemoPassword,
  type DemoPasswordClient,
} from "./demo-password";

const COACH = "alex@arcangel.test";
const ADMIN = "raul@arcangel.test";
const PASSWORD = "una-clave-larga-de-demo";

type FakeUser = { id: string; email: string };

/** Un Auth de pega: la lista de usuarios y lo que se le ha pedido cambiar. */
function fakeAuth(users: FakeUser[], updateError: { message: string } | null = null) {
  const updates: Array<{ id: string; attributes: { password: string } }> = [];
  const client: DemoPasswordClient = {
    auth: {
      admin: {
        async listUsers({ page }) {
          return { data: { users: page === 1 ? users : [] }, error: null };
        },
        async generateLink() {
          throw new Error("poner una contraseña no pide ningún enlace");
        },
        async updateUserById(id, attributes) {
          updates.push({ id, attributes });
          return { error: updateError };
        },
      },
    },
  };
  return { client, updates };
}

describe("setDemoPassword", () => {
  it("pone la contraseña al usuario que ya existe, por su id", async () => {
    const { client, updates } = fakeAuth([
      { id: "id-raul", email: ADMIN },
      { id: "id-alex", email: COACH },
    ]);

    await setDemoPassword(COACH, PASSWORD, client);

    expect(updates).toEqual([{ id: "id-alex", attributes: { password: PASSWORD } }]);
  });

  it("si el usuario no existe, falla y no escribe nada: no crea cuentas", async () => {
    const { client, updates } = fakeAuth([{ id: "id-raul", email: ADMIN }]);

    await expect(setDemoPassword(COACH, PASSWORD, client)).rejects.toThrow(
      /No existe ningún usuario alex@arcangel\.test/,
    );
    expect(updates).toEqual([]);
  });

  it("una contraseña corta no llega a Auth", async () => {
    const { client, updates } = fakeAuth([{ id: "id-alex", email: COACH }]);
    const short = "x".repeat(MIN_DEMO_PASSWORD_LENGTH - 1);

    await expect(setDemoPassword(COACH, short, client)).rejects.toThrow(/al menos 16 caracteres/);
    expect(updates).toEqual([]);
  });

  it("si Auth rechaza el cambio, falla diciendo de quién", async () => {
    const { client } = fakeAuth([{ id: "id-alex", email: COACH }], { message: "weak password" });

    await expect(setDemoPassword(COACH, PASSWORD, client)).rejects.toThrow(
      /No se pudo poner la contraseña de alex@arcangel\.test: weak password/,
    );
  });

  it("el error no lleva la contraseña", async () => {
    const { client } = fakeAuth([{ id: "id-alex", email: COACH }], { message: "weak password" });

    const error = await setDemoPassword(COACH, PASSWORD, client).catch((reason: Error) => reason);

    expect(String(error)).not.toContain(PASSWORD);
  });
});

describe("planDemoPasswords", () => {
  const FULL = {
    DEMO_LOGIN_COACH_EMAIL: COACH,
    DEMO_LOGIN_ADMIN_EMAIL: ADMIN,
    DEMO_LOGIN_PASSWORD: PASSWORD,
  };

  it("con las tres variables, los dos usuarios y la contraseña", () => {
    expect(planDemoPasswords(FULL)).toEqual({
      password: PASSWORD,
      users: [
        { role: "coach", email: COACH },
        { role: "admin", email: ADMIN },
      ],
    });
  });

  it("con un solo email, solo ese usuario", () => {
    expect(planDemoPasswords({ ...FULL, DEMO_LOGIN_COACH_EMAIL: undefined }).users).toEqual([
      { role: "admin", email: ADMIN },
    ]);
  });

  it("sin contraseña, pide DEMO_LOGIN_PASSWORD", () => {
    expect(() => planDemoPasswords({ ...FULL, DEMO_LOGIN_PASSWORD: undefined })).toThrow(
      /Falta DEMO_LOGIN_PASSWORD/,
    );
  });

  it("con una contraseña corta, lo dice sin escribirla", () => {
    const attempt = () => planDemoPasswords({ ...FULL, DEMO_LOGIN_PASSWORD: "corta-123" });

    expect(attempt).toThrow(/al menos 16 caracteres/);
    expect(attempt).not.toThrow(/corta-123/);
  });

  it("sin ningún email, pide las dos variables", () => {
    expect(() => planDemoPasswords({ DEMO_LOGIN_PASSWORD: PASSWORD })).toThrow(
      /DEMO_LOGIN_COACH_EMAIL.*DEMO_LOGIN_ADMIN_EMAIL/,
    );
  });

  // Callar y saltarse el email malo dejaría un botón sin usuario, o peor: al revés, la
  // cuenta de una persona con una contraseña compartida.
  it.each([
    ["de un dominio real", "persona@example.com"],
    ["mal escrito", "no-es-email"],
  ])("un email %s detiene el script, nombrando su variable", (_name, email) => {
    expect(() => planDemoPasswords({ ...FULL, DEMO_LOGIN_ADMIN_EMAIL: email })).toThrow(
      /DEMO_LOGIN_ADMIN_EMAIL.*\.test/,
    );
  });
});

describe("applyDemoPasswords", () => {
  const FULL = {
    DEMO_LOGIN_COACH_EMAIL: COACH,
    DEMO_LOGIN_ADMIN_EMAIL: ADMIN,
    DEMO_LOGIN_PASSWORD: PASSWORD,
  };

  it("pone la misma contraseña a los usuarios de demo y dice a quiénes", async () => {
    const { client, updates } = fakeAuth([
      { id: "id-raul", email: ADMIN },
      { id: "id-alex", email: COACH },
    ]);

    await expect(applyDemoPasswords(FULL, client)).resolves.toEqual([
      { role: "coach", email: COACH },
      { role: "admin", email: ADMIN },
    ]);
    expect(updates).toEqual([
      { id: "id-alex", attributes: { password: PASSWORD } },
      { id: "id-raul", attributes: { password: PASSWORD } },
    ]);
  });

  it("si falta uno de los usuarios, no cambia la contraseña de ninguno", async () => {
    const { client, updates } = fakeAuth([{ id: "id-alex", email: COACH }]);

    await expect(applyDemoPasswords(FULL, client)).rejects.toThrow(
      /No existe ningún usuario raul@arcangel\.test/,
    );
    expect(updates).toEqual([]);
  });

  it("con las variables mal, no llega a mirar Auth", async () => {
    const { client, updates } = fakeAuth([]);

    await expect(applyDemoPasswords({ DEMO_LOGIN_PASSWORD: PASSWORD }, client)).rejects.toThrow(
      /Falta el email/,
    );
    expect(updates).toEqual([]);
  });
});
