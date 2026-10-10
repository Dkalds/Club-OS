"use client";

import { CTAButton } from "./cta-button";
import { CheckIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./icons";

// Los dos controles laterales: cuadrados de `target-live`, al alcance del pulgar.
const SIDE =
  "flex size-(--target-live) flex-none cursor-pointer items-center justify-center rounded-lg border " +
  "border-line-strong bg-surface-2 text-ink disabled:cursor-default disabled:text-ink-3 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

/**
 * Los controles del directo (design/components/Timer): anterior, pausa o reanudar, y
 * siguiente. Miden `target-live` de alto y el central es el único `primary`.
 *
 * En el último ejercicio el de la derecha ya no pasa al siguiente: termina el entrenamiento, y
 * lo dice su nombre y su icono. Quien lo monta pregunta antes de terminar.
 */
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
    <div className="flex items-center gap-(--space-3)">
      <button type="button" className={SIDE} aria-label="Ejercicio anterior" onClick={onPrevious} disabled={isFirst}>
        <PreviousIcon size={28} />
      </button>

      <CTAButton
        variant="primary"
        size="live"
        className="flex-1"
        icon={paused ? <PlayIcon /> : <PauseIcon />}
        onClick={onTogglePause}
      >
        {paused ? "Reanudar" : "Pausa"}
      </CTAButton>

      <button
        type="button"
        className={SIDE}
        aria-label={isLast ? "Terminar entrenamiento" : "Siguiente ejercicio"}
        onClick={onNext}
      >
        {isLast ? <CheckIcon size={28} /> : <NextIcon size={28} />}
      </button>
    </div>
  );
}
