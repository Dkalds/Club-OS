import { BALL_REACH } from "@/modules/board/limits";
import type { Board, BoardFrame, BoardMoveKind, BoardPoint, BoardToken } from "@/modules/board/types";

// El dibujo de una pizarra (design/components/Board): la pista, las fichas y los movimientos.
// Sin `"use client"`: es puro, y lo usan `Board` (de cliente, con controles) y `BoardThumb` (la
// miniatura de una fila, de servidor).
//
// El dibujo es el del producto (design/README.md, «Diagramas de pista»): líneas de pista en
// `ink-3`, atacantes como círculos en `ink`, defensores como X y movimientos en `brand-accent`.
// Los trazos miden lo que en design/components/bundle.css (1.2 la pista, 1.6 atacantes y
// movimientos, 1.8 las X) y no engordan con la caja (`non-scaling-stroke`).
//
// Una pizarra guarda sus puntos en unidades de pista, de 0 a 100 en cada eje, con el aro de
// ataque en `y = 0`. Aquí se pasan a la caja del dibujo (`toBox`): la media pista, con el aro
// arriba, en 4:3; la pista completa, apaisada, con el aro de ataque a la izquierda.

type Court = Board["court"];

/** La caja de cada pista: su `viewBox` y la proporción con la que se pinta a tamaño completo. */
export const BOARD_VIEW: Record<Court, { viewBox: string; aspect: string }> = {
  half: { viewBox: "0 0 100 75", aspect: "aspect-4/3" },
  full: { viewBox: "0 0 100 56", aspect: "aspect-25/14" },
};

const STROKE = { vectorEffect: "non-scaling-stroke" } as const;

/** Un punto de la pista en la caja del dibujo. */
export function toBox(court: Court, point: BoardPoint): BoardPoint {
  if (court === "half") return { x: 5 + point.x * 0.9, y: 5 + point.y * 0.65 };
  // Apaisada: lo largo de la pista va de izquierda a derecha, y la banda derecha queda arriba.
  return { x: 3 + point.y * 0.94, y: 3 + (100 - point.x) * 0.5 };
}

/** Lo que miden un jugador y el balón, en unidades de la caja de media pista. */
const PLAYER_RADIUS = 3.6;
const BALL_RADIUS = 1.7;

/**
 * Dónde se pinta una ficha en un fotograma, en la caja del dibujo. Todas van donde dice el
 * fotograma, menos el balón que alguien tiene en las manos (está a `BALL_REACH` o menos de un
 * jugador): ese se pinta pegado a su jugador, abajo a la derecha, para no taparle la etiqueta.
 * En la pizarra el balón se guarda junto a quien lo lleva, y a escala caerían uno encima del otro.
 */
export function tokenBox(
  court: Court,
  token: BoardToken,
  frame: BoardFrame,
  tokens: readonly BoardToken[],
): BoardPoint {
  const at = frame[token.id] ?? token.at;
  if (token.kind !== "ball") return toBox(court, at);

  // Quien lo tiene es el jugador más cercano dentro del alcance, no el primero de la lista: con
  // un defensor encima, el balón sigue siendo de su atacante.
  let holder: BoardToken | undefined;
  let closest = Infinity;
  for (const candidate of tokens) {
    if (candidate.kind !== "attacker" && candidate.kind !== "defender") continue;
    const player = frame[candidate.id] ?? candidate.at;
    const distance = Math.hypot(player.x - at.x, player.y - at.y);
    if (distance <= BALL_REACH && distance < closest) {
      holder = candidate;
      closest = distance;
    }
  }
  if (!holder) return toBox(court, at);

  const center = toBox(court, frame[holder.id] ?? holder.at);
  const reach = (PLAYER_RADIUS + BALL_RADIUS) * scaleOf(court) * Math.SQRT1_2;
  return { x: center.x + reach, y: center.y + reach };
}

/** Las líneas de la pista, sin nada encima. */
export function CourtLines({ court }: { court: Court }) {
  if (court === "half") {
    return (
      <g fill="none" strokeWidth={1.2} className="stroke-ink-3">
        <rect x="5" y="5" width="90" height="65" rx="2.5" {...STROKE} />
        <rect x="37.5" y="5" width="25" height="27.5" {...STROKE} />
        <circle cx="50" cy="32.5" r="10" {...STROKE} />
        <path d="M12.5 5v15a37.5 37.5 0 0 0 75 0V5" {...STROKE} />
        <circle cx="50" cy="11.25" r="2.5" {...STROKE} />
      </g>
    );
  }

  return (
    <g fill="none" strokeWidth={1.2} className="stroke-ink-3">
      <rect x="3" y="3" width="94" height="50" rx="2" {...STROKE} />
      <path d="M50 3v50" {...STROKE} />
      <circle cx="50" cy="28" r="6" {...STROKE} />
      {/* El aro de ataque, a la izquierda. */}
      <rect x="3" y="20" width="19" height="16" {...STROKE} />
      <path d="M22 22a6 6 0 0 1 0 12" {...STROKE} />
      <path d="M3 7h9a22.5 22.5 0 0 1 0 42H3" {...STROKE} />
      <circle cx="8" cy="28" r="1.6" {...STROKE} />
      {/* Y el otro. */}
      <rect x="78" y="20" width="19" height="16" {...STROKE} />
      <path d="M78 22a6 6 0 0 0 0 12" {...STROKE} />
      <path d="M97 7h-9a22.5 22.5 0 0 0 0 42h9" {...STROKE} />
      <circle cx="92" cy="28" r="1.6" {...STROKE} />
    </g>
  );
}

/**
 * Lo que mide cada marca respecto a la media pista: en la completa caben el doble de metros en
 * la misma caja, y las fichas se encogen. No a la mitad: a 375 px sus números dejarían de leerse.
 */
export function boardScale(court: Court): number {
  return court === "half" ? 1 : 0.8;
}

const scaleOf = boardScale;

/** El número de un defensor no baja de este tamaño, en unidades de la caja (unos 11 px a 375). */
const MIN_SIDE_LABEL = 3.2;

/**
 * La marca de una ficha, dibujada alrededor del origen: quien la monta la coloca con un
 * `transform` (así se desplaza con una transición). Un atacante es un círculo con su etiqueta
 * dentro; un defensor, una X con la suya al lado; el balón, un punto relleno; un cono, un
 * triángulo. Sin `labels` (la miniatura) no lleva texto.
 */
export function TokenMark({ token, court, labels }: { token: BoardToken; court: Court; labels: boolean }) {
  const s = scaleOf(court);

  if (token.kind === "ball") return <circle r={BALL_RADIUS * s} className="fill-ink" />;

  if (token.kind === "cone") {
    return (
      <path
        d={`M0 ${-2.2 * s}L${2.2 * s} ${1.8 * s}H${-2.2 * s}Z`}
        fill="none"
        strokeWidth={1.2}
        strokeLinejoin="round"
        className="stroke-ink-3"
        {...STROKE}
      />
    );
  }

  if (token.kind === "attacker") {
    return (
      <>
        <circle r={PLAYER_RADIUS * s} strokeWidth={1.6} className="fill-surface-1 stroke-ink" {...STROKE} />
        {labels && token.label ? (
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={4.2 * s}
            className="fill-ink font-text font-semibold"
          >
            {token.label}
          </text>
        ) : null}
      </>
    );
  }

  const arm = 2.6 * s;
  return (
    <>
      <path
        d={`M${-arm} ${-arm}L${arm} ${arm}M${arm} ${-arm}L${-arm} ${arm}`}
        fill="none"
        strokeWidth={1.8}
        strokeLinecap="round"
        className="stroke-brand-accent"
        {...STROKE}
      />
      {labels && token.label ? (
        <text
          x={arm + 1.2 * s}
          y={-arm}
          fontSize={Math.max(MIN_SIDE_LABEL, 3.4 * s)}
          className="fill-brand-accent font-text font-semibold"
        >
          {token.label}
        </text>
      ) : null}
    </>
  );
}

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * El trazo de un movimiento entre dos puntos de la caja: la línea (recta, o en onda si es un
 * bote) y su remate (una punta de flecha, o una barra si es un bloqueo). La línea empieza y
 * acaba separada de las fichas, para no pisarlas. `null` si los dos puntos casi coinciden.
 */
export function movePaths(
  kind: BoardMoveKind,
  from: BoardPoint,
  to: BoardPoint,
  scale: number,
): { line: string; end: string } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const startGap = 4.4 * scale;
  const endGap = (kind === "pass" ? 2.6 : 1) * scale;
  if (length <= startGap + endGap + 1) return null;

  const ux = dx / length;
  const uy = dy / length;
  const start = { x: from.x + ux * startGap, y: from.y + uy * startGap };
  const end = { x: to.x - ux * endGap, y: to.y - uy * endGap };
  const run = length - startGap - endGap;

  let line = `M${fmt(start.x)} ${fmt(start.y)}`;
  if (kind === "dribble") {
    // Una onda a lo largo del trazo, que se endereza antes del remate.
    const wave = 3.2 * scale;
    const amplitude = 1.1 * scale;
    const straight = 3 * scale;
    // Un bote tan corto que no cabe ni una onda se queda en una línea recta: forzar una
    // pasaría del remate y volvería hacia atrás.
    const waves = Math.max(0, Math.floor((run - straight) / wave));
    for (let i = 1; i <= waves * 2; i += 1) {
      const along = (i * wave) / 2;
      // Los pares caen sobre el trazo; los impares, a un lado y al otro, por turnos.
      const crest = (i + 1) / 2;
      const side = i % 2 === 0 ? 0 : crest % 2 === 1 ? 1 : -1;
      line += `L${fmt(start.x + ux * along - uy * amplitude * side)} ${fmt(start.y + uy * along + ux * amplitude * side)}`;
    }
  }
  line += `L${fmt(end.x)} ${fmt(end.y)}`;

  const size = 2.4 * scale;
  if (kind === "screen") {
    return {
      line,
      end: `M${fmt(end.x - uy * size)} ${fmt(end.y + ux * size)}L${fmt(end.x + uy * size)} ${fmt(end.y - ux * size)}`,
    };
  }

  const back = { x: end.x - ux * size, y: end.y - uy * size };
  const wing = size * 0.6;
  return {
    line,
    end: `M${fmt(back.x - uy * wing)} ${fmt(back.y + ux * wing)}L${fmt(end.x)} ${fmt(end.y)}L${fmt(back.x + uy * wing)} ${fmt(back.y - ux * wing)}`,
  };
}

/**
 * Un movimiento, en `brand-accent`: continuo el corte, en onda el bote, discontinuo el pase y
 * continuo acabado en una barra el bloqueo. `from` y `to` son puntos de la pista. `box` los
 * sustituye por puntos de la caja ya calculados: el pase sale de donde se pinta el balón y
 * llega a donde se pintará, que no es exactamente donde dice la pizarra (`tokenBox`).
 */
export function MoveMark({
  kind,
  from,
  to,
  court,
  box,
}: {
  kind: BoardMoveKind;
  from: BoardPoint;
  to: BoardPoint;
  court: Court;
  box?: { from?: BoardPoint; to?: BoardPoint };
}) {
  const paths = movePaths(
    kind,
    box?.from ?? toBox(court, from),
    box?.to ?? toBox(court, to),
    scaleOf(court),
  );
  if (!paths) return null;

  return (
    <g
      data-move={kind}
      fill="none"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="stroke-brand-accent"
    >
      {/* Con `non-scaling-stroke` el guion se mide en píxeles de pantalla, no en unidades de la caja. */}
      <path d={paths.line} strokeDasharray={kind === "pass" ? "6 5" : undefined} {...STROKE} />
      <path d={paths.end} {...STROKE} />
    </g>
  );
}
