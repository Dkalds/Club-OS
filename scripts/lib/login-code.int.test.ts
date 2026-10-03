// Integración contra Supabase local: `supabase start`, `.env.local` con las claves y
// `pnpm test:int`. Comprueba con el Auth de verdad lo que `login-code.test.ts` comprueba con
// uno falso: que pedir un código para un email sin cuenta no la crea.
//
// Crea y borra sus propios usuarios (emails únicos), así que no depende del seed. Con un
// Supabase que no es local se salta entera: no escribe nunca en un remoto.

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { isLocalSupabaseUrl } from "../seed/guard";
import { createAdminClient, readSupabaseEnv } from "./admin-client";
import { findAuthUser, generateLoginCode } from "./login-code";

const { url } = readSupabaseEnv();

describe.skipIf(!isLocalSupabaseUrl(url))("generateLoginCode contra Auth local", () => {
  const admin = createAdminClient();
  const emails: string[] = [];

  // También borra la cuenta del test que no debería existir: si la comprobación previa se
  // rompiera, `generateLink` la habría creado y no puede quedarse en la base de datos.
  afterAll(async () => {
    for (const email of emails) {
      const user = await findAuthUser(email);
      if (user?.id) await admin.auth.admin.deleteUser(user.id);
    }
  });

  it("con una cuenta que no existe, falla y no la crea", async () => {
    const email = `no-existe-${randomUUID()}@clubos.test`;
    emails.push(email);

    await expect(generateLoginCode(email)).rejects.toThrow(/No existe ningún usuario/);

    // Lo que haría `generateLink` sin la comprobación previa: dejar la cuenta creada.
    await expect(findAuthUser(email)).resolves.toBeUndefined();
  });

  it("con una cuenta que existe, devuelve un código de 6 dígitos", async () => {
    const email = `existe-${randomUUID()}@clubos.test`;
    emails.push(email);
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    expect(error).toBeNull();

    await expect(generateLoginCode(email)).resolves.toMatch(/^\d{6}$/);
  });
});
