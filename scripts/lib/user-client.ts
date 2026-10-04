// Un cliente de Supabase con la sesión de un usuario del seed, para los tests de integración
// (y los de las fases siguientes). Es lo contrario de `createAdminClient`: este SÍ pasa por
// RLS, con la clave publicable, como lo hace la app. Para probar qué ve y qué escribe cada
// persona de cada club hay que actuar como ella, no con la clave de servicio.
//
// Cómo entra: pide un código de un solo uso a la API de administración (`generateLoginCode`,
// que sustituye al correo) y lo canjea con `verifyOtp`, igual que el login de la app.
//
// Nunca crea cuentas. La plataforma es de acceso por invitación y `auth.admin.generateLink`
// crearía el usuario si no existiera; `generateLoginCode` lo comprueba antes y falla con un
// error que manda a ejecutar `pnpm seed`. Un test que pida entrar como alguien que no está
// sembrado se rompe, no lo da de alta. Solo para `scripts/` y los tests de integración: usa
// la clave de servicio para pedir el código.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { readSupabaseEnv } from "./admin-client";
import { generateLoginCode } from "./login-code";

/**
 * Entra como `email`, que tiene que ser un usuario ya creado (el seed), y devuelve un cliente
 * con su sesión. Cada llamada es un cliente nuevo y sin estado compartido: dos usuarios en el
 * mismo test no se pisan, y la sesión no se guarda en ningún sitio (`persistSession: false`).
 *
 * Lanza si el usuario no existe, si falta alguna clave en el entorno o si el código no se
 * puede canjear. Los mensajes nombran al usuario, nunca llevan el código ni la sesión.
 */
export async function signInAs(email: string): Promise<SupabaseClient<Database>> {
  // También carga `.env.local`: `tsx` y Vitest no lo leen por su cuenta.
  const { url } = readSupabaseEnv();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en el entorno. " +
        "Copia .env.example a .env.local y rellénalo con los valores de `pnpm supabase status -o env`.",
    );
  }

  const code = await generateLoginCode(email);

  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.session) {
    throw new Error(`No se pudo entrar como ${email}: ${error?.message ?? "la respuesta no trae sesión"}`);
  }
  return client;
}
