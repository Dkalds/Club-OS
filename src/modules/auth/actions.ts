"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { logError } from "@/lib/log";
import { createAnonClient, createClient } from "@/lib/supabase/server";
import { DEMO_ROLES, demoCredentials } from "./demo-login";

export type LoginState = {
  step: "email" | "code";
  email?: string;
  error?: string;
  info?: string;
};

export type DemoLoginState = { error?: string };

const CODE_SENT = "Si tu email tiene acceso, te hemos enviado un código de 6 dígitos.";
const INVALID_EMAIL = "Escribe un email válido.";
const INVALID_CODE = "El código no es válido o ha caducado. Pide uno nuevo.";
const DEMO_FAILED = "No se ha podido entrar. Inténtalo de nuevo.";

// 254 es la longitud máxima de una dirección (RFC 5321).
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
// Sin la bandera `u`, `\d` solo acepta los dígitos ASCII 0-9.
const codeSchema = z.string().trim().regex(/^\d{6}$/);
const demoRoleSchema = z.enum(DEMO_ROLES);

/**
 * Paso 1: pide un código de un solo uso para un email ya invitado.
 *
 * Acceso solo por invitación: nunca crea usuarios. Quien pide el código no puede saber
 * si ese email tiene acceso, porque la respuesta no depende de Auth en nada:
 * - el texto es el mismo para cualquier email bien escrito;
 * - no se escribe ninguna cookie (el cliente sin sesión no abre flujo PKCE);
 * - la petición a Auth se hace con `after()`, cuando la respuesta ya ha salido. Auth
 *   tarda más con un email invitado (envía un correo) que con uno desconocido o con uno
 *   que repite demasiado pronto; esperar aquí convertiría esa diferencia en una pista.
 */
export async function requestLoginCode(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { step: "email", error: INVALID_EMAIL };

  try {
    after(() => sendLoginCode(email.data));
  } catch (error) {
    logError("auth.request-code", error);
  }

  return { step: "code", email: email.data, info: CODE_SENT };
}

/** Se ejecuta con la respuesta ya enviada. Nunca lanza: lo que falle va al log. */
async function sendLoginCode(email: string): Promise<void> {
  try {
    const { error } = await createAnonClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) logError("auth.request-code", error);
  } catch (error) {
    logError("auth.request-code", error);
  }
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
    if (error) logError("auth.verify-code", error);
    verified = !error;
  } catch (error) {
    logError("auth.verify-code", error);
    verified = false;
  }
  if (!verified) return rejected;

  // Fuera del try/catch: `redirect()` funciona lanzando una excepción.
  redirect("/select-club");
}

/**
 * Acceso de demo (TEMPORAL, ver `demo-login.ts`): entra como el usuario de ejemplo de un rol,
 * sin código.
 *
 * Del formulario solo se lee el rol. Con qué cuenta se entra lo deciden las variables del
 * servidor: sin ellas, o con un rol que no tiene demo, no se llama a Auth. Nunca crea
 * usuarios: `signInWithPassword` solo abre sesión con una cuenta que ya existe.
 */
export async function demoLogin(
  _prev: DemoLoginState,
  formData: FormData,
): Promise<DemoLoginState> {
  const role = demoRoleSchema.safeParse(formData.get("role"));
  const credentials = role.success ? demoCredentials(role.data) : null;
  if (!credentials) return { error: DEMO_FAILED };

  let entered = false;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) logError("auth.demo-login", error);
    entered = !error;
  } catch (error) {
    logError("auth.demo-login", error);
  }
  if (!entered) return { error: DEMO_FAILED };

  // Fuera del try/catch: `redirect()` funciona lanzando una excepción.
  redirect("/select-club");
}
