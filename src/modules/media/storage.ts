import { randomUUID } from "node:crypto";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

// Los ficheros del club (por ahora, el diagrama de un ejercicio) viven en un bucket privado de
// Storage. Aquí se decide cómo se llaman y cómo se leen; quién puede subir y leer lo deciden
// las políticas de `storage.objects` (`20261103000200_media_storage.sql`), que miran la ruta.
// Este módulo no es `'use server'`: las acciones que suben ficheros lo importan.

/** El bucket privado de los medios del club. Nada se sirve por URL pública. */
export const MEDIA_BUCKET = "club-media";

/** La carpeta de primer nivel de cada club: hoy solo los ejercicios. */
export type MediaFolder = "drills";

/**
 * La ruta de un objeto nuevo: `org/{club}/{carpeta}/{dueño}/{uuid}.{ext}`. Es la forma exacta
 * que exige la política de subida (tres uuid en minúsculas y una de las tres extensiones). El
 * nombre es siempre nuevo: cambiar un diagrama es subir otro y apuntar el ejercicio a él, y el
 * anterior nunca se pisa.
 */
export function mediaPath(
  orgId: string,
  kind: MediaFolder,
  ownerId: string,
  ext: "png" | "jpg" | "webp",
): string {
  return `org/${orgId}/${kind}/${ownerId}/${randomUUID()}.${ext}`;
}

/**
 * Una URL firmada para leer un objeto del bucket, con la sesión de quien mira (las políticas
 * deciden si puede) y de corta vida: 10 minutos por defecto. Nunca `getPublicUrl`.
 *
 * Devuelve `null` si no se puede firmar, sea por lo que sea: una ficha de `media_assets` puede
 * existir sin su objeto en Storage, y a la ficha de un ejercicio le basta con salir sin
 * diagrama. El fallo se registra sin datos personales (ver `logError`).
 */
export async function signedUrl(path: string, expiresIn = 600): Promise<string | null> {
  // Fuera del `try`: `cookies()` avisa a Next lanzando, y ese aviso tiene que subir tal cual.
  const supabase = await createClient();

  try {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, expiresIn);
    if (error) {
      logError("media.signed-url", error);
      return null;
    }
    return data.signedUrl || null;
  } catch (error) {
    logError("media.signed-url", error);
    return null;
  }
}
