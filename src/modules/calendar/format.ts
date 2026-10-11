import type { TeamSchedule } from "./types";

// Cómo se dice un horario semanal. Funciones puras: aquí no hay fechas ni zonas, solo un día de
// la semana y una hora de reloj.

/** Los días de la semana, por su número ISO (1 lunes, 7 domingo). */
export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export const WEEKDAY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [1, 2, 3, 4, 5, 6, 7].map(
  (day) => ({ value: String(day), label: WEEKDAY_LABEL[day] ?? "" }),
);

/** Una hora de la base (`18:00:00`) como la escribe y la lee un campo de hora: `18:00`. */
export function timeLabel(time: string): string {
  return time.slice(0, 5);
}

/** La hora a la que acaba algo que empieza a `start` (`HH:mm`) y dura `minutes`, en el reloj: `19:15`. */
export function endTime(start: string, minutes: number): string {
  const [hours, mins] = start.split(":").map(Number);
  const total = (((hours ?? 0) * 60 + (mins ?? 0) + minutes) % 1440 + 1440) % 1440;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** «18:00–19:15», con raya corta. */
export function timeRange(start: string, minutes: number): string {
  return `${start}–${endTime(start, minutes)}`;
}

/** Un horario en una línea: «Martes · 18:00–19:15 · Pabellón 2». Sin pista, sin su parte. */
export function scheduleLabel(
  schedule: Pick<TeamSchedule, "weekday" | "startTime" | "durationMinutes" | "venueName">,
): string {
  return [
    WEEKDAY_LABEL[schedule.weekday] ?? "",
    timeRange(schedule.startTime, schedule.durationMinutes),
    schedule.venueName,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Orden de los horarios de un equipo: por día, por hora y, a igualdad, por id. */
export function bySlot(a: TeamSchedule, b: TeamSchedule): number {
  return a.weekday - b.weekday || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id);
}

/** «1 entrenamiento», «32 entrenamientos». */
export function practiceCount(count: number): string {
  return `${count} ${count === 1 ? "entrenamiento" : "entrenamientos"}`;
}
