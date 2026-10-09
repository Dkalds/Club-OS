"use client";

import { useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { createNote, deleteNote, updateNote } from "@/modules/development/actions";
import { NOTE_BODY_MAX } from "@/modules/development/limits";
import type { CoachNote, NoteVisibility } from "@/modules/development/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextAreaField } from "@/ui/form-field";
import { PlusIcon } from "@/ui/icons";
import { NoteItem } from "@/ui/note-item";
import { SectionHeader } from "@/ui/section-header";
import { FormSheet } from "./form-sheet";

type Draft = { body: string; visibility: NoteVisibility };

const EMPTY: Draft = { body: "", visibility: "private" };

const ACTION_BUTTON =
  "min-h-(--target-min) rounded-md px-(--space-3) text-body-s font-semibold text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

/**
 * Las notas que quien mira puede leer, de la más reciente a la más antigua. Una nueva nace
 * «Solo yo» ([D1]); solo su autor la edita o la borra, y borrarla es para siempre ([D4]).
 */
export function PlayerNotes({
  clubSlug,
  teamId,
  personId,
  notes,
  canWrite,
}: {
  clubSlug: string;
  teamId: string;
  personId: string;
  notes: CoachNote[];
  canWrite: boolean;
}) {
  const form = useAction();
  const removal = useAction();
  const [editing, setEditing] = useState<{ note: CoachNote | null; initial: Draft } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [deleting, setDeleting] = useState<CoachNote | null>(null);

  function openSheet(note: CoachNote | null) {
    const initial = note ? { body: note.body, visibility: note.visibility } : EMPTY;
    setDraft(initial);
    setEditing({ note, initial });
  }

  function save() {
    if (!editing) return;
    const done = () => setEditing(null);
    if (editing.note) {
      const noteId = editing.note.id;
      form.run(() => updateNote(clubSlug, { noteId, ...draft }), done);
    } else {
      form.run(() => createNote(clubSlug, { teamId, personId, ...draft }), done);
    }
  }

  return (
    <section className="flex flex-col gap-(--space-3)">
      <SectionHeader title="Notas" />

      {removal.failure ? <FormAlert message={ACTION_ERROR_COPY[removal.failure.error]} /> : null}

      {notes.length > 0 ? (
        <Card variant="flush" as="ul">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              actions={
                note.isMine ? (
                  <>
                    <button type="button" className={ACTION_BUTTON} onClick={() => openSheet(note)}>
                      Editar
                    </button>
                    <button type="button" className={ACTION_BUTTON} onClick={() => setDeleting(note)}>
                      Borrar
                    </button>
                  </>
                ) : null
              }
            />
          ))}
        </Card>
      ) : (
        <p className="text-body text-ink-2">Aún no hay notas.</p>
      )}

      {canWrite ? (
        <CTAButton variant="secondary" block icon={<PlusIcon size={20} />} onClick={() => openSheet(null)}>
          Añadir nota
        </CTAButton>
      ) : null}

      <FormSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.note ? "Editar nota" : "Nueva nota"}
        dirty={editing !== null && (draft.body !== editing.initial.body || draft.visibility !== editing.initial.visibility)}
        pending={form.pending}
        failure={form.failure}
        submitLabel="Guardar nota"
        onSubmit={save}
      >
        <TextAreaField
          label="Nota"
          name="body"
          value={draft.body}
          onChange={(body) => setDraft({ ...draft, body })}
          maxLength={NOTE_BODY_MAX}
          error={form.failure?.fieldErrors.body}
          rows={6}
        />
        <SelectField<NoteVisibility>
          label="Quién la lee"
          name="visibility"
          value={draft.visibility}
          options={[
            { value: "private", label: "Solo yo" },
            { value: "staff", label: "Cuerpo técnico y dirección" },
          ]}
          onChange={(visibility) => setDraft({ ...draft, visibility })}
          error={form.failure?.fieldErrors.visibility}
        />
      </FormSheet>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => (next || removal.pending ? undefined : setDeleting(null))}
        title="¿Borrar esta nota?"
        body="Se borrará para siempre."
        confirmLabel="Borrar"
        cancelLabel="Cancelar"
        tone="danger"
        pending={removal.pending}
        onConfirm={() => {
          if (!deleting) return;
          const noteId = deleting.id;
          removal.run(() => deleteNote(clubSlug, { noteId }), () => setDeleting(null));
        }}
      />
    </section>
  );
}
