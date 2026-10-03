// Cliente de Supabase con la clave de servicio, para `scripts/` y `e2e/`. Nunca desde `src/`:
// la app usa siempre la sesión del usuario.
//
// `tsx` y Vitest no leen `.env.local` por su cuenta (Next sí, pero aquí no corre Next).
// Se carga a mano si existe; lo que ya esté en el entorno (CI) manda sobre el fichero.

import { existsSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const ENV_FILE = path.resolve(import.meta.dirname, "../../.env.local");

export function loadEnvLocal(): void {
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

export function readSupabaseEnv(): { url: string; serviceRoleKey: string } {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error(
      `Falta ${missing.join(" y ")} en el entorno. ` +
        "Copia .env.example a .env.local y rellénalo con los valores de `pnpm supabase status -o env`.",
    );
  }
  return { url, serviceRoleKey };
}

export function createAdminClient(): SupabaseClient<Database> {
  const { url, serviceRoleKey } = readSupabaseEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
