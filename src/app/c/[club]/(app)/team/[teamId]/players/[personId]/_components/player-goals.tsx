"use client";

import { useState } from "react";
import { useAction } from "@/lib/use-action";
import { achieveGoal, archiveGoal, createGoal, updateGoal } from "@/modules/development/actions";
import { GOAL_DESCRIPTION_MAX, GOAL_TITLE_MAX, MAX_ACTIVE_GOALS } from "@/modules/development/limits";
import type { GoalFormOptions, PlayerGoal } from "@/modules/development/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextAreaField, TextField } from "@/ui/form-field";
import { GoalItem } from "@/ui/goal-item";
import { ChevronDownIcon, PlusIcon } from "@/ui/icons";
import { SectionHeader } from "@/ui/section-header";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { FormSheet } from "./form-sheet";

type Draft = { title: string; description: string; focusAreaId: string; standardId: string };

const EMPTY: Draft = { title: "", description: "", focusAreaId: "", standardId: "" };

function draftOf(goal: PlayerGoal): Draft {
  return {
    title: goal.title,
    description: goal.description ?? "",
    focusAreaId: goal.focus?.id ?? "",
    standardId: goal.standard?.id ?? "",
  };
}

const sameDraft = (a: Draft, b: Draft) =>
  a.title === b.title && a.description === b.description && a.focusAreaId === b.focusAreaId && a.standardId === b.standardId;

const ACTION_BUTTON =
  "min-h-(--target-min) rounded-md px-(--space-3) text-body-s font-semibold text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:text-ink-3";

/**
 * Los objetivos de un jugador en su ficha: los activos (como mucho tres, [D3]) y, plegado, el
 * historial con los logrados y los archivados. Quien gestiona el equipo (`canManage`) añade,
 * edita, marca como logrado y archiva; lograr y archivar no se deshacen y piden confirmación.
 */
export function PlayerGoals({
  clubSlug,
  teamId,
  personId,
  activeGoals,
  pastGoals,
  options,
  canManage,
}: {
  clubSlug: string;
  teamId: string;
  personId: string;
  activeGoals: PlayerGoal[];
  pastGoals: PlayerGoal[];
  options: GoalFormOptions;
  canManage: boolean;
}) {
  const form = useAction();
  const close = useAction();
  const [editing, setEditing] = useState<{ goal: PlayerGoal | null; initial: Draft } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [closing, setClosing] = useState<{ goal: PlayerGoal; to: "achieved" | "archived" } | null>(null);

  const full = activeGoals.length >= MAX_ACTIVE_GOALS;

  function openSheet(goal: PlayerGoal | null) {
    const initial = goal ? draftOf(goal) : EMPTY;
    setDraft(initial);
    setEditing({ goal, initial });
  }

  function save() {
    if (!editing) return;
    const done = () => setEditing(null);
    if (editing.goal) {
      const goalId = editing.goal.id;
      form.run(() => updateGoal(clubSlug, { goalId, ...draft }), done);
    } else {
      form.run(() => createGoal(clubSlug, { teamId, personId, ...draft }), done);
    }
  }

  function confirmClose() {
    if (!closing) return;
    const { goal, to } = closing;
    const call = to === "achieved" ? achieveGoal : archiveGoal;
    close.run(() => call(clubSlug, { goalId: goal.id }), () => setClosing(null));
  }

  const field = (name: keyof Draft) => form.failure?.fieldErrors[name];

  return (
    <section className="flex flex-col gap-(--space-3)">
      <SectionHeader title={`Objetivos · ${activeGoals.length} de ${MAX_ACTIVE_GOALS}`} />

      {close.failure ? <FormAlert message={ACTION_ERROR_COPY[close.failure.error]} /> : null}

      {activeGoals.length > 0 ? (
        <Card variant="flush" as="ul">
          {activeGoals.map((goal) => (
            <GoalItem
              key={goal.id}
              goal={goal}
              actions={
                canManage ? (
                  <>
                    <button type="button" className={ACTION_BUTTON} onClick={() => openSheet(goal)}>
                      Editar
                    </button>
                    <button type="button" className={ACTION_BUTTON} onClick={() => setClosing({ goal, to: "achieved" })}>
                      Logrado
                    </button>
                    <button type="button" className={ACTION_BUTTON} onClick={() => setClosing({ goal, to: "archived" })}>
                      Archivar
                    </button>
                  </>
                ) : null
              }
            />
          ))}
        </Card>
      ) : (
        <p className="text-body text-ink-2">Aún no tiene objetivos activos.</p>
      )}

      {canManage ? (
        <div className="flex flex-col gap-(--space-2)">
          <CTAButton variant="secondary" block icon={<PlusIcon size={20} />} disabled={full} onClick={() => openSheet(null)}>
            Añadir objetivo
          </CTAButton>
          {full ? <p className="text-body-s text-ink-3">{ACTION_ERROR_COPY.GOAL_LIMIT}</p> : null}
        </div>
      ) : null}

      {pastGoals.length > 0 ? (
        <details className="group flex flex-col gap-(--space-3)">
          <summary className="flex min-h-(--target-min) cursor-pointer list-none items-center gap-(--space-2) text-body-strong text-ink-2 [&::-webkit-details-marker]:hidden">
            <ChevronDownIcon size={16} className="-rotate-90 transition-transform group-open:rotate-0" />
            {`Historial · ${pastGoals.length}`}
          </summary>
          <Card variant="flush" as="ul">
            {pastGoals.map((goal) => (
              <GoalItem key={goal.id} goal={goal} />
            ))}
          </Card>
        </details>
      ) : null}

      <FormSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.goal ? "Editar objetivo" : "Nuevo objetivo"}
        dirty={editing !== null && !sameDraft(draft, editing.initial)}
        pending={form.pending}
        failure={form.failure}
        submitLabel="Guardar objetivo"
        onSubmit={save}
      >
        <TextField
          label="Objetivo"
          name="title"
          value={draft.title}
          onChange={(title) => setDraft({ ...draft, title })}
          maxLength={GOAL_TITLE_MAX}
          error={field("title")}
        />
        <TextAreaField
          label="Descripción"
          name="description"
          value={draft.description}
          onChange={(description) => setDraft({ ...draft, description })}
          maxLength={GOAL_DESCRIPTION_MAX}
          hint="Opcional. Cómo se verá que lo ha logrado."
          error={field("description")}
          rows={3}
        />
        <SelectField
          label="Foco"
          name="focusAreaId"
          value={draft.focusAreaId}
          options={[{ value: "", label: "Sin foco" }, ...options.focusAreas.map((f) => ({ value: f.id, label: f.name }))]}
          onChange={(focusAreaId) => setDraft({ ...draft, focusAreaId })}
          error={field("focusAreaId")}
        />
        <SelectField
          label="Standard"
          name="standardId"
          value={draft.standardId}
          options={[
            { value: "", label: "Sin Standard" },
            ...options.standards.map((s) => ({ value: s.id, label: `${String(s.number).padStart(2, "0")} · ${s.title}` })),
          ]}
          onChange={(standardId) => setDraft({ ...draft, standardId })}
          error={field("standardId")}
        />
      </FormSheet>

      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(next) => (next || close.pending ? undefined : setClosing(null))}
        title={closing?.to === "archived" ? "¿Archivar este objetivo?" : "¿Marcar como logrado?"}
        body={
          closing?.to === "archived"
            ? "Pasará al historial sin marcarlo como logrado. No se puede deshacer."
            : "Pasará al historial con la fecha de hoy. No se puede deshacer."
        }
        confirmLabel={closing?.to === "archived" ? "Archivar" : "Marcar como logrado"}
        cancelLabel="Cancelar"
        tone={closing?.to === "archived" ? "danger" : "default"}
        pending={close.pending}
        onConfirm={confirmClose}
      />
    </section>
  );
}
