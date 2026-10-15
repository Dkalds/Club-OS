"use client";

import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { cancelInvitation, createInvitation, resendInvitation } from "@/modules/invitations/actions";
import type { Invitation, InvitationStatus } from "@/modules/invitations/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextField } from "@/ui/form-field";
import { EmptyState } from "@/ui/states";

type Team = { id: string; name: string };

const ROLE_LABEL: Record<Invitation["role"], string> = { admin: "Dirección", coach: "Entrenador" };

const STATUS_LABEL: Record<InvitationStatus, string> = {
  pending: "Pendiente",
  expired: "Caducada",
  accepted: "Aceptada",
  cancelled: "Cancelada",
};

const STATUS_TONE: Record<InvitationStatus, string> = {
  pending: "bg-surface-2 text-ink-2",
  expired: "bg-danger-soft text-danger",
  accepted: "bg-success-soft text-success",
  cancelled: "bg-surface-2 text-ink-3",
};

function StatusPill({ status }: { status: InvitationStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-pill px-(--space-2) py-(--space-1) text-label whitespace-nowrap uppercase ${STATUS_TONE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** El enlace de una invitación nueva o reenviada, con un botón de copiar ([D15]). */
function InviteLink({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url).then(() => setCopied(true));
  }

  return (
    <Card variant="spotlight" className="gap-(--space-3)">
      <p className="text-body-strong">Comparte este enlace con la persona invitada.</p>
      <p className="text-body-s wrap-break-word">/invite/{token}</p>
      <div className="flex flex-wrap gap-(--space-3)">
        <CTAButton variant="on-spotlight" onClick={copy}>
          {copied ? "Copiado" : "Copiar enlace"}
        </CTAButton>
        <CTAButton variant="on-spotlight" onClick={onDismiss}>
          Cerrar
        </CTAButton>
      </div>
    </Card>
  );
}

type Draft = {
  email: string;
  role: "admin" | "coach";
  teamId: string;
  staffRole: "head_coach" | "assistant";
  firstName: string;
  lastName: string;
};

const EMPTY: Draft = {
  email: "",
  role: "coach",
  teamId: "",
  staffRole: "assistant",
  firstName: "",
  lastName: "",
};

function CreateInviteForm({
  clubSlug,
  teams,
  onCreated,
}: {
  clubSlug: string;
  teams: Team[];
  onCreated: (token: string) => void;
}) {
  const { pending, failure, run } = useAction();
  const [draft, setDraft] = useState<Draft>(EMPTY);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () =>
        createInvitation(clubSlug, {
          email: draft.email,
          role: draft.role,
          ...(draft.role === "coach"
            ? { teamId: draft.teamId, staffRole: draft.staffRole, firstName: draft.firstName, lastName: draft.lastName }
            : {}),
        }),
      ({ token }) => {
        setDraft(EMPTY);
        onCreated(token);
      },
    );
  }

  return (
    <Card>
      <h2 className="font-display text-title uppercase">Nueva invitación</h2>
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-4)">
        {failure ? <FormAlert message={ACTION_ERROR_COPY[failure.error]} /> : null}
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
              options={[{ value: "", label: "Elige un equipo" }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
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
              error={failure?.fieldErrors.staffRole}
            />
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
          </>
        )}
        <CTAButton variant="primary" type="submit" block disabled={pending} className="lg:w-auto lg:self-start">
          Invitar
        </CTAButton>
      </form>
    </Card>
  );
}

function InvitationRow({
  invitation,
  clubSlug,
  onLink,
}: {
  invitation: Invitation;
  clubSlug: string;
  onLink: (token: string) => void;
}) {
  const resend = useAction();
  const cancel = useAction();
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="flex flex-col gap-(--space-3) px-(--space-4) py-(--space-4) lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-(--space-1)">
        <p className="text-body-strong wrap-break-word">{invitation.email}</p>
        <p className="text-body-s text-ink-3">
          {ROLE_LABEL[invitation.role]}
          {invitation.teamName ? ` · ${invitation.teamName}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-(--space-2)">
        <StatusPill status={invitation.status} />
        {(invitation.status === "pending" || invitation.status === "expired") && (
          <>
            <CTAButton
              variant="secondary"
              disabled={resend.pending}
              onClick={() =>
                resend.run(() => resendInvitation(clubSlug, { invitationId: invitation.id }), ({ token }) =>
                  onLink(token),
                )
              }
            >
              Reenviar
            </CTAButton>
            <CTAButton variant="danger" disabled={cancel.pending} onClick={() => setConfirming(true)}>
              Cancelar
            </CTAButton>
          </>
        )}
      </div>
      {resend.failure && <FormAlert message={ACTION_ERROR_COPY[resend.failure.error]} />}
      {cancel.failure && <FormAlert message={ACTION_ERROR_COPY[cancel.failure.error]} />}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="¿Cancelar esta invitación?"
        body={`${invitation.email} no podrá entrar con este enlace. No se puede deshacer.`}
        confirmLabel="Cancelar invitación"
        cancelLabel="Seguir"
        tone="danger"
        pending={cancel.pending}
        onConfirm={() =>
          cancel.run(() => cancelInvitation(clubSlug, { invitationId: invitation.id }), () => setConfirming(false))
        }
      />
    </li>
  );
}

export function InvitesScreen({
  clubSlug,
  invitations,
  teams,
}: {
  clubSlug: string;
  invitations: Invitation[];
  teams: Team[];
}) {
  const [link, setLink] = useState<string | null>(null);

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Invitaciones</h1>
        <p className="text-ink-2">
          Invita a dirección o a un entrenador. El enlace se comparte a mano: no se envía ningún
          email.
        </p>
      </header>

      {link && <InviteLink token={link} onDismiss={() => setLink(null)} />}

      {invitations.length > 0 ? (
        <Card variant="flush">
          <ul className="divide-y divide-line">
            {invitations.map((invitation) => (
              <InvitationRow key={invitation.id} invitation={invitation} clubSlug={clubSlug} onLink={setLink} />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState title="Aún no hay invitaciones" body="Invita a la primera persona a este club." />
      )}

      <CreateInviteForm clubSlug={clubSlug} teams={teams} onCreated={setLink} />
    </>
  );
}
