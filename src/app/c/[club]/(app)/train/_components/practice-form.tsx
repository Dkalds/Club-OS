"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { createPractice, updatePracticeMeta } from "@/modules/practice/actions";
import {
  LOCATION_MAX,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
  NOTES_MAX,
  TITLE_MAX,
} from "@/modules/practice/limits";
import type { FocusOption, TeamOption } from "@/modules/practice/types";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextAreaField, TextField } from "@/ui/form-field";
import { CheckIcon } from "@/ui/icons";

/**
 * Los datos de una sesión como los tiene el formulario: todo texto, que es lo que dan los
 * campos. `date` y `time` son los del reloj del club (`YYYY-MM-DD`, `HH:mm`) y `durationMinutes`
 * se convierte a número al enviar. Un objetivo sin elegir es `""`.
 */
export type PracticeFormValues = {
  teamId: string;
  title: string;
  date: string;
  time: string;
  durationMinutes: string;
  primaryFocusId: string;
  secondaryFocusId: string;
  location: string;
  notes: string;
};

/** Lo que el selector de un objetivo ofrece primero: no elegir ninguno. */
const NO_FOCUS = { value: "", label: "Sin objetivo" };

/** Un texto opcional que se queda en blanco se guarda como «sin texto», no como un texto vacío. */
function blankToNull(text: string): string | null {
  return text.trim() === "" ? null : text;
}

/**
 * Los datos de una sesión de entrenamiento, para crearla o, con `edit`, para cambiarlos.
 *
 * Sin `edit` es el alta (`/train/new`): pregunta por el equipo si hay más de uno (con uno solo
 * no hay nada que elegir y su id se envía igualmente), y «Crear sesión» es el `primary` de la
 * pantalla. Al crear, abre el detalle de la sesión nueva. `created` mantiene el botón parado
 * desde que sale bien hasta que la página cambia: la navegación tarda, y un segundo toque en
 * ese rato crearía otra sesión.
 *
 * Con `edit` son los datos de una sesión que ya existe (los del constructor): no pregunta por
 * el equipo, que no se cambia, y añade las notas. Su botón es `secondary`, porque lo principal
 * de esa pantalla es guardar la sesión. Guarda con `updatePracticeMeta` y la copia esperada de
 * `edit.expectedUpdatedAt`, que es la que tiene quien lo monta (el mismo `updatedAt` que
 * comparte con la lista de ejercicios): al guardar le entrega el nuevo con `onSaved`. Los
 * guardados que fallan no dicen «Datos guardados.».
 *
 * El estado sale de `initial` una sola vez. Si guardar falla, no se pierde nada de lo escrito:
 * el error de cada campo sale bajo él (`fieldErrors`) y el aviso general, arriba.
 */
export function PracticeForm({
  clubSlug,
  options,
  initial,
  edit,
}: {
  clubSlug: string;
  options: { teams: TeamOption[]; focusAreas: FocusOption[] };
  initial: PracticeFormValues;
  edit?: { eventId: string; expectedUpdatedAt: string; onSaved: (updatedAt: string) => void };
}) {
  const router = useRouter();
  const { pending, failure, run } = useAction();
  const [teamId, setTeamId] = useState(initial.teamId);
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes);
  const [primaryFocusId, setPrimaryFocusId] = useState(initial.primaryFocusId);
  const [secondaryFocusId, setSecondaryFocusId] = useState(initial.secondaryFocusId);
  const [location, setLocation] = useState(initial.location);
  const [notes, setNotes] = useState(initial.notes);
  const [saved, setSaved] = useState(false);
  const [created, setCreated] = useState(false);

  const focusOptions = [
    NO_FOCUS,
    ...options.focusAreas.map((focus) => ({ value: focus.id, label: focus.name })),
  ];

  /** Tocar cualquier campo deja sin efecto el «Datos guardados.» del guardado anterior. */
  function touch<V>(setValue: (value: V) => void) {
    return (value: V) => {
      setValue(value);
      setSaved(false);
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || created) return;
    setSaved(false);

    // Lo que no es de un campo de texto, en su tipo: `Number("")` es 0, que la acción rechaza
    // como toda duración fuera de rango, con su mensaje bajo el campo. Un objetivo sin elegir
    // se envía como `""`, que el esquema de la acción ya convierte en null.
    const session = {
      title,
      date,
      time,
      durationMinutes: Number(durationMinutes),
      primaryFocusId,
      secondaryFocusId,
      location: blankToNull(location),
    };

    if (edit) {
      run(
        () =>
          updatePracticeMeta(clubSlug, {
            eventId: edit.eventId,
            expectedUpdatedAt: edit.expectedUpdatedAt,
            ...session,
            notes: blankToNull(notes),
          }),
        ({ updatedAt }) => {
          setSaved(true);
          edit.onSaved(updatedAt);
        },
      );
      return;
    }

    run(
      () => createPractice(clubSlug, { teamId, ...session }),
      ({ eventId }) => {
        setCreated(true);
        router.push(`/c/${clubSlug}/train/${eventId}`);
      },
    );
  }

  const errors = failure?.fieldErrors ?? {};

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-4)">
      {failure ? <FormAlert message={ACTION_ERROR_COPY[failure.error]} /> : null}

      {!edit && options.teams.length > 1 ? (
        <SelectField
          label="Equipo"
          name="teamId"
          value={teamId}
          options={options.teams.map((team) => ({ value: team.id, label: team.name }))}
          onChange={touch(setTeamId)}
          error={errors.teamId}
        />
      ) : null}
      <TextField
        label="Título"
        name="title"
        value={title}
        onChange={touch(setTitle)}
        maxLength={TITLE_MAX}
        error={errors.title}
      />
      <TextField
        label="Fecha"
        name="date"
        type="date"
        value={date}
        onChange={touch(setDate)}
        error={errors.date}
      />
      <TextField
        label="Hora"
        name="time"
        type="time"
        value={time}
        onChange={touch(setTime)}
        error={errors.time}
      />
      <TextField
        label="Duración (min)"
        name="durationMinutes"
        type="number"
        value={durationMinutes}
        onChange={touch(setDurationMinutes)}
        min={MIN_SESSION_MINUTES}
        max={MAX_SESSION_MINUTES}
        error={errors.durationMinutes}
      />
      <SelectField
        label="Objetivo principal"
        name="primaryFocusId"
        value={primaryFocusId}
        options={focusOptions}
        onChange={touch(setPrimaryFocusId)}
        error={errors.primaryFocusId}
      />
      <SelectField
        label="Objetivo secundario"
        name="secondaryFocusId"
        value={secondaryFocusId}
        options={focusOptions}
        onChange={touch(setSecondaryFocusId)}
        error={errors.secondaryFocusId}
      />
      <TextField
        label="Lugar"
        name="location"
        value={location}
        onChange={touch(setLocation)}
        maxLength={LOCATION_MAX}
        error={errors.location}
      />
      {edit ? (
        <TextAreaField
          label="Notas"
          name="notes"
          value={notes}
          onChange={touch(setNotes)}
          maxLength={NOTES_MAX}
          rows={4}
          error={errors.notes}
        />
      ) : null}

      {edit ? (
        /*
          La región de estado está siempre en el árbol, vacía hasta que se guarda: un lector de
          pantalla solo anuncia el texto que cambia dentro de una región que ya existía. Vacía no
          ocupa nada: el margen negativo anula el hueco del `gap` del formulario.
        */
        <div role="status" className="empty:-mt-(--space-4)">
          {saved ? (
            <p className="flex items-center gap-(--space-2) text-body-strong text-success">
              <CheckIcon size={16} />
              Datos guardados.
            </p>
          ) : null}
        </div>
      ) : null}

      <CTAButton
        variant={edit ? "secondary" : "primary"}
        type="submit"
        block
        disabled={pending || created}
      >
        {edit ? "Guardar datos" : "Crear sesión"}
      </CTAButton>
    </form>
  );
}
