// El importador escribe contenido con la clave de servicio: solo puede apuntar a un Supabase
// local, salvo que se pida expresamente lo contrario. Es la barrera del seed con su propia
// variable: permitir sembrar no permite importar, ni al revés.

import { isLocalSupabaseUrl } from "../seed/guard";

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function assertImportTarget(url: string, env: Record<string, string | undefined>): void {
  if (isLocalSupabaseUrl(url)) return;
  if (env.ALLOW_REMOTE_IMPORT === "true") return;

  const target = hostnameOf(url) ?? "una URL que no se puede interpretar";
  throw new Error(
    `Importación bloqueada: NEXT_PUBLIC_SUPABASE_URL apunta a ${target}, que no es un Supabase local. ` +
      "Si es el destino que quieres, ejecuta con ALLOW_REMOTE_IMPORT=true.",
  );
}
