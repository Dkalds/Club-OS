"use client";

import { useId, useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { addStaff, removeStaff, setStaffRole } from "@/modules/structure/actions";
import { fullName, listName, STAFF_ROLE_OPTIONS } from "@/modules/structure/format";
import type { AdminStaffMember, StaffRole } from "@/modules/structure/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField } from "@/ui/form-field";
import { EditorForm, useConfirmation } from "./editor-shell";
import { PersonPicker, type PickablePerson } from "./person-picker";
import { BLOCK_HEADING_CLASS } from "./structure-shared";

const MISSING_PERSON = "Elige a una persona.";

/** Una persona del cuerpo técnico: su papel, que se cambia al elegir otro, y quitarla. */
function StaffRow({ clubSlug, teamId, member }: { clubSlug: string; teamId: string; member: AdminStaffMember }) {
  const { pending, failure, run } = useAction();
  const [role, setRole] = useState<StaffRole>(member.role);
  const [saved, setSaved] = useState(false);
  const [asking, setAsking] = useState(false);
  const seat = { teamId, personId: member.personId };

  // El papel se guarda al elegirlo, sin botón: por eso se dice que se ha guardado.
  function changeRole(next: StaffRole) {
    const before = role;
    setRole(next);
    setSaved(false);
    run(
      async () => {
        const result = await setStaffRole(clubSlug, { ...seat, role: next });
        // Si no se guardó, el selector vuelve a decir lo que hay.
        if (!result.ok) setRole(before);
        return result;
      },
      () => setSaved(true),
    );
  }

  function remove() {
    run(async () => {
      try {
        return await removeStaff(clubSlug, seat);
      } finally {
        setAsking(false);
      }
    });
  }

  return (
    <li className="flex flex-col gap-(--space-3) border-t border-line pt-(--space-3) first:border-t-0 first:pt-0">
      <p className="text-body-strong">{listName(member)}</p>
      {failure ? <FormAlert message={ACTION_ERROR_COPY[failure.error]} /> : null}
      <SelectField
        label={`Papel de ${fullName(member)}`}
        name="role"
        value={role}
        onChange={changeRole}
        options={STAFF_ROLE_OPTIONS}
      />
      {/* Vacía sigue en el árbol de accesibilidad: el margen anula su hueco (ver `EditorForm`). */}
      <p role="status" className="text-body-s text-success empty:-mt-(--space-3)">
        {saved ? "Papel guardado." : null}
      </p>
      <CTAButton
        variant="danger"
        className="self-start"
        disabled={pending}
        aria-label={`Quitar a ${fullName(member)} del cuerpo técnico`}
        onClick={() => setAsking(true)}
      >
        Quitar
      </CTAButton>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`¿Quitar a ${fullName(member)} del cuerpo técnico?`}
        body="Deja de ver este equipo. Sigue en el club."
        confirmLabel="Quitar"
        cancelLabel="Volver"
        tone="danger"
        pending={pending}
        onConfirm={remove}
      />
    </li>
  );
}

/**
 * El cuerpo técnico de un equipo: quién está y con qué papel, y añadir a una persona del club.
 * `people` son las personas sin archivar del club; aquí se quitan las que ya están.
 */
export function StaffSection({
  clubSlug,
  teamId,
  staff,
  people,
}: {
  clubSlug: string;
  teamId: string;
  staff: readonly AdminStaffMember[];
  people: readonly PickablePerson[];
}) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear } = useConfirmation();
  const headingId = useId();
  const [personId, setPersonId] = useState<string | null>(null);
  // Se ha intentado añadir sin elegir a nadie: se dice en el buscador, sin llamar a la acción.
  const [missing, setMissing] = useState(false);
  const [role, setRole] = useState<StaffRole>("head_coach");

  const taken = new Set(staff.map((member) => member.personId));
  const candidates = people.filter((person) => !taken.has(person.id));
  const errors = failure?.fieldErrors ?? {};

  function submit() {
    clear();
    if (!personId) {
      setMissing(true);
      return;
    }
    run(
      () => addStaff(clubSlug, { teamId, personId, role }),
      () => {
        setPersonId(null);
        confirm("Añadido al cuerpo técnico.");
      },
    );
  }

  return (
    <Card>
      <h2 className={BLOCK_HEADING_CLASS}>Cuerpo técnico</h2>
      {staff.length > 0 ? (
        <ul role="list" className="flex flex-col gap-(--space-3)">
          {staff.map((member) => (
            <StaffRow key={member.personId} clubSlug={clubSlug} teamId={teamId} member={member} />
          ))}
        </ul>
      ) : (
        <p className="text-body text-ink-2">Aún no hay nadie. Sin cuerpo técnico, nadie que entrene ve este equipo.</p>
      )}

      <div className="flex flex-col gap-(--space-3) border-t border-line pt-(--space-3)">
        <h3 id={headingId} className="text-body-strong">
          Añadir al cuerpo técnico
        </h3>
        <EditorForm
          mode="edit"
          headingId={headingId}
          submitLabel="Añadir"
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
            error={missing ? MISSING_PERSON : errors.personId}
          />
          <SelectField label="Papel" name="role" value={role} onChange={setRole} options={STAFF_ROLE_OPTIONS} />
        </EditorForm>
      </div>
    </Card>
  );
}
