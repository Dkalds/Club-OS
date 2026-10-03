// El seed escribe datos de ejemplo con la clave de servicio: solo puede apuntar a un
// Supabase local, salvo que se pida expresamente lo contrario (entorno de demo).

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** `true` solo si la URL apunta a un Supabase local (127.0.0.1, localhost o [::1]). */
export function isLocalSupabaseUrl(url: string): boolean {
  const host = hostnameOf(url);
  return host !== null && LOCAL_HOSTS.has(host);
}

export function assertSeedTarget(
  url: string,
  env: Record<string, string | undefined>,
): void {
  const host = hostnameOf(url);
  if (isLocalSupabaseUrl(url)) return;
  if (env.ALLOW_REMOTE_SEED === "true") return;

  const target = host ?? "una URL que no se puede interpretar";
  throw new Error(
    `Seed bloqueado: NEXT_PUBLIC_SUPABASE_URL apunta a ${target}, que no es un Supabase local. ` +
      "Si es un entorno de demo, ejecuta con ALLOW_REMOTE_SEED=true.",
  );
}
