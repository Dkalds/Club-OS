/** Lo que una pantalla necesita saber del directo de una sesión para ofrecer entrar en él. */
export type LiveProgress = {
  /** Ya se pulsó «Iniciar» (`practice_plans.live_started_at`). */
  started: boolean;
  /** El índice (desde 0) del ejercicio en curso, o `null` si no se sabe. */
  position: number | null;
};

export type LiveEntry = {
  label: "Iniciar entrenamiento" | "Continuar entrenamiento";
  /** «Ejercicio 3 de 5»: por dónde va una sesión en curso. `null` si no ha empezado. */
  caption: string | null;
};

/**
 * Cómo se ofrece entrar al directo de una sesión programada: «Iniciar» si nunca se ha
 * empezado y «Continuar», con el ejercicio por el que va, si ya tiene progreso. Lo dicen igual
 * Inicio y la ficha de la sesión, en cualquier dispositivo, porque sale de lo que guarda el
 * servidor y no del móvil.
 *
 * La posición se acota a los ejercicios que la sesión tiene ahora (pueden haberse quitado
 * después de empezar), igual que al abrir el directo (`reconcile`).
 */
export function liveEntry(live: LiveProgress, itemCount: number): LiveEntry {
  if (!live.started) return { label: "Iniciar entrenamiento", caption: null };

  const last = Math.max(itemCount - 1, 0);
  const index = Math.min(Math.max(live.position ?? 0, 0), last);
  return {
    label: "Continuar entrenamiento",
    caption: itemCount > 0 ? `Ejercicio ${index + 1} de ${itemCount}` : null,
  };
}
