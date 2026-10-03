/**
 * Registro de errores del servidor sin datos personales.
 *
 * De un error solo salen su nombre, su estado HTTP, su código y el código de la causa de
 * red. Nunca el mensaje ni el objeto entero: los mensajes de Auth y de la base de datos
 * pueden llevar el email, el código de acceso, un token o el contenido de una fila.
 */
export function logError(tag: string, error: unknown): void {
  console.error(`[${tag}] ${describe(error)}`);
}

/** Un identificador corto y sin sorpresas: ni espacios, ni saltos de línea, ni `@`. */
const IDENTIFIER = /^[\w.-]{1,64}$/;

function identifier(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value);
  return IDENTIFIER.test(text) ? text : "?";
}

function describe(error: unknown): string {
  if (error === null) return "null";
  if (typeof error !== "object") return typeof error;

  const { name, status, code, cause } = error as Record<string, unknown>;
  const parts = [error instanceof Error ? (identifier(name) ?? "Error") : "error"];

  if (typeof status === "number") parts.push(`status=${status}`);

  const errorCode = identifier(code);
  if (errorCode) parts.push(`code=${errorCode}`);

  if (typeof cause === "object" && cause !== null) {
    const causeCode = identifier((cause as Record<string, unknown>).code);
    if (causeCode) parts.push(`cause=${causeCode}`);
  }

  return parts.join(" ");
}
