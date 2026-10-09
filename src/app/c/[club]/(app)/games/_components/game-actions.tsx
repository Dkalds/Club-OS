"use client";

import { useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { cancelGame, recordResult } from "@/modules/games/actions";
import { SCORE_MAX } from "@/modules/games/limits";
import type { GameDetail } from "@/modules/games/types";
import { BottomSheet } from "@/ui/bottom-sheet";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, TextField } from "@/ui/form-field";

/**
 * Lo que se hace con un partido desde su detalle ([D9]): apuntar el resultado desde la hora de
 * inicio (y corregirlo después), editarlo y cancelarlo si aún no se ha jugado. Uno cancelado ya
 * no ofrece nada. El resultado se escribe desde el punto de vista del club: el propio primero.
 */
export function GameActions({ clubSlug, game, teamLabel }: { clubSlug: string; game: GameDetail; teamLabel: string }) {
  const result = useAction();
  const cancel = useAction();
  const [sheet, setSheet] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [scoreFor, setScoreFor] = useState(game.score ? String(game.score.for) : "");
  const [scoreAgainst, setScoreAgainst] = useState(game.score ? String(game.score.against) : "");

  if (game.status === "cancelled") return null;

  const canRecord = game.started;
  const errors = result.failure?.fieldErrors ?? {};

  return (
    <div className="flex flex-col gap-(--space-2)">
      {cancel.failure ? <FormAlert message={ACTION_ERROR_COPY[cancel.failure.error]} /> : null}

      {canRecord ? (
        <CTAButton variant="primary" block onClick={() => setSheet(true)}>
          {game.score ? "Corregir resultado" : "Apuntar resultado"}
        </CTAButton>
      ) : null}
      <CTAButton variant="secondary" block href={`/c/${clubSlug}/games/${game.eventId}/edit`}>
        Editar partido
      </CTAButton>
      {game.status === "scheduled" ? (
        <CTAButton variant="ghost" block onClick={() => setConfirmCancel(true)}>
          Cancelar partido
        </CTAButton>
      ) : null}

      <BottomSheet
        open={sheet}
        onOpenChange={(open) => (open || result.pending ? undefined : setSheet(false))}
        title="Resultado"
        footer={
          <CTAButton variant="primary" block type="submit" form="game-result" disabled={result.pending}>
            Guardar resultado
          </CTAButton>
        }
      >
        <form
          id="game-result"
          noValidate
          className="flex flex-col gap-(--space-4) px-(--space-4) pb-(--space-4)"
          onSubmit={(event) => {
            event.preventDefault();
            result.run(
              () =>
                recordResult(clubSlug, {
                  eventId: game.eventId,
                  scoreFor: scoreFor === "" ? Number.NaN : Number(scoreFor),
                  scoreAgainst: scoreAgainst === "" ? Number.NaN : Number(scoreAgainst),
                }),
              () => setSheet(false),
            );
          }}
        >
          {result.failure ? (
            <FormAlert message={ACTION_ERROR_COPY[result.failure.error]} focus={Object.keys(errors).length === 0} />
          ) : null}
          <TextField label={teamLabel} name="scoreFor" type="number" value={scoreFor} onChange={setScoreFor} min={0} max={SCORE_MAX} error={errors.scoreFor} />
          <TextField label={game.opponent} name="scoreAgainst" type="number" value={scoreAgainst} onChange={setScoreAgainst} min={0} max={SCORE_MAX} error={errors.scoreAgainst} />
        </form>
      </BottomSheet>

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={(open) => (open || cancel.pending ? undefined : setConfirmCancel(false))}
        title="¿Cancelar este partido?"
        body="Dejará de salir en Próximos y en Inicio. No se puede deshacer."
        confirmLabel="Cancelar partido"
        cancelLabel="Volver"
        tone="danger"
        pending={cancel.pending}
        onConfirm={() => cancel.run(() => cancelGame(clubSlug, { eventId: game.eventId }), () => setConfirmCancel(false))}
      />
    </div>
  );
}
