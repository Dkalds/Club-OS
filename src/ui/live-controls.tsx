"use client";

export function LiveControls({
  onPrevious,
  onTogglePause,
  onNext,
  paused,
  isFirst,
  isLast,
}: {
  onPrevious: () => void;
  onTogglePause: () => void;
  onNext: () => void;
  paused: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="cos-live__controls flex items-center gap-space-3" style={{ height: "72px" }}>
      <button
        className="cos-live__ctl"
        aria-label="Ejercicio anterior"
        onClick={onPrevious}
        disabled={isFirst}
      >
        <svg className="cos-ico cos-ico--lg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m18 5-9 7 9 7z" />
          <path d="M6 5v14" />
        </svg>
      </button>

      <button className="cos-btn cos-btn--primary cos-btn--live" onClick={onTogglePause}>
        {paused ? (
          <>
            <svg className="cos-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 3l14 9-14 9z" />
            </svg>
            Reanudar
          </>
        ) : (
          <>
            <svg className="cos-ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5v14M15 5v14" />
            </svg>
            Pausa
          </>
        )}
      </button>

      <button
        className="cos-live__ctl"
        aria-label="Siguiente ejercicio"
        onClick={onNext}
        disabled={isLast}
      >
        {isLast ? (
          <span className="text-body-s">Terminar entrenamiento</span>
        ) : (
          <svg className="cos-ico cos-ico--lg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 5 9 7-9 7z" />
            <path d="M18 5v14" />
          </svg>
        )}
      </button>
    </div>
  );
}
