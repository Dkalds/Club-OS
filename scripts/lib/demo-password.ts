// Contraseña de los usuarios de demo (TEMPORAL, ver `src/modules/auth/demo-login.ts`): lo que
// necesita el botón «Probar como…» del login para entrar sin código. Solo para `scripts/`:
// usa la clave de servicio.
//
// Nunca crea cuentas: pone la contraseña a un usuario que ya existe (el seed) o falla.

import {
  DEMO_EMAIL_VAR,
  DEMO_ROLES,
  demoCredentials,
  type DemoRole,
} from "../../src/modules/auth/demo-login";
import { createAdminClient } from "./admin-client";
import { findAuthUser, type AuthAdminClient } from "./login-code";

/** Lo que se usa de `createAdminClient()`: buscar al usuario y cambiarle la contraseña. */
export type DemoPasswordClient = AuthAdminClient & {
  auth: {
    admin: {
      updateUserById(
        id: string,
        attributes: { password: string },
      ): Promise<{ error: { message: string } | null }>;
    };
  };
};

/** La contraseña no la escribe nadie a mano: va de un gestor a Vercel. Que sea larga. */
export const MIN_DEMO_PASSWORD_LENGTH = 16;

const TOO_SHORT = `DEMO_LOGIN_PASSWORD tiene que tener al menos ${MIN_DEMO_PASSWORD_LENGTH} caracteres.`;

/**
 * Pone `password` a `email`, que tiene que ser un usuario ya creado. Los mensajes nombran al
 * usuario, nunca llevan la contraseña.
 */
export async function setDemoPassword(
  email: string,
  password: string,
  client: DemoPasswordClient = createAdminClient(),
): Promise<void> {
  if (password.length < MIN_DEMO_PASSWORD_LENGTH) throw new Error(TOO_SHORT);

  const id = await existingUserId(email, client);
  const { error } = await client.auth.admin.updateUserById(id, { password });
  if (error) throw new Error(`No se pudo poner la contraseña de ${email}: ${error.message}`);
}

async function existingUserId(email: string, client: DemoPasswordClient): Promise<string> {
  const user = await findAuthUser(email, client);
  if (user?.id) return user.id;
  throw new Error(
    `No existe ningún usuario ${email} en este Supabase (NEXT_PUBLIC_SUPABASE_URL). ` +
      "Este script no crea cuentas: siembra primero el entorno con `pnpm seed` (en un " +
      "remoto, a mano, con ALLOW_REMOTE_SEED=true y solo si es un entorno de demo).",
  );
}

export type DemoPasswordPlan = {
  password: string;
  users: Array<{ role: DemoRole; email: string }>;
};

/**
 * Qué usuarios reciben la contraseña, leído de las mismas tres variables que usa la app.
 * Lanza si falta algo o si un email no vale: saltarse en silencio un email mal escrito
 * dejaría su botón sin usuario.
 */
export function planDemoPasswords(env: Record<string, string | undefined>): DemoPasswordPlan {
  const password = env.DEMO_LOGIN_PASSWORD;
  if (!password?.trim()) {
    throw new Error("Falta DEMO_LOGIN_PASSWORD en el entorno. Pídela sin eco, como la clave de servicio.");
  }
  if (password.length < MIN_DEMO_PASSWORD_LENGTH) throw new Error(TOO_SHORT);

  const users: DemoPasswordPlan["users"] = [];
  for (const role of DEMO_ROLES) {
    const variable = DEMO_EMAIL_VAR[role];
    if (!env[variable]?.trim()) continue;

    const credentials = demoCredentials(role, env);
    if (!credentials) {
      throw new Error(
        `${variable} no es un email .test. La demo solo entra con usuarios de ejemplo del ` +
          "seed, nunca con la cuenta de una persona.",
      );
    }
    users.push({ role, email: credentials.email });
  }

  if (users.length === 0) {
    throw new Error(
      `Falta el email de al menos un usuario de demo: ${DEMO_ROLES.map((role) => DEMO_EMAIL_VAR[role]).join(" o ")}.`,
    );
  }
  return { password, users };
}

/**
 * Lo que hace `pnpm demo:password`: pone la contraseña de demo a los usuarios de las
 * variables y devuelve a quiénes. Comprueba antes que existen todos, para no dejar a uno con
 * la contraseña nueva y al otro sin ella.
 */
export async function applyDemoPasswords(
  env: Record<string, string | undefined>,
  client: DemoPasswordClient = createAdminClient(),
): Promise<DemoPasswordPlan["users"]> {
  const plan = planDemoPasswords(env);
  for (const { email } of plan.users) await existingUserId(email, client);
  for (const { email } of plan.users) await setDemoPassword(email, plan.password, client);
  return plan.users;
}
