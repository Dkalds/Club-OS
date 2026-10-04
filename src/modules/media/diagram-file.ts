// Qué es un diagrama válido, sin tocar nada del servidor. Lo importan el formulario (en el
// navegador, para avisar antes de enviar nada) y la acción que sube el fichero (en el
// servidor, que es quien decide de verdad): por eso este módulo no importa Supabase, ni
// `next/headers`, ni nada que solo exista en un lado. Todo lo que hay aquí son constantes y
// funciones puras.

/** El tamaño máximo de un diagrama: 2 MiB, el mismo límite del bucket `club-media`. */
export const MAX_DIAGRAM_BYTES = 2_097_152;

/** El único mensaje que ve quien sube un fichero que no vale, sea por tipo, por tamaño o por contenido. */
export const DIAGRAM_ERROR = "Sube una imagen PNG, JPEG o WebP de hasta 2 MB.";

/** Lo que `sniffImageType` reconoce; la extensión que lleva el objeto en Storage. */
export type DiagramType = "png" | "jpg" | "webp";

/** El tipo MIME de cada tipo detectado: los tres que acepta el bucket. */
export const DIAGRAM_MIME: Readonly<Record<DiagramType, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

const ALLOWED_MIME: ReadonlySet<string> = new Set(Object.values(DIAGRAM_MIME));

/**
 * ¿Vale un fichero por lo que declara el navegador? Mira el tipo y el tamaño, nada más. No
 * basta para fiarse de él: el tipo y el nombre los elige quien envía, y un SVG con `<script>`
 * puede llamarse `x.png` y declararse `image/png`. Por eso la acción, además, mira los bytes
 * (`sniffImageType`). Esta función es la comprobación rápida del formulario: ahorra enviar 20
 * MB para que el servidor los rechace.
 *
 * El tipo manda sobre el tamaño: un SVG de 20 MB es `'type'`. Un fichero vacío es `'size'`:
 * la ficha de `media_assets` exige entre 1 byte y 2 MiB.
 */
export function validateDiagramFile(file: { type: string; size: number }): "ok" | "type" | "size" {
  if (!ALLOWED_MIME.has(file.type)) return "type";
  if (file.size < 1 || file.size > MAX_DIAGRAM_BYTES) return "size";
  return "ok";
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** ¿Empiezan `bytes` desde `offset` por `signature`? Falso si no hay bytes suficientes. */
function hasSignature(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

/**
 * El tipo de imagen que dicen los primeros bytes del fichero, o `null` si no es PNG, JPEG ni
 * WebP. Es lo que decide qué es un fichero, no su nombre ni el tipo que declara:
 *
 *  - PNG: `89 50 4E 47 0D 0A 1A 0A`.
 *  - JPEG: `FF D8 FF`.
 *  - WebP: `RIFF`, cuatro bytes de tamaño y `WEBP`. Un `RIFF` que no es WebP (un WAV, un AVI)
 *    es `null`.
 *
 * Solo mira la cabecera: no comprueba que el resto sea una imagen entera. Lo que garantiza es
 * que no es un SVG, un HTML ni un ejecutable con la extensión cambiada, que es lo que se
 * serviría a un navegador.
 */
export function sniffImageType(bytes: Uint8Array): DiagramType | null {
  if (hasSignature(bytes, PNG_SIGNATURE)) return "png";
  if (hasSignature(bytes, JPEG_SIGNATURE)) return "jpg";
  if (hasSignature(bytes, RIFF) && hasSignature(bytes, WEBP, 8)) return "webp";
  return null;
}
