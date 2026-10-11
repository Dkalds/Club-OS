import type { OrgRole, StaffRole } from "./types";

// Cómo se dice lo de la estructura del club. Funciones puras.

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  head_coach: "Entrenador principal",
  assistant: "Ayudante",
};

export const STAFF_ROLE_OPTIONS: ReadonlyArray<{ value: StaffRole; label: string }> = [
  { value: "head_coach", label: STAFF_ROLE_LABEL.head_coach },
  { value: "assistant", label: STAFF_ROLE_LABEL.assistant },
];

/** Con qué rol entra en la app quien tiene cuenta. */
export const ACCESS_LABEL: Record<OrgRole, string> = {
  admin: "Dirección",
  coach: "Cuerpo técnico",
  player: "Jugador",
  guardian: "Familia",
};

/** Un día de calendario (`YYYY-MM-DD`) como «1 sep 2026». Lo que no tiene esa forma, tal cual. */
export function dayLabel(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  if (!match || !month) return day;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

/** Las fechas de una temporada: «1 sep 2026 – 30 jun 2027». */
export function seasonDates(startsOn: string, endsOn: string): string {
  return `${dayLabel(startsOn)} – ${dayLabel(endsOn)}`;
}

/** La edad de una categoría (`U12`) como número; `null` si no tiene esa forma. */
export function ageOf(ageBand: string): number | null {
  const match = /^U(\d{1,2})$/.exec(ageBand);
  return match ? Number(match[1]) : null;
}

/** `U12` como «Sub 12». */
export function ageBandLabel(ageBand: string): string {
  const age = ageOf(ageBand);
  return age === null ? ageBand : `Sub ${age}`;
}

/** Una edad como la guarda la base: `U12`. */
export function toAgeBand(age: number): string {
  return `U${age}`;
}

/** «Apellidos, Nombre»: como se ordena una lista de personas. */
export function listName(person: { firstName: string; lastName: string }): string {
  return `${person.lastName}, ${person.firstName}`;
}

/** «Nombre Apellidos». */
export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

/** Sin tildes ni mayúsculas, y con los espacios en uno: para comparar lo que se busca. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Si una persona responde a lo que se busca: todas las palabras de la búsqueda están en su
 * nombre o en sus apellidos, en cualquier orden. Una búsqueda vacía las deja pasar a todas.
 */
export function matchesPerson(person: { firstName: string; lastName: string }, query: string): boolean {
  const name = normalize(`${person.firstName} ${person.lastName}`);
  return normalize(query)
    .split(" ")
    .every((word) => name.includes(word));
}

/** Orden de una lista de personas: apellidos, nombre y, a igualdad, id. */
export function byListName<P extends { id?: string; personId?: string; firstName: string; lastName: string }>(
  a: P,
  b: P,
): number {
  return (
    a.lastName.localeCompare(b.lastName, "es") ||
    a.firstName.localeCompare(b.firstName, "es") ||
    (a.id ?? a.personId ?? "").localeCompare(b.id ?? b.personId ?? "")
  );
}
