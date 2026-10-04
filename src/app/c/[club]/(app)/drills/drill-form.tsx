"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type MouseEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { UNSAVED_CHANGES, warnBeforeUnload } from "@/lib/unsaved-changes";
import { useAction } from "@/lib/use-action";
import { createDrill, updateDrill } from "@/modules/drills/actions";
import type { DrillDetail, FocusArea } from "@/modules/drills/types";
import { formatStandardNumber } from "@/modules/methodology/format";
import type { GamePrinciple, Standard } from "@/modules/methodology/types";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextAreaField, TextField, FIELD_LABEL_CLASS } from "@/ui/form-field";
import { Chip } from "@/ui/filter";
import { ChipGroup } from "./chip-group";
import { DiagramField } from "./diagram-field";
import {
  AGE_CHOICES,
  hasFieldError,
  hasUnsavedChanges,
  initialFormState,
  toDrillInput,
  toggleId,
  type DrillFormState,
  type PointRow,
  type VariantRow,
} from "./drill-form-state";
import { OrderedList } from "./ordered-list";

/** Los topes de las listas: los mismos que aplica el esquema de las acciones. */
const MAX_POINTS = 8;
const MAX_VARIANTS = 5;

/** Las opciones de los selectores de edad. «Sin máximo» y «Elige edad» son el valor vacío. */
const AGE_OPTIONS = AGE_CHOICES.map((age) => ({ value: String(age), label: `U${age}` }));
const MIN_AGE_OPTIONS = [{ value: "", label: "Elige edad" }, ...AGE_OPTIONS];
const MAX_AGE_OPTIONS = [{ value: "", label: "Sin máximo" }, ...AGE_OPTIONS];

type Props = {
  clubSlug: string;
  /** `new` crea un borrador; `edit` guarda cambios en `drill`. */
  mode: "new" | "edit";
  /** El ejercicio que se edita, o `null` en el alta. */
  drill: DrillDetail | null;
  /** Lo que se puede elegir: los objetivos del club y lo que tiene publicado. */
  options: { focusAreas: FocusArea[]; principles: GamePrinciple[]; standards: Standard[] };
  /** El nombre que el club da a sus Standards (su terminología). */
  standardsLabel: string;
};

/**
 * El primer control del formulario, en el orden de la pantalla, cuyo error está en `errors`. Los
 * campos se identifican por `name` y los grupos (chips, listas) por `data-field`, con la misma
 * clave con la que el servidor señala el error. Un grupo no es enfocable: se enfoca su primer
 * control.
 */
function firstFieldWithError(form: HTMLFormElement | null, errors: Record<string, string>): HTMLElement | null {
  if (form === null) return null;

  for (const element of form.querySelectorAll<HTMLElement>("[name], [data-field]")) {
    const key = element.dataset.field ?? element.getAttribute("name");
    if (key === null || !Object.hasOwn(errors, key)) continue;

    return element.matches("input, select, textarea, button")
      ? element
      : element.querySelector<HTMLElement>("input, select, textarea, button:not(:disabled)");
  }
  return null;
}

/**
 * El formulario de un ejercicio, para crearlo (`new`) o para editarlo (`edit`): título, resumen,
 * objetivo, organización, jugadores, duración, edades, objetivos de trabajo, principios y
 * Standards (la regla «qué/por qué»), coaching points, variantes, material, vídeo y, solo al
 * editar, el diagrama.
 *
 * Guarda con `createDrill` o `updateDrill` y, si sale bien, lleva a la ficha. Qué se manda y
 * cómo se limpia está en `drill-form-state.ts`; aquí está lo que pasa en pantalla:
 *
 * - **Qué se manda** sale del estado del formulario, que parte del ejercicio una sola vez: al
 *   guardar, la ficha se repinta con datos nuevos y eso no debe pisar lo que se esté escribiendo.
 *   Quien edita manda la copia que cargó (`expectedUpdatedAt`, el texto tal cual, sin `Date`); si
 *   otra persona guardó entremedias llega `STALE_COPY`. Esa copia se guarda en estado al montar,
 *   igual que el contenido: si la ruta se repinta bajo el formulario con una copia más nueva, un
 *   token leído de la propiedad viva acompañaría a un contenido viejo y `save_drill` lo daría por
 *   bueno, sin avisar de que pisa lo de la otra persona.
 * - **Sin guardar no se pierde nada en silencio.** Mientras el formulario difiera de la última
 *   copia guardada (`dirty`: la que se abrió o, tras cada guardado, lo que se mandó), cerrar o
 *   recargar la pestaña pide confirmación (`beforeunload`) y «Cancelar» pregunta antes de salir.
 *   «Recargar», tras una copia obsoleta, no pregunta: quien pulsa ya ha decidido tirar lo suyo.
 *   El «Volver» de la cabecera y la navegación inferior no se interceptan: App Router no tiene
 *   gancho para bloquearlas (lo resolverá `ConfirmDialog`).
 * - **Si falla** no se pierde nada de lo escrito. `INVALID` señala cada campo y, a las listas, en
 *   la lista entera, y lleva el foco al primer campo con error (el aviso general se anuncia sin
 *   quitárselo). `SAVE_FAILED`, `STALE_COPY` y el resto enseñan el texto común en un aviso que sí
 *   se lleva el foco: no hay campo al que ir. La llamada que se cae es un `SAVE_FAILED`.
 * - **Esperas.** Mientras guarda, mientras navega a la ficha y mientras sube un diagrama, no se
 *   puede guardar otra vez (un segundo toque no crea otro ejercicio) y, mientras guarda, el
 *   diagrama no se toca.
 *
 * Aviso a quien quiera cambiar el orden de los campos: `firstFieldWithError` lleva el foco al
 * primero de la pantalla, así que el orden de las claves de error no importa.
 */
export function DrillForm({ clubSlug, mode, drill, options, standardsLabel }: Props) {
  const router = useRouter();
  const save = useAction();
  const upload = useAction();
  // La acción ha terminado, pero la ficha aún no ha llegado: el botón sigue esperando.
  const [navigating, startNavigation] = useTransition();
  // El ejercicio tal como se abrió. De aquí salen el token de concurrencia y todo lo que se
  // sabe de él al guardar; la propiedad viva solo cuenta al montar.
  const [loaded] = useState(drill);
  // La última copia guardada: contra ella se mide si hay cambios sin guardar.
  const [baseline, setBaseline] = useState<DrillFormState>(() => initialFormState(loaded));
  const [state, setState] = useState<DrillFormState>(baseline);
  const form = useRef<HTMLFormElement>(null);

  const editing = mode === "edit" && loaded !== null;
  const dirty = hasUnsavedChanges(state, baseline);
  const busy = save.pending || navigating || upload.pending;
  const failure = save.failure;
  const errors = failure?.fieldErrors ?? {};
  // `INVALID` con algo que señalar: el foco va al campo, no al aviso.
  const pointsAtField = failure?.error === "INVALID" && hasFieldError(errors);

  useEffect(() => {
    if (!failure || failure.error !== "INVALID") return;
    firstFieldWithError(form.current, failure.fieldErrors)?.focus();
  }, [failure]);

  useEffect(() => {
    if (!dirty) return;
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function set<K extends keyof DrillFormState>(key: K) {
    return (value: DrillFormState[K]) => setState((current) => ({ ...current, [key]: value }));
  }

  function toggle(key: "focusAreaIds" | "principleIds" | "standardIds", id: string) {
    setState((current) => ({ ...current, [key]: toggleId(current[key], id) }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    // Lo que se manda es lo que queda guardado: si se escribe mientras guarda, eso sigue sin guardar.
    const sent = state;
    const input = toDrillInput(sent, loaded);
    const goToDrill = (id: string) => {
      setBaseline(sent);
      startNavigation(() => router.push(`/c/${clubSlug}/drills/${id}`));
    };

    if (editing) {
      save.run(
        () => updateDrill(clubSlug, { drillId: loaded.id, expectedUpdatedAt: loaded.updatedAt, drill: input }),
        () => goToDrill(loaded.id),
      );
    } else {
      save.run(() => createDrill(clubSlug, input), ({ id }) => goToDrill(id));
    }
  }

  function cancel(event: MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm(UNSAVED_CHANGES)) event.preventDefault();
  }

  function reload() {
    // Se quita el aviso a mano: si no, el navegador preguntaría justo al hacer lo que se pidió.
    window.removeEventListener("beforeunload", warnBeforeUnload);
    location.reload();
  }

  const base = `/c/${clubSlug}/drills`;

  return (
    <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-(--space-5)">
      {failure ? (
        <FormAlert message={ACTION_ERROR_COPY[failure.error]} focus={!pointsAtField}>
          {failure.error === "STALE_COPY" ? (
            <CTAButton variant="secondary" className="self-start" onClick={reload}>
              Recargar
            </CTAButton>
          ) : null}
        </FormAlert>
      ) : null}

      <TextField
        label="Título"
        name="title"
        value={state.title}
        onChange={set("title")}
        maxLength={80}
        error={errors.title}
      />
      <TextAreaField
        label="Resumen"
        name="summary"
        value={state.summary}
        onChange={set("summary")}
        maxLength={200}
        rows={2}
        error={errors.summary}
      />
      <TextAreaField
        label="Objetivo"
        name="objective"
        value={state.objective}
        onChange={set("objective")}
        maxLength={500}
        rows={3}
        error={errors.objective}
      />
      <TextAreaField
        label="Organización"
        name="setupMd"
        value={state.setupMd}
        onChange={set("setupMd")}
        maxLength={5000}
        rows={6}
        hint="Admite negritas, cursivas y listas."
        error={errors.setupMd}
      />

      <RangeFields
        legend="Jugadores"
        min={{ name: "minPlayers", value: state.minPlayers, onChange: set("minPlayers"), error: errors.minPlayers }}
        max={{ name: "maxPlayers", value: state.maxPlayers, onChange: set("maxPlayers"), error: errors.maxPlayers }}
        limits={[1, 40]}
      />
      <RangeFields
        legend="Duración (min)"
        min={{ name: "minMinutes", value: state.minMinutes, onChange: set("minMinutes"), error: errors.minMinutes }}
        max={{ name: "maxMinutes", value: state.maxMinutes, onChange: set("maxMinutes"), error: errors.maxMinutes }}
        limits={[1, 120]}
      />

      <div className="grid grid-cols-2 gap-(--space-3)">
        <SelectField
          label="Edad mínima"
          name="minAge"
          value={state.minAge}
          options={MIN_AGE_OPTIONS}
          onChange={set("minAge")}
          error={errors.minAge}
        />
        <SelectField
          label="Edad máxima"
          name="maxAge"
          value={state.maxAge}
          options={MAX_AGE_OPTIONS}
          onChange={set("maxAge")}
          error={errors.maxAge}
        />
      </div>

      <ChipGroup
        name="focusAreaIds"
        legend="Objetivos"
        options={options.focusAreas.map((area) => ({ id: area.id, label: area.name }))}
        selected={state.focusAreaIds}
        onToggle={(id) => toggle("focusAreaIds", id)}
        error={errors.focusAreaIds}
        empty="El club aún no tiene objetivos de trabajo."
      />
      {options.principles.length > 0 ? (
        <ChipGroup
          name="principleIds"
          legend="Principios"
          options={options.principles.map((principle) => ({ id: principle.id, label: principle.title }))}
          selected={state.principleIds}
          onToggle={(id) => toggle("principleIds", id)}
          error={errors.principleIds}
        />
      ) : null}
      {options.standards.length > 0 ? (
        <ChipGroup
          name="standardIds"
          legend={standardsLabel}
          options={options.standards.map((standard) => ({
            id: standard.id,
            label: `${formatStandardNumber(standard.number)} ${standard.title}`,
          }))}
          selected={state.standardIds}
          onToggle={(id) => toggle("standardIds", id)}
          error={errors.standardIds}
        />
      ) : null}

      <CoachingPointsField
        rows={state.coachingPoints}
        onRows={(update) => setState((current) => ({ ...current, coachingPoints: update(current.coachingPoints) }))}
        error={errors.coachingPoints}
      />
      <VariantsField
        rows={state.variants}
        onRows={(update) => setState((current) => ({ ...current, variants: update(current.variants) }))}
        error={errors.variants}
      />

      <TextField
        label="Material"
        name="equipment"
        value={state.equipment}
        onChange={set("equipment")}
        maxLength={500}
        hint="Separa con comas."
        error={errors.equipment}
      />
      <TextField
        label="Vídeo (YouTube o Vimeo)"
        name="videoUrl"
        value={state.videoUrl}
        onChange={set("videoUrl")}
        maxLength={300}
        error={errors.videoUrl}
      />

      {editing ? (
        <DiagramField
          clubSlug={clubSlug}
          drillId={loaded.id}
          mediaId={state.diagramMediaId}
          initialPreviewUrl={loaded.diagramUrl}
          upload={upload}
          disabled={save.pending || navigating}
          onMediaChange={set("diagramMediaId")}
        />
      ) : (
        <p className="text-body-s text-ink-3">Guarda el borrador para añadir un diagrama.</p>
      )}

      <div className="flex flex-col gap-(--space-3) lg:flex-row">
        <CTAButton variant="primary" type="submit" block disabled={busy} className="lg:w-auto">
          {editing ? "Guardar cambios" : "Guardar borrador"}
        </CTAButton>
        <CTAButton
          variant="secondary"
          href={editing ? `${base}/${loaded.id}` : base}
          block
          className="lg:w-auto"
          onClick={cancel}
        >
          Cancelar
        </CTAButton>
      </div>
    </form>
  );
}

/**
 * Un mínimo y un máximo en un grupo («Jugadores», «Duración (min)»), lado a lado. Son números
 * que se teclean: el texto sube tal cual y se convierte al enviar (ver `parseNumber`).
 */
function RangeFields({
  legend,
  min,
  max,
  limits,
}: {
  legend: string;
  min: { name: string; value: string; onChange: (value: string) => void; error?: string };
  max: { name: string; value: string; onChange: (value: string) => void; error?: string };
  limits: [lowest: number, highest: number];
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-(--space-2)">
      <legend className={`${FIELD_LABEL_CLASS} mb-(--space-2)`}>{legend}</legend>
      <div className="grid grid-cols-2 gap-(--space-3)">
        {[
          { label: "Mín.", ...min },
          { label: "Máx.", ...max },
        ].map((field) => (
          <TextField
            key={field.name}
            label={field.label}
            name={field.name}
            type="number"
            value={field.value}
            onChange={field.onChange}
            min={limits[0]}
            max={limits[1]}
            error={field.error}
          />
        ))}
      </div>
    </fieldset>
  );
}

/** Los coaching points: un texto y, si es clave, la marca que el Live Mode enseña al entrenador. */
function CoachingPointsField({
  rows,
  onRows,
  error,
}: {
  rows: PointRow[];
  onRows: (update: (current: PointRow[]) => PointRow[]) => void;
  error?: string;
}) {
  return (
    <OrderedList<PointRow>
      name="coachingPoints"
      legend="Coaching points"
      noun="punto"
      addLabel="Añadir punto"
      atMost={`Un ejercicio admite hasta ${MAX_POINTS} puntos.`}
      max={MAX_POINTS}
      rows={rows}
      onRows={onRows}
      createRow={(key) => ({ key, text: "", isKey: false })}
      renderFields={(row, index, edit) => (
        <TextField
          label={`Punto ${index + 1}`}
          name="coachingPoint"
          value={row.text}
          onChange={(text) => edit({ text })}
          maxLength={140}
        />
      )}
      renderExtra={(row, index, edit) => (
        <Chip pressed={row.isKey} label={`Clave punto ${index + 1}`} onClick={() => edit({ isKey: !row.isKey })}>
          Clave
        </Chip>
      )}
      error={error}
    />
  );
}

/** Las variantes: un título y, si hace falta, una descripción. */
function VariantsField({
  rows,
  onRows,
  error,
}: {
  rows: VariantRow[];
  onRows: (update: (current: VariantRow[]) => VariantRow[]) => void;
  error?: string;
}) {
  return (
    <OrderedList<VariantRow>
      name="variants"
      legend="Variantes"
      noun="variante"
      addLabel="Añadir variante"
      atMost={`Un ejercicio admite hasta ${MAX_VARIANTS} variantes.`}
      max={MAX_VARIANTS}
      rows={rows}
      onRows={onRows}
      createRow={(key) => ({ key, title: "", description: "" })}
      renderFields={(row, index, edit) => (
        <>
          <TextField
            label={`Título de la variante ${index + 1}`}
            name="variantTitle"
            value={row.title}
            onChange={(title) => edit({ title })}
            maxLength={80}
          />
          <TextAreaField
            label={`Descripción de la variante ${index + 1}`}
            name="variantDescription"
            value={row.description}
            onChange={(description) => edit({ description })}
            maxLength={500}
            rows={3}
          />
        </>
      )}
      error={error}
    />
  );
}
