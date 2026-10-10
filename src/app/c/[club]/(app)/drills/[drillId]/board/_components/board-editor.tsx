"use client";

import { useRouter } from "next/navigation";
import { useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import {
  ballHeldBy,
  canAddStep,
  canAddToken,
  editorFrame,
  isHeld,
  editorReducer,
  initialEditor,
  movesFor,
  sameSavable,
  toSavable,
} from "@/modules/board/editor";
import { boardFrames } from "@/modules/board/frames";
import { MAX_MOVES, MAX_STEPS, MAX_TOKENS, NOTE_MAX } from "@/modules/board/limits";
import type {
  Board as BoardData,
  BoardFrame,
  BoardMoveKind,
  BoardPoint,
  BoardToken,
  BoardTokenKind,
} from "@/modules/board/types";
import { saveDrillBoard } from "@/modules/drills/actions";
import { Board } from "@/ui/board";
import { BOARD_VIEW, CourtLines, MoveMark, TokenMark, boardScale, fromBox, toBox, tokenBox } from "@/ui/board-drawing";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, TextField } from "@/ui/form-field";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, PlusIcon } from "@/ui/icons";
import { LeaveGuardDialog, useLeaveGuard } from "@/ui/leave-guard";

const TOKEN_KINDS: ReadonlyArray<{ kind: BoardTokenKind; label: string }> = [
  { kind: "attacker", label: "Atacante" },
  { kind: "defender", label: "Defensor" },
  { kind: "ball", label: "Balón" },
  { kind: "cone", label: "Cono" },
];

const MOVE_LABEL: Record<BoardMoveKind, string> = {
  cut: "Cortar",
  dribble: "Botar",
  screen: "Bloquear",
  pass: "Pasar",
};

/** Lo que avanza una ficha, o un destino, con cada toque de una flecha: unidades de pista. */
const NUDGE = 2;
/** A qué distancia de la ficha nace el destino de un movimiento, hacia el aro. */
const TARGET_OFFSET = 18;
/** Medio lado del área táctil de una ficha, en unidades de la caja: 44 px a 375 de ancho. */
const HIT_RADIUS = 6.5;
/**
 * La de un balón que alguien lleva: solo el balón. Se pinta pegado a su jugador, y con el área
 * entera taparía la de él. Para pasarlo no hace falta acertarle: a quien lo lleva se le ofrece
 * «Pasar».
 */
const HELD_BALL_HIT_RADIUS = 3;

type Direction = "up" | "down" | "left" | "right";

/** Cómo se nombra una ficha para quien no la ve: «Atacante 1», «Balón», «Cono 2». */
function tokenName(token: BoardToken): string {
  if (token.kind === "attacker") return `Atacante ${token.label ?? ""}`.trim();
  if (token.kind === "defender") return `Defensor ${token.label ?? ""}`.trim();
  const number = token.id.replace(/\D/g, "");
  if (token.kind === "ball") return number && number !== "1" ? `Balón ${number}` : "Balón";
  return `Cono ${number}`.trim();
}

/**
 * Un punto movido un toque en una dirección de la pantalla. En media pista, arriba es hacia el
 * aro; en la completa, que va apaisada, el aro de ataque queda a la izquierda.
 */
function nudge(court: BoardData["court"], point: BoardPoint, direction: Direction): BoardPoint {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const step = {
    half: { up: [0, -NUDGE], down: [0, NUDGE], left: [-NUDGE, 0], right: [NUDGE, 0] },
    full: { up: [NUDGE, 0], down: [-NUDGE, 0], left: [0, -NUDGE], right: [0, NUDGE] },
  }[court][direction];
  return { x: clamp(point.x + step[0]), y: clamp(point.y + step[1]) };
}

// La píldora de un paso y de una opción: el botón es el área táctil y la píldora, lo que se ve.
const CHIP =
  "group inline-flex min-h-(--target-min) shrink-0 cursor-pointer items-center focus-visible:outline-hidden";
const CHIP_PILL =
  "inline-flex h-9 items-center gap-(--space-1) rounded-pill border border-line bg-surface-2 px-(--space-3) " +
  "text-body-s font-semibold whitespace-nowrap text-ink-2 " +
  "group-aria-pressed:border-brand-accent group-aria-pressed:bg-brand-accent-soft group-aria-pressed:text-brand-accent " +
  "group-disabled:text-ink-3 " +
  "group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-focus-ring";

const ARROW =
  "inline-flex size-(--target-min) shrink-0 cursor-pointer items-center justify-center rounded-pill border border-line " +
  "text-ink active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";

/** Las cuatro flechas con las que se mueve una ficha o un destino sin arrastrar. */
function Arrows({ what, onMove }: { what: string; onMove: (direction: Direction) => void }) {
  return (
    <div role="group" aria-label={`Mover ${what}`} className="flex items-center gap-(--space-2)">
      <button type="button" aria-label={`Mover ${what} a la izquierda`} onClick={() => onMove("left")} className={ARROW}>
        <ChevronLeftIcon />
      </button>
      <button type="button" aria-label={`Mover ${what} arriba`} onClick={() => onMove("up")} className={ARROW}>
        <ChevronUpIcon />
      </button>
      <button type="button" aria-label={`Mover ${what} abajo`} onClick={() => onMove("down")} className={ARROW}>
        <ChevronDownIcon />
      </button>
      <button type="button" aria-label={`Mover ${what} a la derecha`} onClick={() => onMove("right")} className={ARROW}>
        <ChevronRightIcon />
      </button>
    </div>
  );
}

/**
 * El editor de la pizarra de un ejercicio: la pista, con el dibujo del visor, y debajo lo que se
 * puede hacer en cada momento. El estado es el del reductor `editorReducer`: aquí solo se
 * traducen toques a sus acciones.
 *
 * - **Pasos.** «Inicio» es dónde empieza cada ficha; cada paso enseña las fichas donde están al
 *   empezarlo y sus movimientos. «Paso» añade uno detrás del que se ve.
 * - **«Inicio».** Se añaden fichas (aparecen en un sitio libre) y se colocan: arrastrándolas con
 *   el dedo o, elegida una, con las flechas. «Quitar ficha» se la lleva con sus movimientos.
 * - **Un paso.** Tocar una ficha la elige y enseña lo que puede hacer («Cortar», «Botar»,
 *   «Bloquear»; el balón, y quien lo lleva, «Pasar»). Elegida la acción, se toca la pista donde acaba (tocar a un
 *   jugador al pasar le deja el balón a él), o se lleva el destino con las flechas y «Confirmar».
 * - **Deshacer y rehacer**, «Vista previa» (la pizarra en el visor, como se verá) y «Guardar
 *   pizarra», que guarda y vuelve a la ficha. Con cambios sin guardar, salir pregunta.
 *
 * El arrastre es local hasta soltar: la pizarra cambia una vez, y deshacer la devuelve a donde
 * estaba. Solo la ficha lleva `touch-action: none`: un dedo sobre ella la mueve y sobre el resto
 * de la pista desplaza la página.
 *
 * `expectedUpdatedAt` es la copia del ejercicio con la que se abrió: la pizarra la comparte con
 * el resto de su ficha. Si alguien guardó antes, el aviso ofrece «Recargar».
 */
export function BoardEditor({
  clubSlug,
  drillId,
  title,
  initialBoard,
  expectedUpdatedAt,
}: {
  clubSlug: string;
  drillId: string;
  title: string;
  initialBoard: BoardData | null;
  expectedUpdatedAt: string;
}) {
  const router = useRouter();
  const [state, dispatch] = useReducer(editorReducer, initialBoard, initialEditor);
  // La acción elegida para la ficha elegida, y dónde va su destino hasta que se confirma.
  const [pending, setPending] = useState<{ id: string; kind: BoardMoveKind; at: BoardPoint } | null>(null);
  // La ficha que se está arrastrando y por dónde va: no toca la pizarra hasta soltar.
  const [drag, setDrag] = useState<{ id: string; at: BoardPoint; moved: boolean } | null>(null);
  const [preview, setPreview] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const saving = useAction();
  const svg = useRef<SVGSVGElement>(null);

  const { board, view, selected } = state;
  const { court } = board;
  const { viewBox, aspect } = BOARD_VIEW[court];
  const scale = boardScale(court);
  const detailHref = `/c/${clubSlug}/drills/${drillId}`;

  const dirty = !sameSavable(board, initialBoard);
  const { dialog, release } = useLeaveGuard(dirty && !leaving);

  const frames = boardFrames(board);
  const base = editorFrame(state);
  const frame: BoardFrame = drag ? { ...base, [drag.id]: drag.at } : base;
  const step = view >= 1 ? board.steps[view - 1] : undefined;
  const after = frames[Math.min(frames.length - 1, view)];
  const selectedToken = board.tokens.find((token) => token.id === selected) ?? null;
  const selectedMove = step?.moves.find((move) => move.token === selected) ?? null;
  // El balón que lleva el jugador elegido: a él también se le ofrece pasarlo.
  const heldBall = selectedToken && view >= 1 ? ballHeldBy(board, base, selectedToken.id) : null;
  const heldBallMove = heldBall ? (step?.moves.find((move) => move.token === heldBall) ?? null) : null;
  const busy = saving.pending || leaving;

  /** El punto de la pista que hay bajo un toque. */
  function courtPoint(event: { clientX: number; clientY: number }): BoardPoint | null {
    const box = svg.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    const [, , width, height] = viewBox.split(" ").map(Number);
    return fromBox(court, {
      x: ((event.clientX - box.left) / box.width) * width,
      y: ((event.clientY - box.top) / box.height) * height,
    });
  }

  function select(id: string | null) {
    setPending(null);
    dispatch({ type: "select", id });
  }

  function goTo(next: number) {
    setPending(null);
    setDrag(null);
    dispatch({ type: "view", view: next });
  }

  function confirmMove(to: BoardPoint) {
    if (!pending) return;
    dispatch({ type: "set-move", id: pending.id, kind: pending.kind, to });
    setPending(null);
  }

  function startMove(kind: BoardMoveKind) {
    if (!selectedToken) return;
    // Un pase es del balón: el que lleva el jugador elegido, o el propio balón si es él el elegido.
    const mover = kind === "pass" && heldBall ? heldBall : selectedToken.id;
    const current = step?.moves.find((move) => move.token === mover);
    const at = base[mover] ?? selectedToken.at;
    // Parte de donde ya acababa, si la ficha se movía; si no, un poco hacia el aro.
    const from = current?.to ?? {
      x: at.x,
      y: at.y > TARGET_OFFSET ? at.y - TARGET_OFFSET : Math.min(100, at.y + TARGET_OFFSET),
    };
    setPending({ id: mover, kind, at: from });
  }

  function onTokenPointerDown(event: ReactPointerEvent<SVGGElement>, token: BoardToken) {
    // Con una acción a medias, tocar una ficha es elegir el destino: lo resuelve `onTokenClick`.
    if (pending) return;
    dispatch({ type: "select", id: token.id });
    if (view !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ id: token.id, at: base[token.id] ?? token.at, moved: false });
  }

  function onTokenPointerMove(event: ReactPointerEvent<SVGGElement>, token: BoardToken) {
    if (!drag || drag.id !== token.id) return;
    const at = courtPoint(event);
    if (at && (at.x !== drag.at.x || at.y !== drag.at.y)) setDrag({ id: token.id, at, moved: true });
  }

  function onTokenPointerUp(token: BoardToken) {
    if (!drag || drag.id !== token.id) return;
    if (drag.moved) dispatch({ type: "move-token", id: token.id, to: drag.at });
    setDrag(null);
  }

  function onTokenClick(token: BoardToken) {
    if (!pending) {
      dispatch({ type: "select", id: token.id });
      return;
    }
    if (token.id === pending.id) return;
    const at = base[token.id] ?? token.at;
    // Un pase a un jugador le deja el balón a él: a su lado, donde le acompaña si bota.
    const receiver = token.kind === "attacker" || token.kind === "defender";
    confirmMove(pending.kind === "pass" && receiver ? { x: Math.min(100, at.x + 3), y: at.y } : at);
  }

  function save(next: BoardData | null) {
    saving.run(
      async () => {
        try {
          return await saveDrillBoard(clubSlug, { drillId, expectedUpdatedAt, board: next });
        } finally {
          setConfirmingRemove(false);
        }
      },
      () => {
        // Se va a propósito: sin esto, el aviso de cambios sin guardar preguntaría al salir.
        setLeaving(true);
        release();
        router.push(detailHref);
      },
    );
  }

  function reload() {
    release();
    location.reload();
  }

  const stepLabel = view === 0 ? "Inicio" : `Paso ${view}`;

  return (
    <div className="flex flex-col gap-(--space-4)">
      {saving.failure ? (
        <FormAlert message={ACTION_ERROR_COPY[saving.failure.error]}>
          {saving.failure.error === "STALE_COPY" ? (
            <CTAButton variant="secondary" className="self-start" onClick={reload}>
              Recargar
            </CTAButton>
          ) : null}
        </FormAlert>
      ) : null}

      {preview ? (
        toSavable(board) ? (
          <Board board={toSavable(board) as BoardData} title={title} />
        ) : (
          <p className="rounded-md border border-line bg-surface-2 p-(--space-4) text-body text-ink-2">
            Aún no hay nada que ver: añade alguna ficha.
          </p>
        )
      ) : (
        <>
          <svg
            ref={svg}
            role="group"
            aria-label={`Pizarra de ${title}, ${stepLabel}`}
            focusable="false"
            viewBox={viewBox}
            onClick={(event) => {
              if (pending) {
                const to = courtPoint(event);
                if (to) confirmMove(to);
              } else {
                select(null);
              }
            }}
            className={`${aspect} w-full rounded-lg border border-line bg-surface-1 select-none`}
          >
            <CourtLines court={court} />

            {step
              ? step.moves.map((move) => {
                  const token = board.tokens.find((candidate) => candidate.id === move.token);
                  const from = base[move.token];
                  if (!token || !from) return null;
                  const box =
                    move.kind === "pass"
                      ? { from: tokenBox(court, token, base, board.tokens), to: tokenBox(court, token, after, board.tokens) }
                      : undefined;
                  return <MoveMark key={move.token} kind={move.kind} from={from} to={move.to} court={court} box={box} />;
                })
              : null}

            {pending && base[pending.id] ? (
              <g data-pending="" opacity={0.6} pointerEvents="none">
                <MoveMark kind={pending.kind} from={base[pending.id]} to={pending.at} court={court} />
                <circle
                  cx={toBox(court, pending.at).x}
                  cy={toBox(court, pending.at).y}
                  r={2.4 * scale}
                  fill="none"
                  strokeWidth={1.6}
                  strokeDasharray="4 3"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-brand-accent"
                />
              </g>
            ) : null}

            {board.tokens.map((token) => {
              const at = tokenBox(court, token, frame, board.tokens);
              const isSelected = token.id === selected;
              return (
                <g
                  key={token.id}
                  data-token={token.id}
                  role="button"
                  tabIndex={0}
                  aria-label={tokenName(token)}
                  aria-pressed={isSelected}
                  transform={`translate(${Math.round(at.x * 100) / 100} ${Math.round(at.y * 100) / 100})`}
                  onPointerDown={(event) => onTokenPointerDown(event, token)}
                  onPointerMove={(event) => onTokenPointerMove(event, token)}
                  onPointerUp={() => onTokenPointerUp(token)}
                  onPointerCancel={() => setDrag(null)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTokenClick(token);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onTokenClick(token);
                  }}
                  className="cursor-pointer touch-none focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  {/* El área táctil: 44 px aunque la marca sea más pequeña. */}
                  <circle
                    r={token.kind === "ball" && isHeld(board, frame, token.id) ? HELD_BALL_HIT_RADIUS : HIT_RADIUS}
                    fill="transparent"
                  />
                  {isSelected ? (
                    <circle
                      r={5.4 * scale}
                      pointerEvents="none"
                      fill="none"
                      strokeWidth={1.6}
                      strokeDasharray="3 3"
                      vectorEffect="non-scaling-stroke"
                      className="stroke-brand-accent"
                    />
                  ) : null}
                  <TokenMark token={token} court={court} labels />
                </g>
              );
            })}
          </svg>

          <div role="group" aria-label="Pasos" className="-mx-(--space-4) flex gap-(--space-2) overflow-x-auto px-(--space-4)">
            <button type="button" aria-pressed={view === 0} onClick={() => goTo(0)} className={CHIP}>
              <span className={CHIP_PILL}>Inicio</span>
            </button>
            {board.steps.map((_, index) => (
              <button
                // Los pasos no tienen identidad propia: son su posición.
                key={index}
                type="button"
                aria-pressed={view === index + 1}
                onClick={() => goTo(index + 1)}
                className={CHIP}
              >
                <span className={CHIP_PILL}>{`Paso ${index + 1}`}</span>
              </button>
            ))}
            <button
              type="button"
              disabled={!canAddStep(board)}
              onClick={() => {
                setPending(null);
                dispatch({ type: "add-step" });
              }}
              className={`${CHIP} disabled:cursor-default`}
            >
              <span className={CHIP_PILL}>
                <PlusIcon size={16} />
                Paso
              </span>
            </button>
          </div>
          {!canAddStep(board) ? (
            <p className="text-body-s text-ink-2">{`Una pizarra tiene como máximo ${MAX_STEPS} pasos.`}</p>
          ) : null}

          <div className="flex flex-col gap-(--space-3)">
            {pending ? (
              <>
                <p role="status" className="text-body text-ink-2">
                  {`${MOVE_LABEL[pending.kind]}: toca la pista donde acaba.`}
                </p>
                <Arrows what="el destino" onMove={(direction) => setPending({ ...pending, at: nudge(court, pending.at, direction) })} />
                <div className="flex flex-wrap gap-(--space-2)">
                  <CTAButton variant="secondary" onClick={() => confirmMove(pending.at)}>
                    Confirmar
                  </CTAButton>
                  <CTAButton variant="ghost" onClick={() => setPending(null)}>
                    Cancelar
                  </CTAButton>
                </div>
              </>
            ) : selectedToken && view === 0 ? (
              <>
                <p className="text-body-strong">{tokenName(selectedToken)}</p>
                <Arrows
                  what="la ficha"
                  onMove={(direction) =>
                    dispatch({
                      type: "move-token",
                      id: selectedToken.id,
                      to: nudge(court, base[selectedToken.id] ?? selectedToken.at, direction),
                    })
                  }
                />
                <div className="flex flex-wrap gap-(--space-2)">
                  <CTAButton variant="danger" onClick={() => dispatch({ type: "remove-token", id: selectedToken.id })}>
                    Quitar ficha
                  </CTAButton>
                  <CTAButton variant="ghost" onClick={() => select(null)}>
                    Listo
                  </CTAButton>
                </div>
              </>
            ) : selectedToken ? (
              <>
                <p className="text-body-strong">{tokenName(selectedToken)}</p>
                {movesFor(selectedToken.kind).length === 0 ? (
                  <p className="text-body text-ink-2">Los conos no se mueven.</p>
                ) : (
                  <div className="flex flex-wrap gap-(--space-2)">
                    {movesFor(selectedToken.kind).map((kind) => (
                      <CTAButton
                        key={kind}
                        variant="secondary"
                        // Con el paso lleno solo se puede cambiar un movimiento que ya está.
                        disabled={!selectedMove && (step?.moves.length ?? 0) >= MAX_MOVES}
                        onClick={() => startMove(kind)}
                      >
                        {MOVE_LABEL[kind]}
                      </CTAButton>
                    ))}
                    {heldBall ? (
                      <CTAButton
                        variant="secondary"
                        disabled={!heldBallMove && (step?.moves.length ?? 0) >= MAX_MOVES}
                        onClick={() => startMove("pass")}
                      >
                        {MOVE_LABEL.pass}
                      </CTAButton>
                    ) : null}
                    {selectedMove ? (
                      <CTAButton variant="danger" onClick={() => dispatch({ type: "clear-move", id: selectedToken.id })}>
                        Quitar movimiento
                      </CTAButton>
                    ) : null}
                    {heldBallMove && heldBall ? (
                      <CTAButton variant="danger" onClick={() => dispatch({ type: "clear-move", id: heldBall })}>
                        Quitar pase
                      </CTAButton>
                    ) : null}
                  </div>
                )}
                {!selectedMove && (step?.moves.length ?? 0) >= MAX_MOVES ? (
                  <p className="text-body-s text-ink-2">{`Un paso tiene como máximo ${MAX_MOVES} movimientos.`}</p>
                ) : null}
              </>
            ) : view === 0 ? (
              <>
                <div role="group" aria-label="Añadir ficha" className="flex flex-wrap gap-(--space-2)">
                  {TOKEN_KINDS.map(({ kind, label }) => (
                    <CTAButton
                      key={kind}
                      variant="secondary"
                      icon={<PlusIcon size={16} />}
                      // Con «Añadir» en el nombre: «Balón» a secas es también el nombre de la ficha.
                      aria-label={`Añadir ${label.toLowerCase()}`}
                      disabled={!canAddToken(board, kind)}
                      onClick={() => dispatch({ type: "add-token", kind })}
                    >
                      {label}
                    </CTAButton>
                  ))}
                </div>
                {board.tokens.length >= MAX_TOKENS ? (
                  <p className="text-body-s text-ink-2">{`Una pizarra tiene como máximo ${MAX_TOKENS} fichas.`}</p>
                ) : null}
                {board.tokens.length === 0 ? (
                  <p className="text-body text-ink-2">Añade fichas y arrástralas a su sitio.</p>
                ) : null}
                <div role="group" aria-label="Pista" className="flex gap-(--space-2)">
                  <button
                    type="button"
                    aria-pressed={court === "half"}
                    onClick={() => dispatch({ type: "set-court", court: "half" })}
                    className={CHIP}
                  >
                    <span className={CHIP_PILL}>Media pista</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={court === "full"}
                    onClick={() => dispatch({ type: "set-court", court: "full" })}
                    className={CHIP}
                  >
                    <span className={CHIP_PILL}>Pista completa</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-body text-ink-2">Toca una ficha para decir qué hace en este paso.</p>
                <TextField
                  label="Nota del paso"
                  name="note"
                  value={step?.note ?? ""}
                  onChange={(note) => dispatch({ type: "set-note", note })}
                  maxLength={NOTE_MAX}
                />
                <div className="flex flex-wrap gap-(--space-2)">
                  <CTAButton
                    variant="secondary"
                    disabled={!canAddStep(board)}
                    onClick={() => dispatch({ type: "duplicate-step" })}
                  >
                    Duplicar paso
                  </CTAButton>
                  <CTAButton variant="danger" onClick={() => dispatch({ type: "remove-step" })}>
                    Quitar paso
                  </CTAButton>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-(--space-2)">
        <CTAButton variant="secondary" disabled={preview || state.past.length === 0} onClick={() => { setPending(null); dispatch({ type: "undo" }); }}>
          Deshacer
        </CTAButton>
        <CTAButton variant="secondary" disabled={preview || state.future.length === 0} onClick={() => { setPending(null); dispatch({ type: "redo" }); }}>
          Rehacer
        </CTAButton>
        <CTAButton
          variant="secondary"
          aria-pressed={preview}
          onClick={() => {
            setPending(null);
            setPreview((shown) => !shown);
          }}
        >
          {preview ? "Seguir editando" : "Vista previa"}
        </CTAButton>
      </div>

      <CTAButton variant="primary" block disabled={!dirty || busy} onClick={() => save(toSavable(board))}>
        Guardar pizarra
      </CTAButton>

      {initialBoard ? (
        <>
          <CTAButton variant="danger" block disabled={busy} onClick={() => setConfirmingRemove(true)}>
            Quitar pizarra
          </CTAButton>
          <ConfirmDialog
            open={confirmingRemove}
            onOpenChange={setConfirmingRemove}
            title="¿Quitar la pizarra?"
            body="El ejercicio se queda sin pizarra. No se puede deshacer."
            confirmLabel="Quitar pizarra"
            cancelLabel="Volver"
            tone="danger"
            pending={saving.pending}
            onConfirm={() => save(null)}
          />
        </>
      ) : null}

      <LeaveGuardDialog {...dialog} />
    </div>
  );
}
