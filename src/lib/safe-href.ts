const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * La URL tal cual, solo si su protocolo es `http:`, `https:` o `mailto:`; `null` en cualquier
 * otro caso: `javascript:`, `data:`, rutas relativas, anclas y URLs que no se pueden leer.
 *
 * Lo lee el analizador de URLs del estándar, que es el que usa el navegador: ignora los
 * espacios de delante y los tabuladores o saltos de línea de dentro, y no distingue
 * mayúsculas, así que `JAVASCRIPT:` y `java<tab>script:` salen como `javascript:`.
 *
 * Vive aparte de `MarkdownBody` (que lo re-exporta) para que quien solo pinta un enlace que
 * viene de la base de datos, como el vídeo de un ejercicio en el directo, no cargue con el
 * renderizador de Markdown.
 */
export function safeHref(url: string): string | null {
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol) ? url : null;
  } catch {
    // Sin protocolo (`/ruta`, `#ancla`) o ilegible: `new URL` lanza.
    return null;
  }
}
