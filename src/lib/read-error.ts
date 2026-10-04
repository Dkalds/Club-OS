import { logError } from "@/lib/log";

/**
 * Un error de lectura de Supabase no se traga ni se convierte en datos vacíos: se registra
 * (sin datos personales, ver `logError`) y se lanza para que lo recoja el error de la página.
 * No se adjunta como `cause`: su mensaje puede llevar el contenido de una fila.
 *
 * Siempre lanza: no devuelve un resultado, a diferencia de `fail` de `@/lib/action-result`,
 * que es el de las acciones. Lo usan las lecturas de Inicio, de metodología, de ejercicios y de
 * sesiones (`tag` es `modulo.lectura`, como la etiqueta de log de las acciones).
 */
export function throwReadError(tag: string, error: unknown): never {
  logError(tag, error);
  throw new Error(`${tag}: no se pudo leer de la base de datos`);
}
