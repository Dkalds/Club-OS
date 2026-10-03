import { describe, expect, it } from "vitest";
import { assertAuthUserExists, findAuthUser, generateLoginCode } from "./login-code";

// Un cliente de Auth falso que solo registra llamadas. No sustituye a `login-code.int.test.ts`,
// que prueba lo mismo contra el Auth local de verdad: aquí se comprueba el orden (nunca se
// pide un código sin haber visto al usuario), la paginación y los errores.

type FakeUser = { email: string; recovery_sent_at?: string };

type FakeOptions = {
  users?: FakeUser[];
  /** El servidor devuelve como mucho este número de usuarios por página, pida lo que pida. */
  pageCap?: number;
  failList?: boolean;
  /** Lo que devuelve `generateLink` en `properties`. */
  properties?: { email_otp?: string } | null;
  failLink?: boolean;
};

function fakeClient(options: FakeOptions = {}) {
  const users = options.users ?? [];
  const links: { type: string; email: string }[] = [];
  const pages: number[] = [];

  const client = {
    auth: {
      admin: {
        listUsers({ page, perPage }: { page: number; perPage: number }) {
          pages.push(page);
          if (options.failList) {
            return Promise.resolve({ data: { users: [] }, error: { message: "sin acceso" } });
          }
          const size = Math.min(perPage, options.pageCap ?? perPage);
          return Promise.resolve({
            data: { users: users.slice((page - 1) * size, page * size) },
            error: null,
          });
        },
        generateLink(params: { type: "magiclink"; email: string }) {
          links.push(params);
          if (options.failLink) {
            return Promise.resolve({ data: null, error: { message: "fallo simulado" } });
          }
          const properties =
            options.properties === undefined ? { email_otp: "123456" } : options.properties;
          return Promise.resolve({ data: { properties }, error: null });
        },
      },
    },
  };
  return { client, links, pages };
}

describe("findAuthUser", () => {
  it("devuelve el usuario con su último envío de código", () => {
    const { client } = fakeClient({
      users: [
        { email: "otra@clubos.test" },
        { email: "alex@arcangel.test", recovery_sent_at: "2026-10-02T10:00:00Z" },
      ],
    });

    return expect(findAuthUser("alex@arcangel.test", client)).resolves.toEqual({
      email: "alex@arcangel.test",
      recovery_sent_at: "2026-10-02T10:00:00Z",
    });
  });

  it("no distingue mayúsculas: Auth guarda los emails en minúsculas", () => {
    const { client } = fakeClient({ users: [{ email: "alex@arcangel.test" }] });

    return expect(findAuthUser("Alex@Arcangel.TEST", client)).resolves.toMatchObject({
      email: "alex@arcangel.test",
    });
  });

  it("sigue por las páginas siguientes aunque el servidor recorte el tamaño de página", async () => {
    const users = Array.from({ length: 5 }, (_, i) => ({ email: `u${i}@clubos.test` }));
    const { client, pages } = fakeClient({ users, pageCap: 2 });

    await expect(findAuthUser("u4@clubos.test", client)).resolves.toEqual({ email: "u4@clubos.test" });
    expect(pages).toEqual([1, 2, 3]);
  });

  it("se para en cuanto lo encuentra", async () => {
    const users = Array.from({ length: 5 }, (_, i) => ({ email: `u${i}@clubos.test` }));
    const { client, pages } = fakeClient({ users, pageCap: 2 });

    await findAuthUser("u0@clubos.test", client);

    expect(pages).toEqual([1]);
  });

  it("sin usuario con ese email devuelve undefined", async () => {
    const { client } = fakeClient({ users: [{ email: "otra@clubos.test" }], pageCap: 1 });

    await expect(findAuthUser("nadie@clubos.test", client)).resolves.toBeUndefined();
  });

  it("si Auth falla, lo dice", () => {
    const { client } = fakeClient({ failList: true });

    return expect(findAuthUser("alex@arcangel.test", client)).rejects.toThrow(
      /No se pudo leer la lista de usuarios: sin acceso/,
    );
  });
});

describe("assertAuthUserExists", () => {
  it("con el usuario creado, no dice nada", async () => {
    const { client, links } = fakeClient({ users: [{ email: "alex@arcangel.test" }] });

    await expect(assertAuthUserExists("alex@arcangel.test", client)).resolves.toBeUndefined();
    // Solo mira: nunca pide un código.
    expect(links).toEqual([]);
  });

  it("sin el usuario, falla con el aviso de sembrar ese entorno", async () => {
    const { client, links } = fakeClient({ users: [{ email: "otra@clubos.test" }] });

    await expect(assertAuthUserExists("nadie@clubos.test", client)).rejects.toThrow(
      /No existe ningún usuario nadie@clubos\.test[\s\S]*pnpm seed/,
    );
    expect(links).toEqual([]);
  });

  it("si Auth falla al mirar, lo dice en vez de dar al usuario por existente", async () => {
    const { client } = fakeClient({ failList: true });

    await expect(assertAuthUserExists("alex@arcangel.test", client)).rejects.toThrow(
      /No se pudo leer la lista de usuarios/,
    );
  });
});

describe("generateLoginCode", () => {
  it("con el usuario creado, devuelve el código que genera Auth", async () => {
    const { client, links } = fakeClient({ users: [{ email: "alex@arcangel.test" }] });

    await expect(generateLoginCode("alex@arcangel.test", client)).resolves.toBe("123456");
    expect(links).toEqual([{ type: "magiclink", email: "alex@arcangel.test" }]);
  });

  it("sin el usuario, falla sin pedir el código: generateLink lo crearía", async () => {
    const { client, links } = fakeClient({ users: [{ email: "otra@clubos.test" }] });

    await expect(generateLoginCode("nadie@clubos.test", client)).rejects.toThrow(
      /No existe ningún usuario nadie@clubos\.test/,
    );
    expect(links).toEqual([]);
  });

  it("el error manda a sembrar ese entorno primero", async () => {
    const { client } = fakeClient();

    await expect(generateLoginCode("nadie@clubos.test", client)).rejects.toThrow(
      /nunca crean cuentas[\s\S]*pnpm seed/,
    );
  });

  it("si no puede comprobar que el usuario existe, no genera nada", async () => {
    const { client, links } = fakeClient({ failList: true });

    await expect(generateLoginCode("alex@arcangel.test", client)).rejects.toThrow(
      /No se pudo leer la lista de usuarios/,
    );
    expect(links).toEqual([]);
  });

  it("si generateLink falla, lo dice con el motivo", async () => {
    const { client } = fakeClient({ users: [{ email: "alex@arcangel.test" }], failLink: true });

    await expect(generateLoginCode("alex@arcangel.test", client)).rejects.toThrow(
      /No se pudo generar el código de alex@arcangel\.test: fallo simulado/,
    );
  });

  it("si la respuesta no trae email_otp, lo dice", async () => {
    for (const properties of [{}, null]) {
      const { client } = fakeClient({ users: [{ email: "alex@arcangel.test" }], properties });

      await expect(generateLoginCode("alex@arcangel.test", client)).rejects.toThrow(
        /la respuesta no trae email_otp/,
      );
    }
  });
});
