import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { logError } from "@/lib/log";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import { createClient } from "@/lib/supabase/server";

// Cookies de sesión de @supabase/ssr: `sb-<proyecto>-auth-token`, troceadas en `.0`, `.1`…
const AUTH_COOKIE = /^sb-.+-auth-token/;

/** Con el token caducado y Auth caído, auth-js reintenta durante medio minuto. */
const SIGN_OUT_TIMEOUT_MS = 5_000;

class SignOutTimeout extends Error {
  override name = "SignOutTimeout";
}

/** `true` si Supabase ha cerrado la sesión (y con ella ha borrado sus cookies). */
async function signOutFromSupabase(): Promise<boolean> {
  try {
    const supabase = await createClient();
    // `local`: salir en la tablet del club no cierra la sesión del móvil.
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) logError("auth.sign-out", error);
    return !error;
  } catch (error) {
    logError("auth.sign-out", error);
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
    timer = setTimeout(() => {
      logError("auth.sign-out", new SignOutTimeout());
      resolve(false);
    }, SIGN_OUT_TIMEOUT_MS);
  });
  const signedOut = await Promise.race([signOutFromSupabase(), timedOut]);
  clearTimeout(timer);

  if (!signedOut) {
    // Si Supabase no responde, la cookie de sesión se quedaría en el navegador. «Salir»
    // tiene que salir siempre: se caduca a mano, con los atributos con que se escribió.
    const cookieStore = await cookies();
    for (const { name } of cookieStore.getAll()) {
      if (AUTH_COOKIE.test(name)) {
        cookieStore.set(name, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
      }
    }
  }

  // 303: el navegador sigue el redirect con GET.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
