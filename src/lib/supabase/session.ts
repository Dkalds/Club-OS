import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { logError } from "@/lib/log";
import { contentSecurityPolicy, generateNonce, securityHeaders } from "@/lib/security-headers";
import { SESSION_COOKIE_OPTIONS } from "./cookie-options";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const LOGIN_PATH = "/login";
const SELECT_CLUB_PATH = "/select-club";

/**
 * Tope para la comprobación de sesión. Con el token caducado y Auth caído, auth-js
 * reintenta el refresco durante medio minuto; el proxy no puede tener la petición
 * esperando tanto. Una comprobación normal tarda décimas de segundo.
 */
const AUTH_CHECK_TIMEOUT_MS = 5_000;

/** Todo lo que cuelga de estos prefijos exige sesión. */
const PROTECTED_PREFIXES = ["/c", SELECT_CLUB_PATH];

function requiresSession(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

class AuthCheckTimeout extends Error {
  override name = "AuthCheckTimeout";
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AuthCheckTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function redirectTo(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

/**
 * Refresca la sesión de Supabase en cada petición y corta el paso a las rutas de club
 * cuando no hay un usuario válido. Lo llama `src/proxy.ts`.
 *
 * Es un primer filtro, no la garantía de acceso: los datos los protege RLS y cada
 * página vuelve a comprobar al usuario.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // Lo que Supabase quiera escribir (sesión refrescada o borrada) se guarda aquí y se
  // aplica a la respuesta que salga al final, sea un redirect o no.
  const cookiesToWrite = new Map<string, CookieToSet>();
  const headersToWrite: Record<string, string> = {};

  // Un nonce por petición (C12): en la cabecera de la petición, para que Next lo aplique a
  // los scripts que inyecta él mismo (los datos de hidratación), y en la de la respuesta,
  // para que el navegador la aplique de verdad.
  const nonce = generateNonce();

  let signedIn = false;
  try {
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookieOptions: SESSION_COOKIE_OPTIONS,
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet, headers) {
            for (const cookie of cookiesToSet) {
              // En la petición, para que los Server Components lean ya la sesión nueva.
              request.cookies.set(cookie.name, cookie.value);
              cookiesToWrite.set(cookie.name, cookie);
            }
            // Cabeceras anti-caché que acompañan a las cookies de sesión.
            Object.assign(headersToWrite, headers);
          },
        },
      },
    );

    // `getClaims()` verifica el token (firma o consulta a Auth) y lo refresca si ha
    // caducado. `getSession()` solo lee la cookie: no sirve para autorizar.
    const { data, error } = await withTimeout(supabase.auth.getClaims(), AUTH_CHECK_TIMEOUT_MS);
    if (error) logError("auth.session", error);
    const userId: unknown = data?.claims?.sub;
    signedIn = !error && typeof userId === "string" && userId.length > 0;
  } catch (error) {
    // Supabase inalcanzable, lento o mal configurado: sin sesión, nunca un 500 del proxy.
    // No se borra ninguna cookie: cuando Supabase vuelva, la sesión sigue ahí.
    logError("auth.session", error);
    signedIn = false;
  }

  // Clonada ahora, no antes: tiene que llevar las cookies que acaba de escribir Supabase
  // (si no, la petición que sigue vería la sesión vieja).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(
    "Content-Security-Policy",
    contentSecurityPolicy(process.env.NEXT_PUBLIC_SUPABASE_URL!, nonce),
  );

  const { pathname } = request.nextUrl;
  let response: NextResponse;
  if (!signedIn && requiresSession(pathname)) {
    response = redirectTo(request, LOGIN_PATH);
  } else if (signedIn && pathname === LOGIN_PATH && request.method === "GET") {
    // Solo navegaciones: un POST a /login es una Server Action del formulario.
    response = redirectTo(request, SELECT_CLUB_PATH);
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  for (const { name, value, options } of cookiesToWrite.values()) {
    response.cookies.set(name, value, options);
  }
  for (const [name, value] of Object.entries(headersToWrite)) {
    response.headers.set(name, value);
  }
  for (const [name, value] of Object.entries(securityHeaders(process.env.NEXT_PUBLIC_SUPABASE_URL!, nonce))) {
    response.headers.set(name, value);
  }
  return response;
}
