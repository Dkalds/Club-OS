import { cache } from "react";
import type { Database } from "@/lib/database.types";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import {
  parseTerminology,
  PLATFORM_BRAND_COLORS,
  sanitizeBrandColors,
  type Branding,
} from "./branding";
import { IDENTITY_LABEL } from "./navigation";

export type ClubContext = {
  org: { id: string; slug: string; name: string; timezone: string };
  branding: Branding;
  membership: { role: "admin" | "coach" | "player" | "guardian"; personId: string | null };
};

/** La misma forma que exige el CHECK de `organizations.slug`. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type BrandingRow = Pick<
  Database["public"]["Tables"]["organization_branding"]["Row"],
  | "display_name"
  | "wordmark_sub"
  | "short_name"
  | "way_name"
  | "tagline"
  | "color_accent"
  | "color_accent_pressed"
  | "color_on_accent"
  | "color_accent_soft"
  | "terminology"
>;

/**
 * Una relación embebida de PostgREST llega como objeto si la reconoce como «a uno» y como
 * lista si no. Aquí siempre hay como mucho una fila: se lee igual en los dos casos.
 */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toBranding(orgName: string, row: BrandingRow | null): Branding {
  // Un club que aún no ha configurado su marca se ve con su nombre y la de plataforma.
  if (!row) {
    return {
      displayName: orgName,
      wordmarkSub: null,
      shortName: orgName.replace(/\s+/g, "").slice(0, 3).toUpperCase(),
      wayName: IDENTITY_LABEL,
      tagline: null,
      colors: { ...PLATFORM_BRAND_COLORS },
      terminology: {},
    };
  }

  return {
    // La cabecera nunca se queda sin nombre.
    displayName: row.display_name.trim() || orgName,
    wordmarkSub: row.wordmark_sub,
    shortName: row.short_name,
    wayName: row.way_name,
    tagline: row.tagline,
    colors: sanitizeBrandColors({
      accent: row.color_accent,
      accentPressed: row.color_accent_pressed,
      onAccent: row.color_on_accent,
      accentSoft: row.color_accent_soft,
    }),
    terminology: parseTerminology(row.terminology),
  };
}

const TAG = "tenancy.club-context";

/**
 * Una avería (Supabase caído, sin red, una consulta que falla) no es «ese club no existe»:
 * se registra sin datos personales (ver `logError`) y se lanza, para que la recoja una
 * página de error con reintento y no el 404. El error original no viaja como `cause`: su
 * mensaje puede llevar un email o el contenido de una fila.
 */
function fail(error: unknown): never {
  logError(TAG, error);
  throw new Error(`${TAG}: no se pudo comprobar el acceso al club`);
}

/** Una llamada a Supabase. Si ni siquiera responde (lanza), es una avería. */
async function reach<T>(call: () => PromiseLike<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    fail(error);
  }
}

/**
 * Estados con los que Auth contesta «esta sesión no vale»: falta, el token es inválido, se
 * cerró o la cuenta ya no existe. Cualquier otro error (sin red, 5xx, límite de peticiones,
 * uno sin estado) significa que no se ha podido comprobar: avería.
 */
const SESSION_REJECTED = new Set([400, 401, 403, 404]);

function isSessionRejection(error: unknown): boolean {
  const status: unknown = (error as { status?: unknown }).status;
  return typeof status === "number" && SESSION_REJECTED.has(status);
}

async function loadClubContext(slug: string): Promise<ClubContext | null> {
  // El slug llega de la URL. Lo que no tenga la forma de un slug no puede ser un club:
  // ni se consulta.
  if (!SLUG.test(slug)) return null;

  // Fuera de `reach`: `cookies()` avisa a Next lanzando, y ese aviso tiene que subir tal cual.
  const supabase = await createClient();

  // Comprobación verificada (firma o servidor de Auth), no la cookie tal cual.
  const { data: auth, error: authError } = await reach(() => supabase.auth.getClaims());
  if (authError) {
    if (!isSessionRejection(authError)) fail(authError);
    // Auth ha contestado, y esa sesión no vale: no hay usuario, igual que sin sesión.
    logError(TAG, authError);
    return null;
  }
  const userId = auth?.claims.sub;
  if (!userId) return null;

  // Una sola consulta, la misma para un club ajeno y para uno que no existe: los dos
  // devuelven cero filas. RLS ya esconde la organización a quien no es miembro, pero
  // deja a quien administra un club leer todas sus membresías, y a cualquiera leer la
  // suya aunque esté revocada: por eso se filtra por usuario y por estado.
  // `!inner` + el filtro sobre `organizations.slug` dejan solo la membresía de ese club.
  const { data, error } = await reach(() =>
    supabase
      .from("memberships")
      .select(
        `role, person_id,
        organizations!inner(
          id, slug, name, timezone,
          organization_branding(
            display_name, wordmark_sub, short_name, way_name, tagline,
            color_accent, color_accent_pressed, color_on_accent, color_accent_soft,
            terminology
          )
        )`,
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .eq("organizations.slug", slug)
      .maybeSingle(),
  );
  // La consulta ha fallado: no se sabe si el club es de esta persona. Eso no depende del
  // club pedido, así que el propio, uno ajeno y uno que no existe fallan igual.
  if (error) fail(error);

  const org = one(data?.organizations);
  if (!data || !org) return null;

  return {
    org: { id: org.id, slug: org.slug, name: org.name, timezone: org.timezone },
    branding: toBranding(org.name, one(org.organization_branding)),
    membership: { role: data.role, personId: data.person_id },
  };
}

/**
 * El club de una URL `/c/{slug}` visto por quien tiene la sesión: organización, marca y
 * su membresía.
 *
 * Devuelve `null` solo cuando Supabase ha contestado y la respuesta es «no»: el slug no
 * tiene forma de slug, no hay una sesión válida, o el club no existe o la persona no es
 * miembro activo (cero filas, sin distinguir un caso del otro). Quien llama responde con
 * el mismo 404.
 *
 * Si Supabase falla (Auth o la base de datos caídos, sin red, una consulta con error),
 * LANZA: quien llama no lo recoge, y Next pinta la página de error más cercana
 * (`error.tsx`). Una avería no es un 404, y es la misma para cualquier club.
 *
 * Con `cache()`, el layout y las páginas de una misma petición comparten una sola
 * consulta (y, si falla, un solo error).
 */
export const getClubContext = cache(loadClubContext);

/** Lo que se muestra de quien entra cuando no se sabe cómo se llama. */
const ANONYMOUS_NAME = "Tu cuenta";

const VIEWER_TAG = "tenancy.viewer-name";

/**
 * El nombre de quien tiene la sesión para el menú de cuenta: nombre y apellidos de la
 * persona de su membresía, o «Tu cuenta» si no hay persona o no tiene nombre.
 *
 * Lee con la sesión de la persona (RLS) y filtra por club y por id. Solo sirve para
 * mostrar: ni un error de lectura (se registra sin datos personales, ver `logError`) ni una
 * excepción rompen la página; cae en «Tu cuenta».
 */
export async function getViewerName(ctx: ClubContext): Promise<string> {
  const { personId } = ctx.membership;
  if (!personId) return ANONYMOUS_NAME;

  // Fuera del `try`: `cookies()` avisa a Next lanzando, y ese aviso tiene que subir tal cual.
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("people")
      .select("first_name, last_name")
      .eq("organization_id", ctx.org.id)
      .eq("id", personId)
      .maybeSingle();
    if (error) {
      logError(VIEWER_TAG, error);
      return ANONYMOUS_NAME;
    }

    const name = [data?.first_name, data?.last_name]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ");
    return name || ANONYMOUS_NAME;
  } catch (error) {
    logError(VIEWER_TAG, error);
    return ANONYMOUS_NAME;
  }
}
