// El calendario del club tal como lo define su dirección en Gestión: las pistas y los horarios
// semanales de cada equipo. Los eventos que salen de ellos son sesiones como cualquier otra
// (`@/modules/practice`), y el registro de cambios vive con la Agenda (`@/modules/schedule`).

/**
 * Una pista del club. `usedBy`: los equipos con algún horario en ella, de la temporada que sea,
 * por nombre y sin repetir. Con alguno no se borra: antes se le quita o se le cambia ese horario.
 */
export type Venue = {
  id: string;
  name: string;
  usedBy: string[];
};

/**
 * Un horario semanal de un equipo. `weekday` es el día ISO (1 lunes, 7 domingo) y `startTime`,
 * la hora del reloj del club como `HH:mm`.
 */
export type TeamSchedule = {
  id: string;
  teamId: string;
  weekday: number;
  startTime: string;
  durationMinutes: number;
  venueId: string | null;
  venueName: string | null;
};

/** Un equipo de la temporada actual con sus horarios, para verlos todos juntos. */
export type TeamSchedules = {
  teamId: string;
  teamName: string;
  categoryName: string;
  schedules: TeamSchedule[];
};
