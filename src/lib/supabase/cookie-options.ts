import type { CookieOptions } from "@supabase/ssr";

/**
 * Atributos de las cookies de sesión, iguales en los dos clientes que las escriben
 * (`server.ts` y `session.ts`) y en el borrado a mano de `/auth/sign-out`.
 *
 * - `httpOnly`: la app no tiene cliente de Supabase en el navegador, así que ningún
 *   JavaScript necesita leer la sesión; un XSS tampoco podrá.
 * - `sameSite: lax`: no viaja en peticiones que nacen en otro sitio (salvo navegar aquí).
 * - `secure` en producción: solo por HTTPS. Los navegadores tratan `http://localhost`
 *   como origen seguro, así que `pnpm start` en local y el e2e de CI siguen funcionando.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const satisfies CookieOptions;
