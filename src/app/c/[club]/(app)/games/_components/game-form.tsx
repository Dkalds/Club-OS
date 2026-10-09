"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { createGame, updateGame } from "@/modules/games/actions";
import {
  COMPETITION_MAX,
  LOCATION_MAX,
  MAX_GAME_MINUTES,
  MIN_GAME_MINUTES,
  OPPONENT_MAX,
  OPPONENT_NOTES_MAX,
} from "@/modules/games/limits";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextAreaField, TextField } from "@/ui/form-field";
import { LeaveGuardDialog, useLeaveGuard } from "@/ui/leave-guard";

/** Los datos de un partido como los tiene el formulario: todo texto, que es lo que dan los campos. */
export type GameFormValues = {
  teamId: string;
  opponent: string;
  date: string;
  time: string;
  durationMinutes: string;
  homeAway: "" | "home" | "away";
  competition: string;
  location: string;
  opponentNotes: string;
};

const same = (a: GameFormValues, b: GameFormValues) =>
  (Object.keys(a) as Array<keyof GameFormValues>).every((field) => a[field] === b[field]);

/**
 * Los datos de un partido, para crearlo o, con `eventId`, para cambiarlos. La fecha y la hora
 * son las del reloj del club. Al guardar va al detalle del partido. Avisa al salir con cambios
 * sin guardar; mientras navega tras guardar, el botón sigue parado (un segundo toque crearía
 * otro partido).
 */
export function GameForm({
  clubSlug,
  teams,
  initial,
  eventId,
}: {
  clubSlug: string;
  teams: Array<{ id: string; name: string }>;
  initial: GameFormValues;
  eventId?: string;
}) {
  const router = useRouter();
  const { pending, failure, run } = useAction();
  const [values, setValues] = useState(initial);
  const [done, setDone] = useState(false);
  const { dialog, release } = useLeaveGuard(!done && !same(values, initial));

  const touch = (field: keyof GameFormValues) => (value: string) => setValues({ ...values, [field]: value });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || done) return;

    const game = {
      opponent: values.opponent,
      date: values.date,
      time: values.time,
      durationMinutes: Number(values.durationMinutes),
      homeAway: values.homeAway,
      competition: values.competition,
      location: values.location,
    };
    const goTo = (id: string) => {
      setDone(true);
      release();
      router.push(`/c/${clubSlug}/games/${id}`);
    };

    if (eventId) {
      run(() => updateGame(clubSlug, { eventId, ...game, opponentNotes: values.opponentNotes }), () => goTo(eventId));
    } else {
      run(() => createGame(clubSlug, { teamId: values.teamId, ...game }), ({ eventId: created }) => goTo(created));
    }
  }

  const errors = failure?.fieldErrors ?? {};

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-4)">
      {failure ? <FormAlert message={ACTION_ERROR_COPY[failure.error]} focus={Object.keys(errors).length === 0} /> : null}

      {!eventId && teams.length > 1 ? (
        <SelectField
          label="Equipo"
          name="teamId"
          value={values.teamId}
          options={teams.map((team) => ({ value: team.id, label: team.name }))}
          onChange={touch("teamId")}
          error={errors.teamId}
        />
      ) : null}
      <TextField label="Rival" name="opponent" value={values.opponent} onChange={touch("opponent")} maxLength={OPPONENT_MAX} error={errors.opponent} />
      <TextField label="Fecha" name="date" type="date" value={values.date} onChange={touch("date")} error={errors.date} />
      <TextField label="Hora" name="time" type="time" value={values.time} onChange={touch("time")} error={errors.time} />
      <TextField
        label="Duración (min)"
        name="durationMinutes"
        type="number"
        value={values.durationMinutes}
        onChange={touch("durationMinutes")}
        min={MIN_GAME_MINUTES}
        max={MAX_GAME_MINUTES}
        error={errors.durationMinutes}
      />
      <SelectField<GameFormValues["homeAway"]>
        label="Local o visitante"
        name="homeAway"
        value={values.homeAway}
        options={[
          { value: "", label: "Sin decir" },
          { value: "home", label: "Local" },
          { value: "away", label: "Visitante" },
        ]}
        onChange={touch("homeAway")}
        error={errors.homeAway}
      />
      <TextField label="Competición" name="competition" value={values.competition} onChange={touch("competition")} maxLength={COMPETITION_MAX} error={errors.competition} />
      <TextField label="Lugar" name="location" value={values.location} onChange={touch("location")} maxLength={LOCATION_MAX} error={errors.location} />
      {eventId ? (
        <TextAreaField
          label="Notas del rival"
          name="opponentNotes"
          value={values.opponentNotes}
          onChange={touch("opponentNotes")}
          maxLength={OPPONENT_NOTES_MAX}
          hint="Solo las ve el cuerpo técnico."
          error={errors.opponentNotes}
        />
      ) : null}

      <CTAButton variant="primary" type="submit" block disabled={pending || done}>
        {eventId ? "Guardar partido" : "Crear partido"}
      </CTAButton>
      <LeaveGuardDialog {...dialog} />
    </form>
  );
}
