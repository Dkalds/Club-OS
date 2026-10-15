"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useAction } from "@/lib/use-action";
import { createTeamSchedule, deleteTeamSchedule, updateTeamSchedule } from "@/modules/calendar/actions";
import { practiceCount, scheduleLabel, WEEKDAY_OPTIONS } from "@/modules/calendar/format";
import { DURATION_MAX, DURATION_MIN } from "@/modules/calendar/schema";
import type { TeamSchedule } from "@/modules/calendar/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextField } from "@/ui/form-field";
import { ChevronDownIcon } from "@/ui/icons";
import { EditorForm, focusField, useConfirmation } from "./editor-shell";
import { BLOCK_HEADING_CLASS, toNumber } from "./structure-shared";

/** El valor del selector de pista cuando el horario no tiene ninguna. */
const NO_VENUE = "";

/** La hora, la duración y la pista con las que se propone un horario nuevo. */
const DEFAULTS = { weekday: "1", time: "18:00", duration: "75", venueId: NO_VENUE };

type VenueOption = { id: string; name: string };

type SlotValues = { weekday: string; time: string; duration: string; venueId: string };

/** Lo que se manda a la acción: sin número de duración, `NaN`, que rechaza el esquema con su mensaje. */
function toInput(values: SlotValues) {
  return {
    weekday: Number(values.weekday),
    time: values.time,
    durationMinutes: toNumber(values.duration) ?? Number.NaN,
    venueId: values.venueId === NO_VENUE ? null : values.venueId,
  };
}

/** Los cuatro campos de un horario: los comparten el alta y el cambio. */
function SlotFields({
  values,
  onChange,
  venues,
  errors,
}: {
  values: SlotValues;
  onChange: (field: keyof SlotValues) => (value: string) => void;
  venues: readonly VenueOption[];
  errors: Record<string, string>;
}) {
  return (
    <>
      <SelectField
        label="Día"
        name="weekday"
        value={values.weekday}
        onChange={onChange("weekday")}
        options={WEEKDAY_OPTIONS}
        error={errors.weekday}
      />
      <TextField
        label="Hora"
        name="time"
        type="time"
        value={values.time}
        onChange={onChange("time")}
        hint="La del reloj del club."
        error={errors.time}
      />
      <TextField
        label="Duración (min)"
        name="durationMinutes"
        type="number"
        min={DURATION_MIN}
        max={DURATION_MAX}
        value={values.duration}
        onChange={onChange("duration")}
        error={errors.durationMinutes}
      />
      <SelectField
        label="Pista"
        name="venueId"
        value={values.venueId}
        onChange={onChange("venueId")}
        options={[{ value: NO_VENUE, label: "Sin pista" }, ...venues.map((venue) => ({ value: venue.id, label: venue.name }))]}
        error={errors.venueId}
      />
    </>
  );
}

/**
 * Un horario del equipo. Plegado, una línea: «Martes · 18:00–19:15 · Pabellón 2». Desplegado, se
 * cambia (y con él se mueven sus entrenamientos futuros que siguen en su sitio) o se quita (y se
 * borran los que nadie ha tocado). Las dos cosas dicen a cuántos entrenamientos han afectado:
 * cambiarlo, aquí; quitarlo, quien lo monta (`onRemoved`), porque esta fila desaparece.
 */
function ScheduleRow({
  clubSlug,
  schedule,
  venues,
  onRemoved,
}: {
  clubSlug: string;
  schedule: TeamSchedule;
  venues: readonly VenueOption[];
  onRemoved: (removed: number) => void;
}) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear } = useConfirmation();
  const headingId = useId();
  const [values, setValues] = useState<SlotValues>({
    weekday: String(schedule.weekday),
    time: schedule.startTime,
    duration: String(schedule.durationMinutes),
    venueId: schedule.venueId ?? NO_VENUE,
  });
  const [asking, setAsking] = useState(false);

  const change = (field: keyof SlotValues) => (value: string) => {
    clear();
    setValues({ ...values, [field]: value });
  };

  function submit() {
    clear();
    run(
      () => updateTeamSchedule(clubSlug, { id: schedule.id, ...toInput(values) }),
      // «Actualizados», no «con la hora nueva»: también cuenta el que solo cambia de pista o de
      // duración.
      ({ moved }) =>
        confirm(moved > 0 ? `Horario cambiado: ${practiceCount(moved)} ${moved === 1 ? "actualizado" : "actualizados"}.` : "Horario cambiado."),
    );
  }

  function remove() {
    run(
      async () => {
        try {
          return await deleteTeamSchedule(clubSlug, { id: schedule.id });
        } finally {
          setAsking(false);
        }
      },
      ({ removed }) => onRemoved(removed),
    );
  }

  return (
    <li className="border-t border-line first:border-t-0">
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-(--space-3) py-(--space-2) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden">
          <span id={headingId} className="min-w-0 flex-1 text-body-strong wrap-break-word">
            {scheduleLabel(schedule)}
          </span>
          <ChevronDownIcon
            size={16}
            className="shrink-0 text-ink-2 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="flex flex-col gap-(--space-3) pb-(--space-4)">
          <EditorForm
            mode="edit"
            headingId={headingId}
            submitLabel="Guardar"
            failure={failure}
            confirmation={message}
            pending={pending}
            onSubmit={submit}
          >
            <SlotFields values={values} onChange={change} venues={venues} errors={failure?.fieldErrors ?? {}} />
          </EditorForm>
          <p className="text-body-s text-ink-2">
            Al guardar se mueven sus entrenamientos futuros que siguen en su sitio. El que alguien cambió a mano
            se queda donde está.
          </p>
          <CTAButton
            variant="danger"
            className="self-start"
            disabled={pending}
            aria-describedby={headingId}
            onClick={() => setAsking(true)}
          >
            Quitar horario
          </CTAButton>
          <ConfirmDialog
            open={asking}
            onOpenChange={setAsking}
            title="¿Quitar este horario?"
            body="Se borran sus entrenamientos futuros que nadie ha preparado ni movido. Los demás se quedan como sesiones sueltas. No se puede deshacer."
            confirmLabel="Quitar horario"
            cancelLabel="Volver"
            tone="danger"
            pending={pending}
            onConfirm={remove}
          />
        </div>
      </details>
    </li>
  );
}

/**
 * El horario semanal de un equipo: sus horarios y el alta de uno nuevo, que crea sus
 * entrenamientos hasta el final de la temporada y dice cuántos. Las horas son las del reloj del
 * club.
 *
 * `closed`: la temporada del equipo ya ha acabado y no hay nada que crear; los horarios que
 * tuviera se ven y se quitan, pero no se añaden.
 */
export function ScheduleSection({
  clubSlug,
  teamId,
  schedules,
  venues,
  closed = false,
}: {
  clubSlug: string;
  teamId: string;
  schedules: readonly TeamSchedule[];
  venues: readonly VenueOption[];
  closed?: boolean;
}) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear } = useConfirmation();
  const headingId = useId();
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Lo que pasó al quitar un horario: su fila ya no está para decirlo.
  const [removed, setRemoved] = useState<string | null>(null);
  const [values, setValues] = useState<SlotValues>(DEFAULTS);

  const change = (field: keyof SlotValues) => (value: string) => {
    clear();
    setValues({ ...values, [field]: value });
  };

  function submit() {
    clear();
    setRemoved(null);
    run(
      () => createTeamSchedule(clubSlug, { teamId, ...toInput(values) }),
      ({ created }) => {
        confirm(
          created > 0
            ? `Horario creado: ${practiceCount(created)} hasta el final de la temporada.`
            : "Horario creado. No había entrenamientos que crear.",
        );
        // El botón se desactivó mientras se guardaba y el foco quedó suelto: vuelve al principio
        // del alta, lista para el horario siguiente.
        focusField(form.current, "weekday");
      },
    );
  }

  function onRemoved(count: number) {
    clear();
    setRemoved(
      count > 0
        ? `Horario quitado: ${practiceCount(count)} ${count === 1 ? "borrado" : "borrados"}.`
        : "Horario quitado. No tenía entrenamientos sin preparar.",
    );
  }

  // Quitado un horario, el foco va al encabezado del apartado: la fila que lo tenía ya no está.
  // En un efecto, y otra vez cuando la lista se repinta sin la fila: el diálogo, al cerrarse,
  // devuelve el foco a su botón «Quitar horario», que desaparece un momento después.
  useEffect(() => {
    if (removed) heading.current?.focus();
  }, [removed, schedules.length]);

  // Un `INVALID` sin campo es de la base: la temporada ya ha acabado o el equipo tiene el tope.
  const general =
    failure && failure.error === "INVALID" && Object.keys(failure.fieldErrors).length === 0
      ? "No se puede añadir este horario: la temporada del equipo ya ha acabado o tiene demasiados horarios."
      : null;

  return (
    <Card>
      <h2 ref={heading} tabIndex={-1} className={`${BLOCK_HEADING_CLASS} focus-visible:outline-hidden`}>
        Horario semanal
      </h2>
      {/* Siempre en el árbol de accesibilidad, también vacía: el margen anula su hueco. */}
      <p role="status" className="text-body-strong text-success empty:-mt-(--space-3)">
        {removed}
      </p>
      {schedules.length > 0 ? (
        <ul role="list" className="flex flex-col">
          {schedules.map((schedule) => (
            <ScheduleRow
              key={schedule.id}
              clubSlug={clubSlug}
              schedule={schedule}
              venues={venues}
              onRemoved={onRemoved}
            />
          ))}
        </ul>
      ) : (
        <p className="text-body text-ink-2">
          Aún no tiene horarios. Con uno, sus entrenamientos de la temporada se crean solos.
        </p>
      )}

      {closed ? (
        <p className="border-t border-line pt-(--space-3) text-body-s text-ink-2">
          La temporada de este equipo ya ha acabado: no se añaden horarios.
        </p>
      ) : (
        <div className="flex flex-col gap-(--space-3) border-t border-line pt-(--space-3)">
          <h3 id={headingId} className="text-body-strong">
            Añadir un horario
          </h3>
          {general ? <FormAlert message={general} /> : null}
          <EditorForm
            ref={form}
            mode="edit"
            headingId={headingId}
            submitLabel="Añadir horario"
            // El aviso general de arriba ya lo dice mejor que «Revisa los campos marcados».
            failure={general ? null : failure}
            confirmation={message}
            pending={pending}
            onSubmit={submit}
          >
            <SlotFields values={values} onChange={change} venues={venues} errors={failure?.fieldErrors ?? {}} />
          </EditorForm>
        </div>
      )}
    </Card>
  );
}
