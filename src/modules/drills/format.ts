import type { DrillSummary } from "./types";

/**
 * Un rango como se pinta: «6–12» con raya corta (U+2013), o un solo número cuando los
 * extremos coinciden («8»). Nunca guion: es la tipografía de toda la interfaz.
 */
function formatRange(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}

/**
 * La edad de un ejercicio como categoría: «U12+» si la máxima está abierta, «U10–U14» si hay
 * rango y «U12» si es una sola.
 */
export function formatAge(min: number, max: number | null): string {
  if (max === null) return `U${min}+`;
  if (max === min) return `U${min}`;

  return `U${min}–U${max}`;
}

/** Singular o plural según el número que acompaña: «1 jugador», «8 jugadores». */
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

/**
 * La línea de metadatos de una tarjeta: «U12+ · 6–12 jug. · 10–15 min». Compacta, con las
 * unidades abreviadas. Los separadores son espacio, punto medio (U+00B7) y espacio.
 */
export function drillMeta(d: DrillSummary): string {
  return [
    formatAge(d.minAge, d.maxAge),
    `${formatRange(d.minPlayers, d.maxPlayers)} jug.`,
    `${formatRange(d.minMinutes, d.maxMinutes)} min`,
  ].join(" · ");
}

/**
 * Los tres datos de la cabecera de la ficha, con las unidades enteras: «6–12 jugadores»,
 * «10–15 minutos». El plural solo es singular cuando el rango entero es 1 («1 jugador»); un
 * rango como «1–4» sigue siendo plural.
 */
export function drillHeader(d: DrillSummary): { age: string; players: string; minutes: string } {
  const players = pluralize(d.maxPlayers, "jugador", "jugadores");
  const minutes = pluralize(d.maxMinutes, "minuto", "minutos");

  return {
    age: formatAge(d.minAge, d.maxAge),
    players: `${formatRange(d.minPlayers, d.maxPlayers)} ${players}`,
    minutes: `${formatRange(d.minMinutes, d.maxMinutes)} ${minutes}`,
  };
}
