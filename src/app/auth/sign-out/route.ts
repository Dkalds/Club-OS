import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Cookies de sesión de @supabase/ssr: `sb-<proyecto>-auth-token`, troceadas en `.0`, `.1`…
const AUTH_COOKIE = /^sb-.+-auth-token/;

/** Con el token caducado y Auth caído, auth-js reintenta durante medio minuto. */
const SIGN_OUT_TIMEOUT_MS = 5_000;

/** `true` si Supabase ha cerrado la sesión (y con ella ha borrado sus cookies). */
async function signOutFromSupabase(): Promise<boolean> {
  try {
    const supabase = await createClient();
    // `local`: salir en la tablet del club no cierra la sesión del móvil.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Cierra la sesión de este dispositivo y vuelve a /login. Solo POST: un enlace o una
 * imagen de otra web no pueden cerrar la sesión de nadie con un GET.
 */
export async function POST(request: NextRequest) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), SIGN_OUT_TIMEOUT_MS);
  });
  const signedOut = await Promise.race([signOutFromSupabase(), timedOut]);
  clearTimeout(timer);

  if (!signedOut) {
    // Si Supabase no responde, la cookie de sesión se quedaría en el navegador. «Salir»
    // tiene que salir siempre: se borra a mano.
    const cookieStore = await cookies();
    for (const { name } of cookieStore.getAll()) {
      if (AUTH_COOKIE.test(name)) cookieStore.delete(name);
    }
  }

  // 303: el navegador sigue el redirect con GET.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
