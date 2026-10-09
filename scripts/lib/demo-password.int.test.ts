// Integración contra Supabase local: `supabase start`, `.env.local` con las claves y
// `pnpm test:int`. Comprueba con el Auth de verdad aquello de lo que depende el acceso de demo:
// que un usuario ya creado, con la contraseña que le pone `setDemoPassword`, entra con la clave
// publicable (como lo hace la app) aunque el registro esté cerrado, y que nada de esto crea
// cuentas.
//
// Crea y borra sus propios usuarios (emails únicos), así que no depende del seed. Con un
// Supabase que no es local se salta entera: no escribe nunca en un remoto. Los usuarios van en
// un dominio que no acaba en `.test`, por lo mismo que en `login-code.int.test.ts`.

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { isLocalSupabaseUrl } from "../seed/guard";
import { createAdminClient, readSupabaseEnv } from "./admin-client";
import { setDemoPassword } from "./demo-password";
import { findAuthUser } from "./login-code";

const { url } = readSupabaseEnv();

/** `.invalid` está reservado (RFC 2606): no existe y no recibe correo. No acaba en `.test`. */
const THROWAWAY_DOMAIN = "demo-password.invalid";

describe.skipIf(!isLocalSupabaseUrl(url))("setDemoPassword contra Auth local", () => {
  const admin = createAdminClient();
  const emails: string[] = [];

  afterAll(async () => {
    for (const email of emails) {
      const user = await findAuthUser(email);
      if (user?.id) await admin.auth.admin.deleteUser(user.id);
    }
  });

  /** Un cliente sin sesión con la clave publicable: lo que tiene la app antes del login. */
  function anonClient() {
    return createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async function createUser(): Promise<string> {
    const email = `existe-${randomUUID()}@${THROWAWAY_DOMAIN}`;
    emails.push(email);
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    expect(error).toBeNull();
    return email;
  }

  it("el usuario no entra con contraseña hasta que se le pone, y después sí", async () => {
    const email = await createUser();
    const password = `demo-${randomUUID()}`;

    const before = await anonClient().auth.signInWithPassword({ email, password });
    expect(before.data.session).toBeNull();
    expect(before.error).not.toBeNull();

    await setDemoPassword(email, password);

    const after = await anonClient().auth.signInWithPassword({ email, password });
    expect(after.error).toBeNull();
    expect(after.data.session).not.toBeNull();
    expect(after.data.user?.email).toBe(email);
  });

  it("con otra contraseña no entra", async () => {
    const email = await createUser();
    await setDemoPassword(email, `demo-${randomUUID()}`);

    const { data, error } = await anonClient().auth.signInWithPassword({
      email,
      password: `otra-${randomUUID()}`,
    });

    expect(data.session).toBeNull();
    expect(error).not.toBeNull();
  });

  it("con una cuenta que no existe, falla y no la crea", async () => {
    const email = `no-existe-${randomUUID()}@${THROWAWAY_DOMAIN}`;
    emails.push(email);
    const password = `demo-${randomUUID()}`;

    await expect(setDemoPassword(email, password)).rejects.toThrow(/No existe ningún usuario/);

    // Entrar con contraseña tampoco da de alta a nadie.
    const { data } = await anonClient().auth.signInWithPassword({ email, password });
    expect(data.session).toBeNull();
    await expect(findAuthUser(email)).resolves.toBeUndefined();
  });
});
