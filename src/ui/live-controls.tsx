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
  const ctlClass =
    "cos-live__ctl flex h-(--target-live) w-(--target-live) flex-none items-center justify-center rounded-(--radius-lg) border border-line-strong bg-surface-2 text-ink";
  const icoLg =
    "cos-ico cos-ico--lg size-7 fill-none stroke-current [stroke-width:1.75] [stroke-linecap:round] [stroke-linejoin:round]";

  return (
    <div className="cos-live__controls flex items-center gap-(--space-3)">
      <button
        className={ctlClass}
        aria-label="Ejercicio anterior"
        onClick={onPrevious}
        disabled={isFirst}
      >
        <svg className={icoLg} viewBox="0 0 24 24" aria-hidden="true">
          <path d="m18 5-9 7 9 7z" />
          <path d="M6 5v14" />
        </svg>
      </button>

      <button
        className="cos-btn cos-btn--primary cos-btn--live flex flex-1 items-center justify-center gap-(--space-2) rounded-(--radius-lg) bg-brand-accent font-display text-body-l font-bold uppercase tracking-wide text-brand-on-accent h-(--target-live)"
        onClick={onTogglePause}
      >
        {paused ? (
          <>
            <svg className="cos-ico size-5 fill-none stroke-current [stroke-width:1.75] [stroke-linecap:round] [stroke-linejoin:round]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 3l14 9-14 9z" />
            </svg>
            Reanudar
          </>
        ) : (
          <>
            <svg className="cos-ico size-5 fill-none stroke-current [stroke-width:1.75] [stroke-linecap:round] [stroke-linejoin:round]" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 5v14M15 5v14" />
            </svg>
            Pausa
          </>
        )}
      </button>

      <button
        className={ctlClass}
        aria-label="Siguiente ejercicio"
        onClick={onNext}
      >
        {isLast ? (
          <span className="text-body-s">Terminar entrenamiento</span>
        ) : (
          <svg className={icoLg} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 5 9 7-9 7z" />
            <path d="M18 5v14" />
          </svg>
        )}
      </button>
    </div>
  );
}
