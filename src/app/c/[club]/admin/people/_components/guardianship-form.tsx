"use client";

import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { createGuardianship } from "@/modules/people/actions";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField } from "@/ui/form-field";

type PersonOption = { id: string; name: string };

export function CreateGuardianshipForm({ clubSlug, people }: { clubSlug: string; people: PersonOption[] }) {
  const { pending, failure, run } = useAction();
  // Dos personas distintas de entrada: la misma en los dos lados choca con el CHECK de la tabla.
  const [guardianPersonId, setGuardianPersonId] = useState(people[0]?.id ?? "");
  const [childPersonId, setChildPersonId] = useState(people[1]?.id ?? "");
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
          options={people.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(value) => (setGuardianPersonId(value), setDone(false))}
          error={failure?.fieldErrors.guardianPersonId}
        />
        <SelectField
          label="Persona tutelada"
          name="childPersonId"
          value={childPersonId}
          options={people.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(value) => (setChildPersonId(value), setDone(false))}
          error={failure?.fieldErrors.childPersonId}
        />
        <CTAButton variant="secondary" type="submit" disabled={pending} className="lg:w-auto lg:self-start">
          Dar la tutela
        </CTAButton>
      </form>
    </Card>
  );
}

