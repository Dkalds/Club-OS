"use client";

import { useId, useRef, useState } from "react";
import { useAction } from "@/lib/use-action";
import { addNewPlayer, addPlayer, removePlayer, updatePlayer } from "@/modules/structure/actions";
import { fullName, listName } from "@/modules/structure/format";
import { BIRTH_YEAR_MIN, JERSEY_MAX, NAME_MAX, POSITION_MAX } from "@/modules/structure/schema";
import type { AdminPlayer } from "@/modules/structure/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { TextField } from "@/ui/form-field";
import { ChevronDownIcon } from "@/ui/icons";
import { EditorForm, focusField, useConfirmation } from "./editor-shell";
import { PersonPicker, type PickablePerson } from "./person-picker";
import { BLOCK_HEADING_CLASS, toNumber } from "./structure-shared";

/** El dorsal y la posición: los dos campos que comparten las tres formas de la plantilla. */
function SeatFields({
  jersey,
  position,
  onJersey,
  onPosition,
  errors,
}: {
  jersey: string;
  position: string;
  onJersey: (value: string) => void;
  onPosition: (value: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <TextField
        label="Dorsal (opcional)"
        name="jerseyNumber"
        type="number"
        min={0}
        max={JERSEY_MAX}
        value={jersey}
        onChange={onJersey}
        error={errors.jerseyNumber}
      />
      <TextField
        label="Posición (opcional)"
        name="position"
        value={position}
        onChange={onPosition}
        maxLength={POSITION_MAX}
        error={errors.position}
      />
    </>
  );
}

/**
 * Alguien de la plantilla. Plegado, una fila con su dorsal, su nombre y su posición: una
 * plantilla de quince cabe en la pantalla. Desplegado, su dorsal y su posición, que se guardan,
 * y quitarle del equipo.
 */
function PlayerRow({ clubSlug, teamId, player }: { clubSlug: string; teamId: string; player: AdminPlayer }) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const [jersey, setJersey] = useState(player.jerseyNumber === null ? "" : String(player.jerseyNumber));
  const [position, setPosition] = useState(player.position ?? "");
  const [asking, setAsking] = useState(false);
  const seat = { teamId, personId: player.personId };
  // Lo que distingue a dos personas con el mismo nombre: su posición y su año de nacimiento.
  const details = [player.position, player.birthYear].filter(Boolean).join(" · ");

  function submit() {
    clear();
    run(
      () => updatePlayer(clubSlug, { ...seat, jerseyNumber: toNumber(jersey), position }),
      () => confirm("Cambios guardados."),
    );
  }

  function remove() {
    run(async () => {
      try {
        return await removePlayer(clubSlug, seat);
      } finally {
        setAsking(false);
      }
    });
  }

  return (
    <li className="border-t border-line first:border-t-0">
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-(--space-3) py-(--space-2) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring [&::-webkit-details-marker]:hidden">
          <span className="w-8 shrink-0 text-center font-display text-title text-brand-accent tabular-nums">
            {player.jerseyNumber ?? "–"}
          </span>
          <span className="min-w-0 flex-1">
            <span id={headingId} className="block truncate text-body-strong">
              {listName(player)}
            </span>
            {details ? <span className="block truncate text-body-s text-ink-2">{details}</span> : null}
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
        <SeatFields
          jersey={jersey}
          position={position}
          onJersey={touch(setJersey)}
          onPosition={touch(setPosition)}
          errors={failure?.fieldErrors ?? {}}
        />
      </EditorForm>
      <CTAButton
        variant="danger"
        className="self-start"
        disabled={pending}
        aria-label={`Quitar a ${fullName(player)} de la plantilla`}
        onClick={() => setAsking(true)}
      >
        Quitar
      </CTAButton>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`¿Quitar a ${fullName(player)} de la plantilla?`}
        body="Sale de este equipo. Sigue en el club, con sus objetivos y sus notas."
        confirmLabel="Quitar"
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

/** Añadir a la plantilla a una persona que ya está en el club. */
function AddExisting({ clubSlug, teamId, candidates }: { clubSlug: string; teamId: string; candidates: readonly PickablePerson[] }) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const [personId, setPersonId] = useState<string | null>(null);
  // Se ha intentado añadir sin elegir a nadie: se dice en el buscador, sin llamar a la acción.
  const [missing, setMissing] = useState(false);
  const [jersey, setJersey] = useState("");
  const [position, setPosition] = useState("");
  const errors = failure?.fieldErrors ?? {};

  function submit() {
    clear();
    if (!personId) {
      setMissing(true);
      return;
    }
    run(
      () => addPlayer(clubSlug, { teamId, personId, jerseyNumber: toNumber(jersey), position }),
      () => {
        setPersonId(null);
        setJersey("");
        setPosition("");
        confirm("Añadido a la plantilla.");
      },
    );
  }

  return (
    <div className="flex flex-col gap-(--space-3) border-t border-line pt-(--space-3)">
      <h3 id={headingId} className="text-body-strong">
        Añadir a alguien del club
      </h3>
      <EditorForm
        mode="edit"
        headingId={headingId}
        submitLabel="Añadir a la plantilla"
        failure={failure}
        confirmation={message}
        pending={pending}
        onSubmit={submit}
      >
        <PersonPicker
          label="Persona"
          people={candidates}
          value={personId}
          onChange={(next) => {
            clear();
            setMissing(false);
            setPersonId(next);
          }}
          error={missing ? "Elige a una persona." : errors.personId}
        />
        <SeatFields
          jersey={jersey}
          position={position}
          onJersey={touch(setJersey)}
          onPosition={touch(setPosition)}
          errors={errors}
        />
      </EditorForm>
    </div>
  );
}

/** Dar de alta a alguien nuevo y ponerle en la plantilla, de una vez. De un menor, solo el año. */
function AddNew({ clubSlug, teamId }: { clubSlug: string; teamId: string }) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [jersey, setJersey] = useState("");
  const [position, setPosition] = useState("");
  const errors = failure?.fieldErrors ?? {};

  function submit() {
    clear();
    run(
      () =>
        addNewPlayer(clubSlug, {
          teamId,
          firstName,
          lastName,
          birthYear: toNumber(birthYear),
          jerseyNumber: toNumber(jersey),
          position,
        }),
      () => {
        setFirstName("");
        setLastName("");
        setBirthYear("");
        setJersey("");
        setPosition("");
        confirm("Dado de alta y añadido a la plantilla.");
        focusField(form.current, "firstName");
      },
    );
  }

  return (
    <div className="flex flex-col gap-(--space-3) border-t border-line pt-(--space-3)">
      <h3 id={headingId} className="text-body-strong">
        Dar de alta a alguien nuevo
      </h3>
      <EditorForm
        ref={form}
        mode="edit"
        headingId={headingId}
        submitLabel="Dar de alta y añadir"
        failure={failure}
        confirmation={message}
        pending={pending}
        onSubmit={submit}
      >
        <TextField
          label="Nombre"
          name="firstName"
          value={firstName}
          onChange={touch(setFirstName)}
          maxLength={NAME_MAX}
          error={errors.firstName}
        />
        <TextField
          label="Apellidos"
          name="lastName"
          value={lastName}
          onChange={touch(setLastName)}
          maxLength={NAME_MAX}
          error={errors.lastName}
        />
        <TextField
          label="Año de nacimiento (opcional)"
          name="birthYear"
          type="number"
          min={BIRTH_YEAR_MIN}
          value={birthYear}
          onChange={touch(setBirthYear)}
          hint="Solo el año, nunca la fecha completa."
          error={errors.birthYear}
        />
        <SeatFields
          jersey={jersey}
          position={position}
          onJersey={touch(setJersey)}
          onPosition={touch(setPosition)}
          errors={errors}
        />
      </EditorForm>
    </div>
  );
}

/**
 * La plantilla de un equipo: quién está, con su dorsal y su posición, y dos formas de añadir: a
 * una persona que ya está en el club o a alguien nuevo, que se da de alta ahí mismo. `people`
 * son las personas sin archivar del club; aquí se quitan las que ya están en la plantilla.
 */
export function RosterSection({
  clubSlug,
  teamId,
  players,
  people,
}: {
  clubSlug: string;
  teamId: string;
  players: readonly AdminPlayer[];
  people: readonly PickablePerson[];
}) {
  const taken = new Set(players.map((player) => player.personId));
  const candidates = people.filter((person) => !taken.has(person.id));

  return (
    <Card>
      <h2 className={BLOCK_HEADING_CLASS}>Plantilla</h2>
      {players.length > 0 ? (
        <ul role="list" className="flex flex-col">
          {players.map((player) => (
            <PlayerRow key={player.personId} clubSlug={clubSlug} teamId={teamId} player={player} />
          ))}
        </ul>
      ) : (
        <p className="text-body text-ink-2">Aún no hay nadie en la plantilla.</p>
      )}
      <AddExisting clubSlug={clubSlug} teamId={teamId} candidates={candidates} />
      <AddNew clubSlug={clubSlug} teamId={teamId} />
    </Card>
  );
}
