"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { boardFrames, boardLabel } from "@/modules/board/frames";
import type { Board as BoardData } from "@/modules/board/types";
import { BOARD_VIEW, CourtLines, MoveMark, TokenMark, tokenBox } from "./board-drawing";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon, RestartIcon } from "./icons";

/** Lo que se ve un paso, con sus movimientos dibujados, antes de que las fichas se desplacen. */
export const BOARD_HOLD_MS = 700;
/** Lo que tardan las fichas en llegar a su sitio. La transición de CSS dura lo mismo. */
export const BOARD_MOVE_MS = 900;

/** Si quien mira ha pedido menos movimiento: entonces las fichas saltan a su sitio. */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Dos decimales bastan para colocar una ficha, y evitan colas como `78.19999999999999`. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// Un botón de la pizarra: `target-min` de lado, con el icono dentro y el nombre para quien no lo ve.
const CONTROL =
  "inline-flex size-(--target-min) shrink-0 cursor-pointer items-center justify-center rounded-pill " +
  "text-ink active:bg-surface-3 disabled:cursor-default disabled:text-ink-3 " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";

function Control({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className={CONTROL}>
      {children}
    </button>
  );
}

/**
 * La pizarra de un ejercicio (design/components/Board): la pista con sus fichas y, si la
 * pizarra tiene pasos, la secuencia con sus controles.
 *
 * Una pizarra sin pasos es una foto fija: solo el dibujo. Con pasos, cada uno enseña las fichas
 * donde están al empezarlo y los movimientos de ese paso; tras el último queda el final, con
 * cada ficha donde acaba y sin movimientos. Debajo, los controles (de `target-min`):
 *
 * Sus nombres dicen «la pizarra» («Reproducir la pizarra»): en el directo conviven con «Pausa» y
 * «Siguiente ejercicio», que son de la sesión, y con un lector de pantalla se confundirían.
 *
 * - «Reiniciar» vuelve al primer paso y para.
 * - «Paso anterior» y «Paso siguiente» cambian de paso sin animación, y paran.
 * - «Reproducir» enseña el paso (`BOARD_HOLD_MS`), desplaza las fichas a su sitio siguiente
 *   (`BOARD_MOVE_MS`) y sigue con el siguiente, hasta el final. Desde el final, empieza de
 *   nuevo. Mientras reproduce, el botón es «Pausar»: pausar deja el paso en el que estaba.
 *
 * El desplazamiento es una transición de CSS sobre la posición de cada ficha, solo mientras
 * reproduce. Con «reducir movimiento» no la hay (`motion-reduce`), y reproducir pasa de un paso
 * al siguiente sin esperar a un desplazamiento que no se ve.
 *
 * El dibujo tiene nombre para quien no lo ve («Pizarra de 3 calles, paso 2 de 4»). «Paso 2 de
 * 4» y la nota del paso van en una región de estado: al cambiar de paso se anuncian. Mientras
 * reproduce no (`aria-live="off"`): se pisarían unas a otras.
 *
 * Los temporizadores son de un efecto que se limpia al desmontar: salir de la pantalla a media
 * reproducción no deja nada vivo. El paso y la reproducción son estado del componente y no se
 * reinician solos con otra pizarra: quien monte otra en el mismo sitio (el directo, al cambiar
 * de ejercicio) le da otra `key` para que empiece de cero.
 */
export function Board({ board, title }: { board: BoardData; title: string }) {
  const frames = useMemo(() => boardFrames(board), [board]);
  const steps = board.steps.length;
  // El paso que se enseña, de 0 a `steps`: `steps` es el final.
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Reproduciendo, las fichas ya van camino del paso siguiente.
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!playing) return;

    if (position >= steps) {
      const done = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(done);
    }

    const wait = moving ? (prefersReducedMotion() ? 0 : BOARD_MOVE_MS) : BOARD_HOLD_MS;
    const timer = setTimeout(() => {
      if (moving) {
        setPosition(position + 1);
        setMoving(false);
        // Al llegar al final para en la misma pintura: «Final» aparece ya con la región de
        // estado activa, y con el botón de nuevo en «Reproducir».
        if (position + 1 >= steps) setPlaying(false);
      } else {
        setMoving(true);
      }
    }, wait);
    return () => clearTimeout(timer);
  }, [playing, moving, position, steps]);

  function goTo(next: number) {
    setPlaying(false);
    setMoving(false);
    setPosition(Math.min(steps, Math.max(0, next)));
  }

  function togglePlay() {
    if (playing) {
      setPlaying(false);
      setMoving(false);
      return;
    }
    if (position >= steps) setPosition(0);
    setMoving(false);
    setPlaying(true);
  }

  const { viewBox, aspect } = BOARD_VIEW[board.court];
  const shown = frames[Math.min(frames.length - 1, moving ? position + 1 : position)];
  const start = frames[Math.min(frames.length - 1, position)];
  const step = position < steps ? board.steps[position] : undefined;
  // A dónde llega cada ficha en este paso: el pase acaba donde se pintará el balón.
  const after = frames[Math.min(frames.length - 1, position + 1)];
  const tokenById = new Map(board.tokens.map((token) => [token.id, token]));

  return (
    <div className="flex flex-col gap-(--space-2)">
      <svg
        role="img"
        aria-label={boardLabel(title, position, steps)}
        focusable="false"
        viewBox={viewBox}
        className={`${aspect} w-full rounded-lg border border-line bg-surface-1`}
      >
        <CourtLines court={board.court} />
        {step
          ? step.moves.map((move) => {
              const from = start[move.token];
              const token = tokenById.get(move.token);
              if (!from || !token) return null;
              const box =
                move.kind === "pass"
                  ? {
                      from: tokenBox(board.court, token, start, board.tokens),
                      to: tokenBox(board.court, token, after, board.tokens),
                    }
                  : undefined;
              return (
                <MoveMark
                  key={move.token}
                  kind={move.kind}
                  from={from}
                  to={move.to}
                  court={board.court}
                  box={box}
                />
              );
            })
          : null}
        {board.tokens.map((token) => {
          const at = tokenBox(board.court, token, shown, board.tokens);
          return (
            <g
              key={token.id}
              data-token={token.id}
              // En el estilo y no en el atributo: así la posición admite una transición de CSS.
              style={{ transform: `translate(${round(at.x)}px, ${round(at.y)}px)` }}
              className={playing ? "transition-transform duration-900 ease-in-out motion-reduce:transition-none" : undefined}
            >
              <TokenMark token={token} court={board.court} labels />
            </g>
          );
        })}
      </svg>

      {steps > 0 ? (
        <>
          <div className="flex items-center gap-(--space-1)">
            <Control label="Reiniciar la pizarra" disabled={position === 0 && !playing} onClick={() => goTo(0)}>
              <RestartIcon />
            </Control>
            <Control label="Paso anterior" disabled={position === 0} onClick={() => goTo(position - 1)}>
              <PreviousIcon />
            </Control>
            <Control label={playing ? "Pausar la pizarra" : "Reproducir la pizarra"} onClick={togglePlay}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </Control>
            <Control label="Paso siguiente" disabled={position >= steps} onClick={() => goTo(position + 1)}>
              <NextIcon />
            </Control>
            <p
              role="status"
              aria-live={playing ? "off" : "polite"}
              className="ml-auto text-body-s text-ink-2 tabular-nums"
            >
              {position >= steps ? "Final" : `Paso ${position + 1} de ${steps}`}
            </p>
          </div>
          {/* Siempre en el árbol, también vacía: solo se anuncia lo que cambia en una región que ya existía. */}
          <p
            role="status"
            aria-live={playing ? "off" : "polite"}
            data-board-note=""
            className="min-h-(--space-6) text-body text-ink-2"
          >
            {step?.note ?? ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
