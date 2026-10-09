// Pone la contraseña de demo a los usuarios de ejemplo con los que entra el botón «Probar
// como…» del login (TEMPORAL, ver `src/modules/auth/demo-login.ts`).
//   pnpm demo:password
//
// Lee las mismas tres variables que la app (DEMO_LOGIN_COACH_EMAIL, DEMO_LOGIN_ADMIN_EMAIL y
// DEMO_LOGIN_PASSWORD) y actúa sobre el Supabase del entorno (NEXT_PUBLIC_SUPABASE_URL), con
// la clave de servicio. Nunca crea cuentas y solo admite emails `.test`. La contraseña se pide
// sin eco en la shell, como la clave de servicio: ver «Acceso de demo» en el README.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSupabaseEnv } from "./lib/admin-client";
import { applyDemoPasswords } from "./lib/demo-password";

async function main(): Promise<void> {
  // También carga `.env.local`; lo que ya esté en el entorno manda sobre el fichero.
  const { url } = readSupabaseEnv();

  const users = await applyDemoPasswords(process.env);

  console.log(`Contraseña de demo puesta en ${new URL(url).host}.`);
  for (const { role, email } of users) console.log(`  ${role}: ${email}`);
  console.log(
    "Para encender los botones, pon las mismas variables DEMO_LOGIN_* en el servidor de la app y despliega de nuevo.",
  );
}

// Solo como CLI (`pnpm demo:password`): importado no cambia nada.
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
