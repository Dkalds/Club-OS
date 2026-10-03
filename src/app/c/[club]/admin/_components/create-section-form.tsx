"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ACTION_ERROR_COPY, fail, type ActionError, type ActionResult } from "@/lib/action-result";
import { createWaySection } from "@/modules/methodology/actions";
import { CONTENT_KIND_OPTIONS, type ContentKind } from "@/modules/methodology/types";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextField } from "@/ui/form-field";

type Failure = { error: ActionError; fieldErrors: Record<string, string> };

/**
 * Alta de una sección: el título y el tipo. Todo lo demás (su número, su orden y su slug) lo
 * decide `createWaySection`; la sección nace en borrador y al final de la lista. Al crearla se
 * abre su editor, donde se escribe el texto.
 *
 * `created` mantiene el botón desactivado desde que el alta sale bien hasta que la página
 * cambia: la navegación tarda, y un segundo toque en ese rato crearía otra sección.
 */
export function CreateSectionForm({ clubSlug }: { clubSlug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [contentKind, setContentKind] = useState<ContentKind>("text");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [created, setCreated] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    startTransition(async () => {
      let result: ActionResult<{ id: string }>;
      try {
        result = await createWaySection(clubSlug, { title, contentKind });
      } catch {
        // La red se cae a medias o el servidor no responde: la acción lanza en vez de devolver.
        result = fail("SAVE_FAILED");
      }
      // Tras un `await`, el estado se vuelve a envolver en la transición (ver `ItemControls`).
      startTransition(() => {
        if (result.ok) {
          setCreated(true);
          router.push(`/c/${clubSlug}/admin/way/${result.data.id}`);
        } else {
          setFailure({ error: result.error, fieldErrors: result.fieldErrors ?? {} });
        }
      });
    });
  }

  return (
    <Card>
      <h2 className="font-display text-title uppercase">Nueva sección</h2>
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-4)">
        {failure ? <FormAlert message={ACTION_ERROR_COPY[failure.error]} /> : null}
        <TextField
          label="Título"
          name="title"
          value={title}
          onChange={setTitle}
          maxLength={80}
          error={failure?.fieldErrors.title}
        />
        <SelectField
          label="Tipo"
          name="contentKind"
          value={contentKind}
          options={CONTENT_KIND_OPTIONS}
          onChange={setContentKind}
          error={failure?.fieldErrors.contentKind}
        />
        <CTAButton
          variant="primary"
          type="submit"
          block
          disabled={pending || created}
          className="lg:w-auto lg:self-start"
        >
          Crear sección
        </CTAButton>
      </form>
    </Card>
  );
}
