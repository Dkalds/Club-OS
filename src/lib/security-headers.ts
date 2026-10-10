// Cabeceras de seguridad del proxy de sesión (C12, Fase 7, cierre de seguridad).
//
// La CSP sigue la guía oficial de Next.js (App Router): un nonce por petición, en vez de
// `unsafe-inline`, para los scripts que el propio framework inyecta (los datos de
// hidratación). `strict-dynamic` deja que esos scripts carguen los suyos sin tener que
// enumerarlos uno a uno.
//
// Solo este fichero construye el texto de la cabecera: `session.ts` decide cuándo
// aplicarla (a toda respuesta, con el nonce de esa petición) y nunca repite un directorio
// a mano.

/** Un nonce nuevo por petición: 16 bytes al azar, en base64. Nunca se reutiliza. */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** El origen `https://` y `wss://` de Supabase, a partir de su URL pública. */
function supabaseOrigins(supabaseUrl: string): { https: string; wss: string } {
  const https = supabaseUrl.replace(/\/$/, "");
  const wss = https.replace(/^https?:\/\//, "wss://");
  return { https, wss };
}

/**
 * El texto de `Content-Security-Policy` para esta petición. `img-src`, `worker-src`,
 * `manifest-src` y `connect-src` llevan exactamente lo que pide C12 (la PWA, Live Practice y
 * la caché offline los necesitan); el resto es la base razonable para una app de Next.js sin
 * scripts ni estilos de terceros.
 */
export function contentSecurityPolicy(supabaseUrl: string, nonce: string): string {
  const { https, wss } = supabaseOrigins(supabaseUrl);

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${https}`,
    `font-src 'self'`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `connect-src 'self' ${https} ${wss}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ];

  return directives.join("; ");
}

/**
 * Las cabeceras de seguridad de toda respuesta, CSP incluida. `Permissions-Policy` no
 * bloquea `screen-wake-lock` (Live Practice) ni `web-share` (compartir la ficha del club);
 * el resto de funciones que esta app no usa se deniegan.
 */
export function securityHeaders(supabaseUrl: string, nonce: string): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(supabaseUrl, nonce),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "screen-wake-lock=(self), web-share=(self), camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  };
}
