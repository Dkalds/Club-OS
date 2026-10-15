"use client";

import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { createInvitation } from "@/modules/invitations/actions";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextField } from "@/ui/form-field";

type Team = { id: string; name: string };

type InviteDraft = { email: string; role: "admin" | "coach"; teamId: string; staffRole: "head_coach" | "assistant" };

function InvitePersonForm({
  clubSlug,
  personId,
  teams,
  onLink,
  onClose,
}: {
  clubSlug: string;
  personId: string;
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
          personId,
          ...(draft.role === "coach" ? { teamId: draft.teamId, staffRole: draft.staffRole } : {}),
        }),
      ({ token }) => {
        onLink(token);
        onClose();
      },
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3)">
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


/**
 * Invitar a una persona que aún no tiene cuenta (cuenta creada al invitar): pide email y rol y
 * enseña el enlace para compartirlo.
 */
export function InvitePerson({ clubSlug, personId, teams }: { clubSlug: string; personId: string; teams: Team[] }) {
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${link}`).then(() => setCopied(true));
  }

  return (
    <section aria-label="Invitar" className="flex flex-col gap-(--space-3)">
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
      {inviting ? (
        <Card>
          <InvitePersonForm
            clubSlug={clubSlug}
            personId={personId}
            teams={teams}
            onLink={setLink}
            onClose={() => setInviting(false)}
          />
        </Card>
      ) : (
        <CTAButton variant="secondary" onClick={() => setInviting(true)} className="lg:w-auto lg:self-start">
          Invitar a la app
        </CTAButton>
      )}
    </section>
  );
}
