"use client";

import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { createInvitation } from "@/modules/invitations/actions";
import { archivePerson, createGuardianship, createPerson, updatePerson } from "@/modules/people/actions";
import type { AdminPerson } from "@/modules/people/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextField } from "@/ui/form-field";
import { EmptyState } from "@/ui/states";
import { ImportCsv } from "./_components/import-csv";

type Team = { id: string; name: string };

function personName(person: AdminPerson): string {
  return `${person.firstName} ${person.lastName}`;
}

function options(people: AdminPerson[]) {
  return people.map((person) => ({ value: person.id, label: personName(person) }));
}

// ── Invitar a quien no tiene cuenta ([D2]) ───────────────────────────────────────────

type InviteDraft = { email: string; role: "admin" | "coach"; teamId: string; staffRole: "head_coach" | "assistant" };

function InvitePersonForm({
  clubSlug,
  person,
  teams,
  onLink,
  onClose,
}: {
  clubSlug: string;
  person: AdminPerson;
  teams: Team[];
  onLink: (token: string) => void;
  onClose: () => void;
}) {
  const { pending, failure, run } = useAction();
  const [draft, setDraft] = useState<InviteDraft>({
    email: "",
    role: "coach",
    teamId: teams[0]?.id ?? "",
    staffRole: "assistant",
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () =>
        createInvitation(clubSlug, {
          email: draft.email,
          role: draft.role,
          personId: person.id,
          ...(draft.role === "coach" ? { teamId: draft.teamId, staffRole: draft.staffRole } : {}),
        }),
      ({ token }) => {
        onLink(token);
        onClose();
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3) px-(--space-4) pb-(--space-4)">
      {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
      <TextField
        label="Email"
        name="email"
        value={draft.email}
        onChange={(email) => setDraft((d) => ({ ...d, email }))}
        maxLength={254}
        error={failure?.fieldErrors.email}
      />
      <SelectField
        label="Rol"
        name="role"
        value={draft.role}
        options={[
          { value: "coach", label: "Entrenador" },
          { value: "admin", label: "Dirección" },
        ]}
        onChange={(role) => setDraft((d) => ({ ...d, role }))}
      />
      {draft.role === "coach" && (
        <>
          <SelectField
            label="Equipo"
            name="teamId"
            value={draft.teamId}
            options={teams.map((t) => ({ value: t.id, label: t.name }))}
            onChange={(teamId) => setDraft((d) => ({ ...d, teamId }))}
            error={failure?.fieldErrors.teamId}
          />
          <SelectField
            label="Qué hace en el equipo"
            name="staffRole"
            value={draft.staffRole}
            options={[
              { value: "head_coach", label: "Primer entrenador" },
              { value: "assistant", label: "Ayudante" },
            ]}
            onChange={(staffRole) => setDraft((d) => ({ ...d, staffRole }))}
          />
        </>
      )}
      <div className="flex gap-(--space-3)">
        <CTAButton variant="secondary" type="button" disabled={pending} onClick={onClose}>
          Cancelar
        </CTAButton>
        <CTAButton variant="primary" type="submit" disabled={pending}>
          Invitar
        </CTAButton>
      </div>
    </form>
  );
}

// ── Una persona ──────────────────────────────────────────────────────────────────────

type PersonDraft = { firstName: string; lastName: string; birthYear: string };

function draftOf(person: AdminPerson): PersonDraft {
  return { firstName: person.firstName, lastName: person.lastName, birthYear: person.birthYear?.toString() ?? "" };
}

function PersonRow({
  clubSlug,
  person,
  teams,
  onLink,
}: {
  clubSlug: string;
  person: AdminPerson;
  teams: Team[];
  onLink: (token: string) => void;
}) {
  const edit = useAction();
  const archive = useAction();
  const [editing, setEditing] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [draft, setDraft] = useState<PersonDraft>(draftOf(person));

  if (editing) {
    function submit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      edit.run(
        () =>
          updatePerson(clubSlug, {
            personId: person.id,
            firstName: draft.firstName,
            lastName: draft.lastName,
            birthYear: draft.birthYear === "" ? null : Number(draft.birthYear),
          }),
        () => setEditing(false),
      );
    }

    return (
      <li className="px-(--space-4) py-(--space-4)">
        <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3)">
          {edit.failure && <FormAlert message={ACTION_ERROR_COPY[edit.failure.error]} />}
          <TextField
            label="Nombre"
            name="firstName"
            value={draft.firstName}
            onChange={(firstName) => setDraft((d) => ({ ...d, firstName }))}
            maxLength={80}
            error={edit.failure?.fieldErrors.firstName}
          />
          <TextField
            label="Apellidos"
            name="lastName"
            value={draft.lastName}
            onChange={(lastName) => setDraft((d) => ({ ...d, lastName }))}
            maxLength={80}
            error={edit.failure?.fieldErrors.lastName}
          />
          <TextField
            label="Año de nacimiento"
            name="birthYear"
            type="number"
            value={draft.birthYear}
            onChange={(birthYear) => setDraft((d) => ({ ...d, birthYear }))}
            hint="Vacío para una persona adulta."
            error={edit.failure?.fieldErrors.birthYear}
          />
          <div className="flex gap-(--space-3)">
            <CTAButton variant="secondary" type="button" disabled={edit.pending} onClick={() => setEditing(false)}>
              Cancelar
            </CTAButton>
            <CTAButton variant="primary" type="submit" disabled={edit.pending}>
              Guardar
            </CTAButton>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-(--space-3) px-(--space-4) py-(--space-4)">
      <div className="flex items-center justify-between gap-(--space-3)">
        <div className="flex flex-col gap-(--space-1)">
          <p className="text-body-strong">{personName(person)}</p>
          <p className="text-body-s text-ink-3">
            {person.birthYear ?? "Sin año de nacimiento"}
            {person.archivedAt && " · Archivada"}
            {person.hasAccount && " · Con cuenta"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-(--space-2)">
          {!person.archivedAt && (
            <>
              <CTAButton variant="secondary" onClick={() => setEditing(true)}>
                Editar
              </CTAButton>
              {!person.hasAccount && (
                <CTAButton variant="secondary" onClick={() => setInviting((v) => !v)}>
                  Invitar
                </CTAButton>
              )}
              <CTAButton variant="danger" disabled={archive.pending} onClick={() => setConfirmingArchive(true)}>
                Archivar
              </CTAButton>
            </>
          )}
        </div>
      </div>
      {archive.failure && <FormAlert message={ACTION_ERROR_COPY[archive.failure.error]} />}
      {inviting && (
        <InvitePersonForm clubSlug={clubSlug} person={person} teams={teams} onLink={onLink} onClose={() => setInviting(false)} />
      )}
      <ConfirmDialog
        open={confirmingArchive}
        onOpenChange={setConfirmingArchive}
        title={`¿Archivar a ${personName(person)}?`}
        body="No se puede deshacer. Sus notas, objetivos y partidos siguen enteros."
        confirmLabel="Archivar persona"
        cancelLabel="Seguir"
        tone="danger"
        pending={archive.pending}
        onConfirm={() => archive.run(() => archivePerson(clubSlug, { personId: person.id }))}
      />
    </li>
  );
}

// ── Alta una a una ───────────────────────────────────────────────────────────────────

function CreatePersonForm({ clubSlug }: { clubSlug: string }) {
  const { pending, failure, run } = useAction();
  const [draft, setDraft] = useState({ firstName: "", lastName: "", birthYear: "" });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () =>
        createPerson(clubSlug, {
          firstName: draft.firstName,
          lastName: draft.lastName,
          birthYear: draft.birthYear === "" ? null : Number(draft.birthYear),
        }),
      () => setDraft({ firstName: "", lastName: "", birthYear: "" }),
    );
  }

  return (
    <Card>
      <h3 className="font-display text-body-strong uppercase">Nueva persona</h3>
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3)">
        {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
        <TextField
          label="Nombre"
          name="firstName"
          value={draft.firstName}
          onChange={(firstName) => setDraft((d) => ({ ...d, firstName }))}
          maxLength={80}
          error={failure?.fieldErrors.firstName}
        />
        <TextField
          label="Apellidos"
          name="lastName"
          value={draft.lastName}
          onChange={(lastName) => setDraft((d) => ({ ...d, lastName }))}
          maxLength={80}
          error={failure?.fieldErrors.lastName}
        />
        <TextField
          label="Año de nacimiento"
          name="birthYear"
          type="number"
          value={draft.birthYear}
          onChange={(birthYear) => setDraft((d) => ({ ...d, birthYear }))}
          hint="Vacío para una persona adulta."
          error={failure?.fieldErrors.birthYear}
        />
        <CTAButton variant="primary" type="submit" disabled={pending} className="lg:w-auto lg:self-start">
          Crear persona
        </CTAButton>
      </form>
    </Card>
  );
}

// ── Dar una tutela ───────────────────────────────────────────────────────────────────

function CreateGuardianshipForm({ clubSlug, people }: { clubSlug: string; people: AdminPerson[] }) {
  const { pending, failure, run } = useAction();
  const [guardianPersonId, setGuardianPersonId] = useState(people[0]?.id ?? "");
  const [childPersonId, setChildPersonId] = useState(people[0]?.id ?? "");
  const [done, setDone] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => createGuardianship(clubSlug, { guardianPersonId, childPersonId }), () => setDone(true));
  }

  return (
    <Card>
      <h3 className="font-display text-body-strong uppercase">Dar una tutela</h3>
      <p className="text-body-s text-ink-2">
        El tutor podrá decidir el consentimiento de imagen de esta persona.
      </p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3)">
        {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
        {done && <p className="text-body-s text-success">Tutela creada.</p>}
        <SelectField
          label="Tutor"
          name="guardianPersonId"
          value={guardianPersonId}
          options={options(people)}
          onChange={(value) => (setGuardianPersonId(value), setDone(false))}
          error={failure?.fieldErrors.guardianPersonId}
        />
        <SelectField
          label="Persona tutelada"
          name="childPersonId"
          value={childPersonId}
          options={options(people)}
          onChange={(value) => (setChildPersonId(value), setDone(false))}
          error={failure?.fieldErrors.childPersonId}
        />
        <CTAButton variant="primary" type="submit" disabled={pending} className="lg:w-auto lg:self-start">
          Dar la tutela
        </CTAButton>
      </form>
    </Card>
  );
}

// ── Pantalla ─────────────────────────────────────────────────────────────────────────

export function PeopleScreen({
  clubSlug,
  people,
  teams,
}: {
  clubSlug: string;
  people: AdminPerson[];
  teams: Team[];
}) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${link}`).then(() => setCopied(true));
  }

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Personas</h1>
        <p className="text-ink-2">Todas las personas de tu club. Ninguna se borra, solo se archiva.</p>
      </header>

      {link && (
        <Card variant="spotlight" className="gap-(--space-3)">
          <p className="text-body-strong">Comparte este enlace con la persona invitada.</p>
          <p className="text-body-s wrap-break-word">/invite/{link}</p>
          <div className="flex flex-wrap gap-(--space-3)">
            <CTAButton variant="on-spotlight" onClick={copy}>
              {copied ? "Copiado" : "Copiar enlace"}
            </CTAButton>
            <CTAButton variant="on-spotlight" onClick={() => (setLink(null), setCopied(false))}>
              Cerrar
            </CTAButton>
          </div>
        </Card>
      )}

      {people.length > 0 ? (
        <Card variant="flush">
          <ul className="divide-y divide-line">
            {people.map((person) => (
              <PersonRow key={person.id} clubSlug={clubSlug} person={person} teams={teams} onLink={setLink} />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState title="Aún no hay personas" body="Crea la primera, o impórtalas desde un CSV." />
      )}

      <CreatePersonForm clubSlug={clubSlug} />

      {people.length > 1 && <CreateGuardianshipForm clubSlug={clubSlug} people={people} />}

      <ImportCsv clubSlug={clubSlug} />
    </>
  );
}
