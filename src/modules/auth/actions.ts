"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAnonClient, createClient } from "@/lib/supabase/server";

export type LoginState = {
  step: "email" | "code";
  email?: string;
  error?: string;
  info?: string;
};

const CODE_SENT = "Si tu email tiene acceso, te hemos enviado un código de 6 dígitos.";
const INVALID_EMAIL = "Escribe un email válido.";
const INVALID_CODE = "El código no es válido o ha caducado. Pide uno nuevo.";

// 254 es la longitud máxima de una dirección (RFC 5321).
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
// Sin la bandera `u`, `\d` solo acepta los dígitos ASCII 0-9.
const codeSchema = z.string().trim().regex(/^\d{6}$/);

/**
 * Paso 1: pide un código de un solo uso para un email ya invitado.
 *
 * Acceso solo por invitación: nunca crea usuarios. La respuesta para un email bien
 * escrito es siempre la misma, exista o no la cuenta, haya límite de frecuencia o falle
 * Supabase. Quien pide el código no puede saber si ese email tiene acceso: ni por el
 * texto ni por las cookies (por eso el cliente sin sesión, que no escribe ninguna).
 */
export async function requestLoginCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { step: "email", error: INVALID_EMAIL };

  try {
    const supabase = createAnonClient();
    // El error se ignora a propósito: distinguirlo revelaría si la cuenta existe.
    await supabase.auth.signInWithOtp({
      email: email.data,
      options: { shouldCreateUser: false },
    });
  } catch {
    // Misma respuesta que si hubiera ido bien.
  }

  return { step: "code", email: email.data, info: CODE_SENT };
}

/**
 * Paso 2: canjea el código por una sesión y lleva al selector de club.
 *
 * El email llega en un campo oculto del formulario: es una entrada no fiable y se valida
 * otra vez. Un código mal formado ni siquiera se envía a Supabase.
 */
export async function verifyLoginCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { step: "email", error: INVALID_EMAIL };

  const rejected: LoginState = { step: "code", email: email.data, error: INVALID_CODE };

  const code = codeSchema.safeParse(formData.get("code"));
  if (!code.success) return rejected;

  let verified = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.data,
      token: code.data,
      type: "email",
    });
    verified = !error;
  } catch {
    verified = false;
  }
  if (!verified) return rejected;

  // Fuera del try/catch: `redirect()` funciona lanzando una excepción.
  redirect("/select-club");
}
