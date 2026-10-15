function fmt(totalSeconds: number): string {
  const abs = Math.abs(totalSeconds);
  const m = Math.floor(abs / 60)
    .toString()
    .padStart(2, "0");
  const s = (abs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * El cronómetro del directo (design/components/Timer): cifras en el estilo `timer`, tabulares
 * para que no bailen al cambiar. Pausado, en `ink-3`. Pasado de tiempo, cuenta hacia arriba con
 * un «+» delante.
 */
export function Timer({
  remainingMs,
  paused,
  overtime,
}: {
  remainingMs: number;
  paused: boolean;
  overtime: boolean;
}) {
  const totalSeconds = Math.floor(Math.abs(remainingMs) / 1000);
  const display = overtime && remainingMs < 0 ? `+${fmt(totalSeconds)}` : fmt(totalSeconds);

  return (
    <p
      role="timer"
      aria-live="off"
      className={`my-(--space-2) font-display text-timer tracking-[-0.01em] tabular-nums ${paused ? "text-ink-3" : "text-ink"}`}
    >
      {display}
    </p>
  );
}
