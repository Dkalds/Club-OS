/**
 * Los coaching points de un ejercicio, en el orden en que los escribió quien lo creó. Los
 * que son clave llevan la marca «Clave» antes del texto: son los que el Live Mode enseña al
 * entrenador (design/README.md, «Live Mode»).
 *
 * La marca es una palabra, no solo color: `brand-accent` sobre `brand-accent-soft` es una
 * pareja con contraste (design/tokens.json). Es una lista normal, con viñetas; sin puntos no
 * pinta nada, ni una lista vacía, y el título de la sección («Coaching Points» es un término del
 * club) lo pone la pantalla. Un texto muy largo se parte en vez de ensanchar la pantalla.
 */
export function CoachingPointsList({
  points,
}: {
  points: Array<{ text: string; isKey: boolean }>;
}) {
  if (points.length === 0) return null;

  return (
    <ul className="flex list-disc flex-col gap-(--space-2) pl-(--space-5) marker:text-ink-3">
      {points.map((point, index) => (
        // El orden es el significado y la lista no se reordena en pantalla: el índice es una clave estable.
        <li key={index} className="text-body wrap-break-word text-ink">
          {point.isKey ? (
            <span className="mr-(--space-2) inline-block rounded-xs bg-brand-accent-soft px-(--space-2) align-middle text-label text-brand-accent uppercase">
              Clave
            </span>
          ) : null}
          {point.text}
        </li>
      ))}
    </ul>
  );
}
