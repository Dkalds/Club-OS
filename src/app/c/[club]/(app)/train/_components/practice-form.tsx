"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
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

/** Si dos copias del formulario dicen lo mismo, campo a campo, tal como están escritas. */
function sameValues(a: PracticeFormValues, b: PracticeFormValues): boolean {
  return (Object.keys(a) as Array<keyof PracticeFormValues>).every((field) => a[field] === b[field]);
}

/**
 * Los datos de una sesión de entrenamiento, para crearla o, con `edit`, para cambiarlos.
 *
 * Sin `edit` es el alta (`/train/new`): pregunta por el equipo si hay más de uno (con uno solo
 * no hay nada que elegir y su id se envía igualmente), y «Crear sesión» es el `primary` de la
 * pantalla. Al crear, abre el constructor de la sesión nueva, que es lo siguiente: añadirle
 * los ejercicios. `created` mantiene el botón parado desde que sale bien hasta que la página
 * cambia: la navegación tarda, y un segundo toque en ese rato crearía otra sesión.
 *
 * Con `edit` son los datos de una sesión que ya existe (los del constructor): no pregunta por
 * el equipo, que no se cambia, y añade las notas. Su botón es `secondary`, porque lo principal
 * de esa pantalla es guardar la sesión. Guarda con `updatePracticeMeta` y la copia esperada de
 * `edit.expectedUpdatedAt`, que es la que tiene quien lo monta (el mismo `updatedAt` que
 * comparte con la lista de ejercicios): al guardar le entrega el nuevo con `onSaved`. Los
 * guardados que fallan no dicen «Datos guardados.». Si otra persona guardó antes (`STALE_COPY`),
 * el aviso ofrece «Recargar» (`edit.onReload`): hasta que se pulsa, lo escrito sigue ahí.
 *
 * Con `edit` avisa también de si hay cambios sin guardar (`edit.onDirtyChange`): quien lo monta
 * es quien pregunta antes de salir, porque en su pantalla hay más cosas que guardar. Los hay
 * mientras algún campo difiera de la última copia guardada, que es `initial` o, tras cada
 * guardado, lo que se envió. Avisa en el mismo manejador que cambia el campo o que recibe el
 * resultado, y no con un efecto: así quien lo monta lo sabe en la misma pintura, y al aparecer
 * «Datos guardados.» ya no hay aviso al cerrar la pestaña.
 *
 * Con `edit`, un guardado a la vez en la pantalla: los ejercicios se guardan aparte, contra la
 * misma copia, y dos guardados enviados a la vez llevarían la misma (el segundo fallaría como
 * si otra persona hubiera guardado). Con `edit.locked` (el otro está guardando) «Guardar datos»
 * espera, y de lo suyo avisa con `edit.onPendingChange`: que empieza, en el mismo envío, y que
 * ha terminado, cuando el resultado ya está pintado.
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
  edit?: {
    eventId: string;
    expectedUpdatedAt: string;
    locked: boolean;
    onSaved: (updatedAt: string) => void;
    onDirtyChange: (dirty: boolean) => void;
    onPendingChange: (pending: boolean) => void;
    onReload: () => void;
  };
}) {
  const router = useRouter();
  const { pending, failure, run } = useAction();
  const [values, setValues] = useState(initial);
  // La última copia guardada: contra ella se mide si hay cambios sin guardar.
  const [lastSaved, setLastSaved] = useState(initial);
  // Lo escrito ahora mismo, para el manejador que recibe el resultado de un guardado: es de
  // cuando se envió, y mientras tanto se ha podido seguir escribiendo.
  const latest = useRef(initial);
  const [saved, setSaved] = useState(false);
  const [created, setCreated] = useState(false);

  useEffect(() => {
    latest.current = values;
  }, [values]);

  // El fin del guardado se dice desde aquí y no desde el manejador del resultado: así llega
  // salga como salga y siempre después de pintarlo (ver `PracticeBuilder`).
  const locked = edit?.locked ?? false;
  const onPendingChange = edit?.onPendingChange;
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const focusOptions = [
    NO_FOCUS,
    ...options.focusAreas.map((focus) => ({ value: focus.id, label: focus.name })),
  ];

  /** Tocar cualquier campo deja sin efecto el «Datos guardados.» del guardado anterior. */
  function touch(field: keyof PracticeFormValues) {
    return (value: string) => {
      const next = { ...values, [field]: value };
      setValues(next);
      setSaved(false);
      edit?.onDirtyChange(!sameValues(next, lastSaved));
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || created || locked) return;
    setSaved(false);

    // Lo que se envía es lo que queda guardado: si se escribe mientras guarda, eso sigue sin guardar.
    const sent = values;
    // Lo que no es de un campo de texto, en su tipo: `Number("")` es 0, que la acción rechaza
    // como toda duración fuera de rango, con su mensaje bajo el campo. Un objetivo sin elegir
    // se envía como `""`, que el esquema de la acción ya convierte en null.
    const session = {
      title: sent.title,
      date: sent.date,
      time: sent.time,
      durationMinutes: Number(sent.durationMinutes),
      primaryFocusId: sent.primaryFocusId,
      secondaryFocusId: sent.secondaryFocusId,
      location: blankToNull(sent.location),
    };

    if (edit) {
      edit.onPendingChange(true);
      run(
        () =>
          updatePracticeMeta(clubSlug, {
            eventId: edit.eventId,
            expectedUpdatedAt: edit.expectedUpdatedAt,
            ...session,
            notes: blankToNull(sent.notes),
          }),
        ({ updatedAt }) => {
          const dirty = !sameValues(latest.current, sent);
          setLastSaved(sent);
          setSaved(!dirty);
          edit.onSaved(updatedAt);
          edit.onDirtyChange(dirty);
        },
      );
      return;
    }

    run(
      () => createPractice(clubSlug, { teamId: sent.teamId, ...session }),
      ({ eventId }) => {
        setCreated(true);
        router.push(`/c/${clubSlug}/train/${eventId}/edit`);
      },
    );
  }

  const errors = failure?.fieldErrors ?? {};

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-4)">
      {failure ? (
        <FormAlert message={ACTION_ERROR_COPY[failure.error]}>
          {edit && failure.error === "STALE_COPY" ? (
            <CTAButton variant="secondary" className="self-start" onClick={edit.onReload}>
              Recargar
            </CTAButton>
          ) : null}
        </FormAlert>
      ) : null}

      {!edit && options.teams.length > 1 ? (
        <SelectField
          label="Equipo"
          name="teamId"
          value={values.teamId}
          options={options.teams.map((team) => ({ value: team.id, label: team.name }))}
          onChange={touch("teamId")}
          error={errors.teamId}
        />
      ) : null}
      <TextField
        label="Título"
        name="title"
        value={values.title}
        onChange={touch("title")}
        maxLength={TITLE_MAX}
        error={errors.title}
      />
      <TextField
        label="Fecha"
        name="date"
        type="date"
        value={values.date}
        onChange={touch("date")}
        error={errors.date}
      />
      <TextField
        label="Hora"
        name="time"
        type="time"
        value={values.time}
        onChange={touch("time")}
        error={errors.time}
      />
      <TextField
        label="Duración (min)"
        name="durationMinutes"
        type="number"
        value={values.durationMinutes}
        onChange={touch("durationMinutes")}
        min={MIN_SESSION_MINUTES}
        max={MAX_SESSION_MINUTES}
        error={errors.durationMinutes}
      />
      <SelectField
        label="Objetivo principal"
        name="primaryFocusId"
        value={values.primaryFocusId}
        options={focusOptions}
        onChange={touch("primaryFocusId")}
        error={errors.primaryFocusId}
      />
      <SelectField
        label="Objetivo secundario"
        name="secondaryFocusId"
        value={values.secondaryFocusId}
        options={focusOptions}
        onChange={touch("secondaryFocusId")}
        error={errors.secondaryFocusId}
      />
      <TextField
        label="Lugar"
        name="location"
        value={values.location}
        onChange={touch("location")}
        maxLength={LOCATION_MAX}
        error={errors.location}
      />
      {edit ? (
        <TextAreaField
          label="Notas"
          name="notes"
          value={values.notes}
          onChange={touch("notes")}
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
        disabled={pending || created || locked}
      >
        {edit ? "Guardar datos" : "Crear sesión"}
      </CTAButton>
    </form>
  );
}
