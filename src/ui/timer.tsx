function fmt(totalSeconds: number): string {
  const abs = Math.abs(totalSeconds);
  const m = Math.floor(abs / 60)
    .toString()
    .padStart(2, "0");
  const s = (abs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

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
      className={`cos-timer tabular-nums${paused ? " text-ink-3" : ""}`}
    >
      {display}
    </p>
  );
}
