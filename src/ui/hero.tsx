/**
 * Cabecera de Inicio (design/components/Hero): un saludo o un nombre y, encima, un kicker
 * (equipo y temporada).
 *
 * Va a sangre dentro de `<main>` y su título es el `<h1>` de la pantalla. Sin imagen de
 * portada el fondo es `surface-1` con las líneas de pista: nunca un degradado. El `scrim` va
 * encima como con una fotografía, para que el texto se lea igual cuando la haya. Las líneas
 * son decorativas (`aria-hidden`).
 *
 * Medidas de design/components/bundle.css: altura mínima de 220px y trazo de 1.2.
 */
export function Hero({ kicker, title }: { kicker: string | null; title: string }) {
  return (
    <section className="relative flex min-h-55 flex-col justify-end overflow-hidden bg-surface-1 p-(--space-4)">
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 375 220"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        strokeWidth={1.2}
        className="absolute inset-0 size-full stroke-ink-3"
      >
        <rect x="-20" y="20" width="415" height="260" />
        <rect x="130" y="20" width="115" height="120" />
        <circle cx="187" cy="140" r="40" />
        <path d="M20 20v60a168 168 0 0 0 335 0V20" />
      </svg>
      <div className="absolute inset-0 bg-scrim" />
      <div className="relative flex flex-col gap-(--space-2)">
        {kicker ? <p className="text-label text-brand-accent uppercase">{kicker}</p> : null}
        <h1 className="font-display text-display-xl wrap-break-word">{title}</h1>
      </div>
    </section>
  );
}
