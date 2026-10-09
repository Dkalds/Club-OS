export type GameStatus = "scheduled" | "done" | "cancelled";
export type HomeAway = "home" | "away";
export type GameScope = "upcoming" | "played";

/** Un partido en una lista: lo que se pinta en su fila, ya en la zona del club. */
export type GameListItem = {
  eventId: string;
  teamId: string;
  teamName: string;
  opponent: string;
  competition: string | null;
  homeAway: HomeAway | null;
  status: GameStatus;
  /** Ya empezó: se puede apuntar el resultado (si no está cancelado). */
  started: boolean;
  /** «Sábado 10 oct · 10:30 · Local». */
  slotLabel: string;
  dateChip: { dow: string; day: string };
  location: string | null;
  /** Desde el punto de vista del club: el propio primero. */
  score: { for: number; against: number } | null;
};

/** El detalle de un partido, con lo que necesita el formulario para editarlo. */
export type GameDetail = GameListItem & {
  opponentNotes: string | null;
  /** Los valores de los campos del formulario, en el reloj del club. */
  form: { date: string; time: string; durationMinutes: number };
};
