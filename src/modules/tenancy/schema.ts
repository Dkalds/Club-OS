import { z } from "zod";

// Entrada de `updateClub` (`/admin/club`, Fase 7 Task 10). Un texto vacío, un hex mal escrito
// o una zona que no está en la lista se quedan aquí, nunca llegan a la base como un 23514.

const NAME_MISSING = "Escribe el nombre.";
const SHORT_NAME_INVALID = "Entre 2 y 4 letras.";
const WAY_NAME_MISSING = "Escribe el nombre de la metodología.";
const HEX_INVALID = "Un color en formato #rrggbb.";
const TERMS_MISSING = "Escribe el texto de las condiciones.";
const IMAGE_CONSENT_MISSING = "Escribe el texto del consentimiento de imagen.";

// Las zonas de un club de baloncesto de formación en España (spec, multi-tenancy): no hace
// falta la lista entera de IANA para el MVP.
export const TIMEZONE_OPTIONS = [
  { value: "Europe/Madrid", label: "Península y Baleares" },
  { value: "Atlantic/Canary", label: "Canarias" },
] as const;

const TIMEZONES = TIMEZONE_OPTIONS.map((option) => option.value);

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function required(missing: string, max: number) {
  return z.string({ error: missing }).trim().min(1, missing).max(max);
}

/** Texto opcional: recortado; vacío se guarda como null. */
function optional(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((text) => (text === "" || text === null ? null : text));
}

export const updateClubSchema = z.object({
  name: required(NAME_MISSING, 120),
  timezone: z.enum(TIMEZONES as [string, ...string[]], { error: "Elige una zona horaria." }),
  displayName: required(NAME_MISSING, 120),
  wordmarkSub: optional(40),
  shortName: z
    .string({ error: SHORT_NAME_INVALID })
    .trim()
    .toUpperCase()
    .refine((value) => value.length >= 2 && value.length <= 4, SHORT_NAME_INVALID),
  wayName: required(WAY_NAME_MISSING, 80),
  tagline: optional(140),
  accent: z
    .string({ error: HEX_INVALID })
    .trim()
    .toLowerCase()
    .refine((value) => HEX_COLOR.test(value), HEX_INVALID),
  wayTerm: optional(40),
  standardsTerm: optional(40),
  termsText: required(TERMS_MISSING, 4000),
  imageConsentText: required(IMAGE_CONSENT_MISSING, 4000),
});

export type UpdateClubInput = z.input<typeof updateClubSchema>;
