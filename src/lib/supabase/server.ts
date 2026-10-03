import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * Usa la clave pública y la sesión del usuario, que viaja en cookies: todo lo que lee
 * pasa por RLS. Crea uno por petición; no lo guardes en una variable de módulo.
 */
export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Un Server Component no puede escribir cookies. No se pierde nada: el proxy
            // (src/proxy.ts) ya refresca la sesión en cada petición.
          }
        },
      },
    },
  );
}

/**
 * Cliente sin sesión y sin cookies, para lo único que la app hace antes de saber quién
 * es alguien: pedir el código de acceso.
 *
 * No vale `createClient()` para eso: con cookies, Auth abre un flujo PKCE y guarda su
 * verificador en una cookie, que borra si la petición falla. Las cookies de la respuesta
 * serían distintas para un email invitado y para uno que no lo está.
 */
export function createAnonClient(): SupabaseClient<Database> {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: "implicit",
      },
    },
  );
}
