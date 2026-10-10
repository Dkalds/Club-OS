// Límite de intentos de login, propio en la app, no CAPTCHA ([D12], Fase 7): un contador en
// memoria por clave (email, hoy; email+IP cuando el proxy la exponga a la acción, backlog),
// con espera creciente tras un tope de intentos en la ventana. No es un CAPTCHA ni un límite
// por IP de verdad: basta para un MVP con poco tráfico, y se revisa cuando haya tráfico real
// (backlog, Fase 7: «Límites de Auth»).
//
// Vive en memoria del proceso: en un despliegue con varias instancias (o funciones sin
// estado entre peticiones) cada una cuenta por su cuenta, y un reinicio lo borra todo. Es la
// limitación conocida de un contador en memoria, documentada en vez de fingida; una tabla en
// Postgres sería más fiable pero el rol `anon` no ejecuta ninguna función ni escribe ninguna
// tabla (invariante de `posture.test.sql`), así que necesitaría su propia excepción deliberada
// a esa regla. Se revisa junto al resto de «Límites de Auth» del backlog.

type Entry = { count: number; windowStart: number; blockedUntil: number };

const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = 60_000;
const MAX_BACKOFF_STEPS = 6;

const attempts = new Map<string, Entry>();

/** Si la clave puede intentarlo ahora, o sigue en la espera de un bloqueo anterior. */
export function canAttempt(key: string, nowMs = Date.now()): boolean {
  const entry = attempts.get(key);
  return !entry || entry.blockedUntil <= nowMs;
}

/**
 * Cuenta un intento. Pasada la ventana desde el primero, el contador se reinicia. Al llegar
 * a `MAX_ATTEMPTS` dentro de ella, bloquea con una espera que crece con cada intento de más,
 * hasta `MAX_BACKOFF_STEPS`.
 */
export function recordAttempt(key: string, nowMs = Date.now()): void {
  const existing = attempts.get(key);
  const entry: Entry =
    existing && nowMs - existing.windowStart <= WINDOW_MS ? existing : { count: 0, windowStart: nowMs, blockedUntil: 0 };

  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    const steps = Math.min(entry.count - MAX_ATTEMPTS + 1, MAX_BACKOFF_STEPS);
    entry.blockedUntil = nowMs + BACKOFF_MS * steps;
  }
  attempts.set(key, entry);
}

/** Tras un acierto (un código verificado de verdad): la cuenta deja de estar bajo sospecha. */
export function clearAttempts(key: string): void {
  attempts.delete(key);
}
