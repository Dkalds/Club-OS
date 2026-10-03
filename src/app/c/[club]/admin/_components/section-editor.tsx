"use client";

import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { updateWaySection } from "@/modules/methodology/actions";
import {
  CONTENT_KIND_OPTIONS,
  type ContentKind,
  type WaySection,
} from "@/modules/methodology/types";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextAreaField, TextField } from "@/ui/form-field";
import { CheckIcon } from "@/ui/icons";
import { MarkdownEditor } from "@/ui/markdown-editor";
import { useAction } from "./use-action";

/** Lo que enseña una sección que no es de texto y dónde se edita: su lista y su página. */
const LIST_PAGES = {
  values: { noun: "los valores", path: "values" },
  principles: { noun: "los principios", path: "principles" },
  standards: { noun: "los Standards", path: "standards" },
} as const satisfies Record<Exclude<ContentKind, "text">, { noun: string; path: string }>;

/**
 * El editor de una sección de The Way: título, resumen, tipo y texto en Markdown.
 *
 * Guarda con `updateWaySection`, que no deja pisar lo que otra persona guardó antes: se manda
 * el `updatedAt` de la copia que se está editando como `expectedUpdatedAt`. Es el que trajo la
 * página y, tras cada guardado, el que devolvió la acción. Siempre la cadena tal cual la dio
 * PostgREST (con microsegundos): ni se interpreta ni pasa por `Date`, porque la función de la
 * base de datos lo compara exacto. Gracias a eso, guardar dos veces seguidas funciona; y si
 * otra persona guardó entremedias llega `STALE_COPY`, el texto de la otra se queda en la base
 * de datos y aquí, lo escrito, hasta que se pulsa «Recargar».
 *
 * El estado del formulario sale de la sección una sola vez: al guardar, la página se repinta
 * con los datos nuevos (la acción revalida Gestión) y eso no debe pisar lo que se esté
 * escribiendo.
 */
export function SectionEditor({ clubSlug, section }: { clubSlug: string; section: WaySection }) {
  const { pending, failure, run } = useAction();
  const [title, setTitle] = useState(section.title);
  const [summary, setSummary] = useState(section.summary ?? "");
  const [contentKind, setContentKind] = useState<ContentKind>(section.contentKind);
  const [bodyMd, setBodyMd] = useState(section.bodyMd);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(section.updatedAt);
  const [saved, setSaved] = useState(false);

  /** Tocar cualquier campo deja sin efecto el «Cambios guardados.» del guardado anterior. */
  function edit<V>(setValue: (value: V) => void) {
    return (value: V) => {
      setValue(value);
      setSaved(false);
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    run(
      () =>
        updateWaySection(clubSlug, {
          id: section.id,
          expectedUpdatedAt,
          title,
          summary,
          contentKind,
          bodyMd,
        }),
      ({ updatedAt }) => {
        setExpectedUpdatedAt(updatedAt);
        setSaved(true);
      },
    );
  }

  const errors = failure?.fieldErrors ?? {};
  const list = contentKind === "text" ? null : LIST_PAGES[contentKind];

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-5)">
      {failure ? (
        <FormAlert message={ACTION_ERROR_COPY[failure.error]}>
          {failure.error === "STALE_COPY" ? (
            <CTAButton
              variant="secondary"
              className="self-start"
              onClick={() => location.reload()}
            >
              Recargar
            </CTAButton>
          ) : null}
        </FormAlert>
      ) : null}

      <TextField
        label="Título"
        name="title"
        value={title}
        onChange={edit(setTitle)}
        maxLength={80}
        error={errors.title}
      />
      <TextAreaField
        label="Resumen"
        name="summary"
        value={summary}
        onChange={edit(setSummary)}
        maxLength={200}
        rows={3}
        error={errors.summary}
      />
      <SelectField
        label="Tipo"
        name="contentKind"
        value={contentKind}
        options={CONTENT_KIND_OPTIONS}
        onChange={edit(setContentKind)}
        error={errors.contentKind}
      />
      {list ? (
        <div className="flex flex-col gap-(--space-1) rounded-md border border-line bg-surface-1 p-(--space-4)">
          <p className="text-body-strong">Esta sección muestra {list.noun} publicados.</p>
          <p className="text-ink-2">El texto de aquí aparece antes, como introducción.</p>
          <CTAButton
            variant="ghost"
            href={`/c/${clubSlug}/admin/${list.path}`}
            className="-ml-(--space-2) self-start"
          >
            Ir a {list.noun}
          </CTAButton>
        </div>
      ) : null}
      <MarkdownEditor
        label="Contenido"
        value={bodyMd}
        onChange={edit(setBodyMd)}
        maxLength={20000}
        error={errors.bodyMd}
      />

      {/*
        La región de estado está siempre en el árbol de accesibilidad, vacía hasta que se guarda: un
        lector de pantalla solo anuncia el texto que cambia dentro de una región que ya existía, y
        no la que aparece con su texto (por eso nunca `display: none` ni `sr-only` aparte). Vacía
        no ocupa nada: el margen negativo anula el hueco del `gap` del formulario.
      */}
      <div role="status" className="empty:-mt-(--space-5)">
        {saved ? (
          <p className="flex items-center gap-(--space-2) text-body-strong text-success">
            <CheckIcon size={16} />
            Cambios guardados.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-(--space-3) lg:flex-row">
        <CTAButton
          variant="primary"
          type="submit"
          block
          disabled={pending}
          className="lg:w-auto"
        >
          Guardar cambios
        </CTAButton>
        <CTAButton
          variant="secondary"
          href={`/c/${clubSlug}/admin/way`}
          block
          className="lg:w-auto"
        >
          Volver
        </CTAButton>
      </div>
    </form>
  );
}
