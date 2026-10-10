import { useId } from "react";

// Las utilidades `court-*` viven en globals.css. `motion-safe:` delante de las que mueven algo
// al cargar: quien pide menos movimiento ve la jugada ya dibujada.
const DRAW = "motion-safe:court-draw";
const POP = "motion-safe:court-pop";

/**
 * La pizarra (design/components/CourtPlay): media pista con una jugada que se dibuja sola al
 * cargar. Es la portada del acceso, donde todavía no hay club ni fotografía que enseñar.
 *
 * El dibujo es el del producto (design/README.md, «Diagramas de pista»): líneas de pista en
 * `ink-3`, atacantes como círculos en `ink`, defensores como X y movimientos en `brand-accent`,
 * continuo el de un jugador y discontinuo el pase. Los trazos miden lo que en
 * design/components/bundle.css: 1.2 la pista, 1.6 atacantes y movimientos, 1.8 las X.
 *
 * La jugada es una puerta atrás en tres fases. Al cargar se traza la pista, aparecen los seis
 * jugadores y el alero de la izquierda corta hacia el aro por detrás de su defensor. Las otras
 * dos las marca quien la acompaña, con `data-court-stage` en algún elemento del mismo
 * `data-court-scope`: con `pass` sale el pase hacia el corte y con `score` se enciende el aro.
 * No hay JavaScript de por medio (lo resuelve `:has()` en globals.css), así que la pizarra no
 * sabe nada de formularios y sirve igual sin hidratar.
 *
 * Es decorativa (`aria-hidden`): no dice nada que no diga ya el título de la pantalla.
 *
 * Lo que se traza lleva `pathLength={1}`: el guion mide la línea entera, sea cual sea su
 * longitud. Por eso las líneas de pista son `<path>` y no `<rect>` o `<circle>`.
 */
export function CourtPlay() {
  const maskId = useId();

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 375 268"
      fill="none"
      className="block aspect-375/268 w-full bg-surface-1"
    >
      <g data-play="court" strokeWidth={1.2} className="stroke-ink-3">
        <path pathLength={1} d="M0 20h375" className={DRAW} />
        <path
          pathLength={1}
          d="M37 20v50a150.5 150.5 0 0 0 301 0V20"
          className={`${DRAW} motion-safe:court-delay-80`}
        />
        <path
          pathLength={1}
          d="M130 20v104h115V20"
          className={`${DRAW} motion-safe:court-delay-160`}
        />
        <path
          pathLength={1}
          d="M151.5 124a36 36 0 0 0 72 0a36 36 0 0 0-72 0"
          className={`${DRAW} motion-safe:court-delay-240`}
        />
        <path pathLength={1} d="M168 30h39" className={`${DRAW} motion-safe:court-delay-320`} />
        <circle
          data-play="rim"
          cx="187.5"
          cy="41"
          r="7"
          className={`court-on-score ${POP} motion-safe:court-delay-560`}
        />
      </g>

      <g data-play="attackers" strokeWidth={1.6} className="stroke-ink">
        <circle cx="205" cy="244" r="9" className={`${POP} motion-safe:court-delay-560`} />
        <circle cx="40" cy="150" r="9" className={`${POP} motion-safe:court-delay-640`} />
        <circle cx="335" cy="150" r="9" className={`${POP} motion-safe:court-delay-720`} />
      </g>

      <g
        data-play="defenders"
        strokeWidth={1.8}
        strokeLinecap="round"
        className="stroke-brand-accent"
      >
        <path d="M216 196l12 12m0-12l-12 12" className={`${POP} motion-safe:court-delay-680`} />
        <path d="M78 154l12 12m0-12l-12 12" className={`${POP} motion-safe:court-delay-760`} />
        <path d="M294 124l12 12m0-12l-12 12" className={`${POP} motion-safe:court-delay-840`} />
      </g>

      <g
        data-play="moves"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-brand-accent"
      >
        <path
          data-play="cut"
          pathLength={1}
          d="M47 141C72 104 116 76 158 62"
          className={`${DRAW} motion-safe:court-delay-960`}
        />
        <path d="M149 60.5l9 1.5-6 6.6" className={`${POP} motion-safe:court-delay-1680`} />
        <g data-play="pass" mask={`url(#${maskId})`}>
          <path d="M201.8 231.4L163.5 80" strokeDasharray="5 6" />
          <path d="M161.4 88.7l2.1-8.7 6 6.7" />
        </g>
      </g>

      {/* La máscara descubre el pase de principio a fin: una línea discontinua no se puede
          trazar con su propio guion. El blanco es la luminancia de la máscara (lo que deja
          ver), no un color de la interfaz. */}
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="375" height="268">
        <path
          pathLength={1}
          d="M201.8 231.4L163 78"
          stroke="white"
          strokeWidth={22}
          className="court-on-pass"
        />
      </mask>
    </svg>
  );
}
