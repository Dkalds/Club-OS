"use client";

import { useId, useRef, useState } from "react";
import { useAction } from "@/lib/use-action";
import { createCategory, deleteCategory, updateCategory } from "@/modules/structure/actions";
import { ageBandLabel, ageOf } from "@/modules/structure/format";
import { AGE_MAX, NAME_MAX, SORT_MAX } from "@/modules/structure/schema";
import type { Category } from "@/modules/structure/types";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { TextField } from "@/ui/form-field";
import { EditorForm, focusField, NewItemCard, useConfirmation } from "./editor-shell";
import { BLOCK_HEADING_CLASS, toNumber } from "./structure-shared";

/**
 * Una categoría del club: su nombre («Alevín»), su edad («Sub 12», que se guarda como `U12`) y
 * su orden en las listas. Con `category` es la card de una que existe, que se puede borrar si
 * ningún equipo la lleva; sin ella, el alta, que propone el orden siguiente (`nextSort`).
 */
export function CategoryEditor({
  clubSlug,
  category,
  nextSort = 0,
}: {
  clubSlug: string;
  category?: Category;
  nextSort?: number;
}) {
  const { pending, failure, run } = useAction();
  const { message, confirm, clear, touch } = useConfirmation();
  const headingId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [name, setName] = useState(category?.name ?? "");
  const [age, setAge] = useState(category ? String(ageOf(category.ageBand) ?? "") : "");
  const [sort, setSort] = useState(String(category?.sort ?? nextSort));
  const [asking, setAsking] = useState(false);

  function submit() {
    clear();
    // Vacío no es cero: sin número, lo rechaza el esquema con su mensaje.
    const input = { name, age: toNumber(age) ?? Number.NaN, sort: toNumber(sort) ?? Number.NaN };
    if (category) {
      run(
        () => updateCategory(clubSlug, { id: category.id, ...input }),
        () => confirm("Cambios guardados."),
      );
      return;
    }
    run(
      () => createCategory(clubSlug, input),
      () => {
        setName("");
        setAge("");
        setSort(String(input.sort + 10));
        confirm("Categoría creada.");
        focusField(form.current, "name");
      },
    );
  }

  function remove() {
    if (!category) return;
    run(async () => {
      try {
        return await deleteCategory(clubSlug, { id: category.id });
      } finally {
        setAsking(false);
      }
    });
  }

  const errors = failure?.fieldErrors ?? {};
  const editor = (
    <EditorForm
      ref={form}
      mode={category ? "edit" : "create"}
      headingId={headingId}
      submitLabel={category ? "Guardar" : "Crear categoría"}
      failure={failure}
      confirmation={message}
      pending={pending}
      onSubmit={submit}
    >
      <TextField
        label="Nombre"
        name="name"
        value={name}
        onChange={touch(setName)}
        maxLength={NAME_MAX}
        error={errors.name}
      />
      <TextField
        label="Edad (sub)"
        name="age"
        type="number"
        min={1}
        max={AGE_MAX}
        value={age}
        onChange={touch(setAge)}
        hint="12 para una categoría sub 12."
        error={errors.age}
      />
      <TextField
        label="Orden"
        name="sort"
        type="number"
        min={0}
        max={SORT_MAX}
        value={sort}
        onChange={touch(setSort)}
        hint="Las categorías se listan de menor a mayor."
        error={errors.sort}
      />
    </EditorForm>
  );

  if (!category) {
    return (
      <NewItemCard headingId={headingId} title="Nueva categoría">
        {editor}
      </NewItemCard>
    );
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-(--space-3)">
        <h2 id={headingId} className={BLOCK_HEADING_CLASS}>
          {category.name}
        </h2>
        <p className="shrink-0 text-body-s text-ink-2">{ageBandLabel(category.ageBand)}</p>
      </div>
      {editor}
      <div className="border-t border-line pt-(--space-3)">
        {category.inUse ? (
          <p className="text-body-s text-ink-2">La lleva algún equipo: no se puede borrar.</p>
        ) : (
          <CTAButton
            variant="danger"
            disabled={pending}
            aria-describedby={headingId}
            onClick={() => setAsking(true)}
          >
            Borrar categoría
          </CTAButton>
        )}
      </div>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`¿Borrar la categoría ${category.name}?`}
        body="Ningún equipo la lleva. No se puede deshacer."
        confirmLabel="Borrar categoría"
        cancelLabel="Volver"
        tone="danger"
        pending={pending}
        onConfirm={remove}
      />
    </Card>
  );
}
