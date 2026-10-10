// Contrato de datos de la Agenda: los entrenos y los partidos del equipo activo, por semanas.

/** Qué pestaña se ve: lo que viene o lo que ya pasó. */
export type AgendaScope = "upcoming" | "past";
/** Qué tipo de evento se ve. */
export type AgendaKind = "all" | "practice" | "game";

export type AgendaFilters = { scope: AgendaScope; kind: AgendaKind };

/** Un evento del calendario tal como se lee, antes de darle forma de fila. */
export type AgendaEvent = {
  id: string;
  teamId: string;
  kind: "practice" | "game";
  status: "scheduled" | "done" | "cancelled";
  startsAt: string;
  endsAt: string;
  location: string | null;
  /** El plan de un entreno; `null` si no lo tiene (o no se ve). */
  plan: { title: string; itemMinutes: number[] } | null;
  /** Los datos de un partido; `null` si no los tiene. */
  game: {
    opponent: string;
    competition: string | null;
    homeAway: "home" | "away" | null;
    /** Desde el punto de vista del club: el propio primero. */
    score: { for: number; against: number } | null;
  } | null;
};

/** Una fila de la agenda: lo que se pinta, ya en la zona del club. */
export type AgendaItem = {
  eventId: string;
  kind: "practice" | "game";
  /** La pantalla del evento: la sesión o el partido. */
  href: string;
  /** Lo de la izquierda: el día de la semana (o el mes, en lo ya pasado) sobre el número. */
  chip: { label: string; day: string };
  title: string;
  subtitle: string;
  /** Lo de la derecha: la hora de lo que viene o cómo acabó. `null` si no hay nada que decir. */
  trail: { text: string; spoken?: string; tone: "plain" | "done" } | null;
};

/** Una semana de la agenda, de lunes a domingo en la zona del club. */
export type AgendaWeek = {
  /** El inicio de la semana en ISO: único y estable, para `key`. */
  key: string;
  /** «Esta semana», «Semana que viene», «Semana pasada» o «Semana del 19 oct». */
  label: string;
  items: AgendaItem[];
};

export type Agenda = {
  weeks: AgendaWeek[];
  /** Cuántos equipos se están viendo: sin ninguno no hay agenda que enseñar. */
  teamCount: number;
  /** Hay más eventos de los que se enseñan: la lista lo dice en vez de cortar en silencio. */
  truncated: boolean;
};
