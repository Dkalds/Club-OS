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

export function assertSeedTarget(
  url: string,
  env: Record<string, string | undefined>,
): void {
  const host = hostnameOf(url);
  if (host !== null && LOCAL_HOSTS.has(host)) return;
  if (env.ALLOW_REMOTE_SEED === "true") return;

  const target = host ?? "una URL que no se puede interpretar";
  throw new Error(
    `Seed bloqueado: NEXT_PUBLIC_SUPABASE_URL apunta a ${target}, que no es un Supabase local. ` +
      "Si es un entorno de demo, ejecuta con ALLOW_REMOTE_SEED=true.",
  );
}
