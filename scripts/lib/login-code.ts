// Códigos de acceso para los e2e: se piden a la API de administración de Auth en vez de
// leerse de un buzón. Solo para `e2e/`: usa la clave de servicio.
//
// Por qué se comprueba antes que el usuario existe: `auth.admin.generateLink` CREA la cuenta
// si el email no existe. Contra un Supabase sin sembrar (la preview), un test que pida un
// código para `alex@arcangel.test` dejaría ahí un usuario nuevo, sin club ni invitación.
// Los e2e nunca crean cuentas: eso es del seed, a mano y a propósito.

import { createAdminClient } from "./admin-client";

type AuthUser = { id?: string; email?: string; recovery_sent_at?: string };

/** Lo único que se usa de `createAdminClient()`. Con otro cliente, los tests no necesitan Auth. */
export type AuthAdminClient = {
  auth: {
    admin: {
      listUsers(params: {
        page: number;
        perPage: number;
      }): Promise<{ data: { users: AuthUser[] }; error: { message: string } | null }>;
      generateLink(params: { type: "magiclink"; email: string }): Promise<{
        data: { properties?: { email_otp?: string } | null } | null;
        error: { message: string } | null;
      }>;
    };
  };
};

const USERS_PER_PAGE = 200;
const MAX_USER_PAGES = 500;

/**
 * El usuario de Auth con ese email, o `undefined` si no existe. Recorre las páginas hasta
 * encontrarlo. Como el seed, solo se detiene en la primera página vacía: si el servidor
 * limita `perPage` por debajo de lo pedido, una página corta no es la última.
 */
export async function findAuthUser(
  email: string,
  client: AuthAdminClient = createAdminClient(),
): Promise<AuthUser | undefined> {
  const wanted = email.toLowerCase();
  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw new Error(`No se pudo leer la lista de usuarios: ${error.message}`);
    if (data.users.length === 0) return undefined;
    const found = data.users.find((user) => user.email?.toLowerCase() === wanted);
    if (found) return found;
  }
  throw new Error(`La lista de usuarios no terminó tras ${MAX_USER_PAGES} páginas.`);
}

/**
 * Un código de 6 dígitos para entrar como `email`, que tiene que ser un usuario ya creado.
 * Si no existe, falla sin llamar a `generateLink` (que lo crearía).
 */
export async function generateLoginCode(
  email: string,
  client: AuthAdminClient = createAdminClient(),
): Promise<string> {
  if (!(await findAuthUser(email, client))) {
    throw new Error(
      `No existe ningún usuario ${email} en el Supabase de los e2e (NEXT_PUBLIC_SUPABASE_URL). ` +
        "Los e2e nunca crean cuentas: siembra primero ese entorno con `pnpm seed` (en un " +
        "remoto, a mano, con ALLOW_REMOTE_SEED=true y solo si es un entorno de demo).",
    );
  }

  const { data, error } = await client.auth.admin.generateLink({ type: "magiclink", email });
  const code = data?.properties?.email_otp;
  if (error || !code) {
    throw new Error(
      `No se pudo generar el código de ${email}: ${error?.message ?? "la respuesta no trae email_otp"}. ` +
        "¿Está arrancado Supabase y se ha ejecutado `pnpm seed`?",
    );
  }
  return code;
}
