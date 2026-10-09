export type GoalStatus = "active" | "achieved" | "archived";
export type NoteVisibility = "private" | "staff";

/** Un objetivo de un jugador en un equipo, con lo que trabaja (regla 8). */
export type PlayerGoal = {
  id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  /** «Martes 6 oct», en la zona del club; solo si está logrado. */
  achievedOn: string | null;
  focus: { id: string; name: string } | null;
  standard: { id: string; number: number; title: string } | null;
};

/** Una nota del cuerpo técnico sobre un jugador, de las que puede leer quien la pide. */
export type CoachNote = {
  id: string;
  body: string;
  visibility: NoteVisibility;
  /** «Martes 6 oct», en la zona del club. */
  writtenOn: string;
  edited: boolean;
  /** Nombre del autor; null si no tiene ficha en el club. */
  authorName: string | null;
  /** Solo su autor la edita y la borra. */
  isMine: boolean;
};

/**
 * La ficha de un jugador en un equipo. Sin año de nacimiento: la categoría ya lo dice y es un
 * dato menos expuesto.
 */
export type PlayerProfile = {
  personId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  position: string | null;
  team: { id: string; name: string; categoryName: string };
  activeGoals: PlayerGoal[];
  pastGoals: PlayerGoal[];
  notes: CoachNote[];
};

/** Lo que se puede ligar a un objetivo: los focos del club y sus Standards publicados. */
export type GoalFormOptions = {
  focusAreas: Array<{ id: string; name: string }>;
  standards: Array<{ id: string; number: number; title: string }>;
};
