"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { createWaySection } from "@/modules/methodology/actions";
import { CONTENT_KIND_OPTIONS, type ContentKind } from "@/modules/methodology/types";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextField } from "@/ui/form-field";

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
  const { pending, failure, run } = useAction();
  const [title, setTitle] = useState("");
  const [contentKind, setContentKind] = useState<ContentKind>("text");
  const [created, setCreated] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () => createWaySection(clubSlug, { title, contentKind }),
      ({ id }) => {
        setCreated(true);
        router.push(`/c/${clubSlug}/admin/way/${id}`);
      },
    );
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
