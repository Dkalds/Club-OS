import type { Board } from "@/modules/board/types";
import { boardFrames } from "@/modules/board/frames";
import { BOARD_VIEW, CourtLines, TokenMark, tokenBox } from "./board-drawing";
import { COURT_BOX } from "./court-thumb";

/**
 * La miniatura de una pizarra (design/components/Board): cómo empieza, sin etiquetas, sin
 * movimientos y sin controles. Mide lo que la pista vacía de una fila (80×60, `surface-2`,
 * `radius-sm`); la pista completa, que es apaisada, se centra dentro.
 *
 * Es decorativa: va junto al título del ejercicio, que es quien dice qué es. Sin
 * `"use client"`: es pura, y la pinta `DrillCard`, que es de servidor.
 */
export function BoardThumb({ board }: { board: Board }) {
  const [start] = boardFrames(board);

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-board-thumb=""
      viewBox={BOARD_VIEW[board.court].viewBox}
      className={COURT_BOX.thumb}
    >
      <CourtLines court={board.court} />
      {board.tokens.map((token) => {
        const at = tokenBox(board.court, token, start, board.tokens);
        return (
          <g key={token.id} transform={`translate(${Math.round(at.x * 100) / 100} ${Math.round(at.y * 100) / 100})`}>
            <TokenMark token={token} court={board.court} labels={false} />
          </g>
        );
      })}
    </svg>
  );
}
