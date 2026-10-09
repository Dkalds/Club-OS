import { z } from "zod";

/**
 * Acceso de demo: entrar como un usuario de ejemplo sin pedir código.
 *
 * TEMPORAL, hasta que el remoto tenga un SMTP. Es una excepción a «acceso solo por
 * invitación, con código»: quien abre la URL entra como ese usuario. Por eso está apagado
 * salvo que el servidor tenga las variables de abajo, y solo admite emails `.test`: un
 * dominio reservado (RFC 2606) que usan los usuarios de ejemplo del seed y nunca una persona.
 *
 *   DEMO_LOGIN_COACH_EMAIL   el usuario de demo con rol de entrenador
 *   DEMO_LOGIN_ADMIN_EMAIL   el usuario de demo de dirección
 *   DEMO_LOGIN_PASSWORD      la contraseña de los dos (la pone `pnpm demo:password`)
 *
 * Son de servidor (sin `NEXT_PUBLIC_`): la contraseña no llega nunca al navegador.
 */
export const DEMO_ROLES = ["coach", "admin"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

type Env = Record<string, string | undefined>;

/** La variable que lleva el email de cada rol. */
export const DEMO_EMAIL_VAR: Record<DemoRole, string> = {
  coach: "DEMO_LOGIN_COACH_EMAIL",
  admin: "DEMO_LOGIN_ADMIN_EMAIL",
};

const demoEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email())
  .refine((email) => email.endsWith(".test"));

/** El email y la contraseña con los que entra ese rol, o `null` si no tiene demo. */
export function demoCredentials(
  role: DemoRole,
  env: Env = process.env,
): { email: string; password: string } | null {
  const password = env.DEMO_LOGIN_PASSWORD;
  if (!password?.trim()) return null;

  const email = demoEmailSchema.safeParse(env[DEMO_EMAIL_VAR[role]]);
  return email.success ? { email: email.data, password } : null;
}

/** Los roles con demo en este entorno. Vacío: no hay acceso de demo. */
export function demoRoles(env: Env = process.env): DemoRole[] {
  return DEMO_ROLES.filter((role) => demoCredentials(role, env) !== null);
}
