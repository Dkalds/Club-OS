"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import type { FocusArea } from "@/modules/drills/types";
import { proposePracticeItems } from "@/modules/practice/actions";
import type { FocusOption, PracticeDetail, PracticeItemDraft, TeamOption } from "@/modules/practice/types";
import { BackLink } from "@/ui/back-link";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert } from "@/ui/form-field";
import { ChevronDownIcon, PlusIcon } from "@/ui/icons";
import { LeaveGuardDialog, useLeaveGuard } from "@/ui/leave-guard";
import { PracticeSummary } from "@/ui/practice-summary";
import { DrillPicker } from "./drill-picker";
import { PracticeBuilder, type Add } from "./practice-builder";
import { PracticeForm, type PracticeFormValues } from "./practice-form";

/**
 * «Añadir ejercicio»: el botón del constructor que abre el selector de la biblioteca (`DrillPicker`)
 * y lo que añade cada ejercicio elegido, que es el que dice `add`. El ítem nace con el título del
 * ejercicio y sus minutos mínimos, sin fase ni notas, y sin `id` hasta que se guarda; el
 * constructor lo pone al final, cerrado. Es un componente aparte porque guarda si la hoja está
 * abierta, y el constructor solo le da `add` y si la sesión está llena (`full`).
 */
function AddDrill({
  clubSlug,
  focusAreas,
  add,
  full,
}: {
  clubSlug: string;
  focusAreas: FocusArea[];
  add: (item: PracticeItemDraft) => void;
  full: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <CTAButton
        variant="secondary"
        block
        icon={<PlusIcon size={16} />}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Añadir ejercicio
      </CTAButton>
      <DrillPicker
        clubSlug={clubSlug}
        focusAreas={focusAreas}
        open={open}
        onOpenChange={setOpen}
        full={full}
        onPick={(drill) =>
          add({ drillId: drill.id, title: drill.title, phase: null, minutes: drill.minMinutes, notes: null })
        }
      />
    </>
  );
}

/** Lo que dejó la última propuesta: nada pedido, ejercicios cargados o ninguno que proponer. */
type Proposed = "none" | "loaded" | "empty";

/**
 * «Proponer entrenamiento»: pide un borrador de sesión (`proposePracticeItems`) y mete sus
 * ejercicios en la lista del constructor con `add`, cada uno con su fase, sus minutos y la línea
 * de por qué está. No guarda nada: entran como cambios sin guardar, y quien lo monta lo avisa
 * (`onProposed`). Solo se ofrece con la lista vacía: proponer encima de lo montado lo mezclaría.
 *
 * Con `auto` lo pide solo al montarse, una vez: es quien llega de «Proponer entrenamiento» en el
 * formulario de la sesión nueva (`?propose=1`). El parámetro se gasta ahí mismo (`onAutoUsed` y
 * fuera de la URL): recargar, volver atrás o vaciar la lista no proponen otra vez.
 *
 * Solo está montado con la lista vacía, y de eso salen dos cosas. Al montarse avisa de que no
 * hay propuesta a la vista (`onProposed("none")`): si la lista se vació, lo que se monte después
 * ya no es «la propuesta». Y una respuesta que llega cuando ya no está montado se descarta: en
 * la espera se ha añadido algo a mano, y la propuesta se mezclaría con ello.
 */
function Propose({
  clubSlug,
  eventId,
  add,
  auto,
  onAutoUsed,
  onProposed,
}: {
  clubSlug: string;
  eventId: string;
  add: Add;
  auto: boolean;
  onAutoUsed: () => void;
  onProposed: (proposed: Proposed) => void;
}) {
  const { pending, failure, run } = useAction();
  const started = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    onProposed("none");
    return () => {
      mounted.current = false;
    };
    // Solo al montarse y al desmontarse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function propose() {
    run(
      () => proposePracticeItems(clubSlug, { eventId }),
      ({ items }) => {
        if (!mounted.current) return;
        for (const item of items) {
          add(
            { drillId: item.drillId, title: item.title, phase: item.phase, minutes: item.minutes, notes: null },
            { hint: item.hint },
          );
        }
        onProposed(items.length > 0 ? "loaded" : "empty");
      },
    );
  }

  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    onAutoUsed();
    window.history.replaceState(window.history.state, "", window.location.pathname);
    propose();
    // Solo al montarse: `auto` se gasta aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {failure ? <FormAlert message={ACTION_ERROR_COPY[failure.error]} focus={false} /> : null}
      <CTAButton variant="secondary" block disabled={pending} onClick={propose}>
        Proponer entrenamiento
      </CTAButton>
    </>
  );
}

/**
 * La pantalla en la que se monta una sesión: su cabecera, sus datos (plegados en «Fecha y
 * datos») y la lista de sus ejercicios, que es lo principal y lo que se ve al entrar.
 *
 * Junta dos cosas que se guardan por separado, los datos de la sesión (`PracticeForm` en modo
 * editar) y sus ejercicios (`PracticeBuilder`), y pone lo que tienen en común:
 *
 * - La copia. Las dos acciones comparan con el mismo `updated_at` del plan, y cada guardado lo
 *   cambia. Aquí se guarda el vigente: sale de la sesión una sola vez, se le da a los dos como
 *   copia esperada y cualquiera de los dos lo renueva al guardar (`onSaved`). Así guardar los
 *   datos y después los ejercicios, o al revés, funciona sin recargar. Siempre la cadena tal
 *   cual la dio la base de datos: no pasa por `Date`.
 * - El turno. Por eso mismo solo guarda uno a la vez: mientras uno guarda, el botón del otro
 *   espera (`locked`). Sin eso, pulsar «Guardar datos» y «Guardar sesión» seguidos enviaría la
 *   misma copia dos veces y el segundo fallaría con «Alguien ha cambiado esto…» sin que nadie
 *   más hubiera guardado, ofreciendo un «Recargar» que tiraría lo que aún no se guardó. Cada
 *   uno avisa de su guardado con `onPendingChange`.
 * - La salida. Hay cambios sin guardar si los hay en la lista o en los datos (cada uno avisa de
 *   lo suyo con `onDirtyChange`). Mientras los haya, `useLeaveGuard` pide confirmación al
 *   cerrar o recargar la pestaña, y cualquier enlace que saque de la pantalla abre «¿Salir sin
 *   guardar?» antes de salir: «Volver a la sesión» y, sobre todo, las pestañas de la navegación
 *   inferior, que quedan justo debajo de «Guardar sesión».
 * - «Recargar», tras una copia obsoleta en cualquiera de los dos: quien lo pulsa ya ha
 *   decidido tirar lo suyo, así que `release` quita antes los avisos y el navegador no pregunta
 *   otra vez.
 *
 * «Fecha y datos» se pliega escondiendo el panel, no desmontándolo: lo escrito en el formulario
 * sigue ahí (y sigue contando como cambio sin guardar) aunque se cierre. Mientras lo haya, su
 * botón dice «Cambios sin guardar»: cerrado no se ve qué falta por guardar, y la pregunta al
 * salir no puede llegar sin nada a la vista que la explique. El botón sigue llamándose «Fecha y
 * datos»; el aviso es su descripción.
 *
 * La cabecera es la de la sesión guardada y se repinta cuando la página lo hace (cada guardado
 * revalida la app). No lleva la duración ni el número de ejercicios: cambian con cada toque, y
 * el total de lo que hay en pantalla lo dice la barra de guardado.
 *
 * `initialValues` son los datos de la sesión como los pide el formulario, con la fecha y la
 * hora ya en el reloj del club: los calcula la página, en el servidor (regla 7).
 *
 * «Añadir ejercicio», encima de «Añadir bloque libre», abre el selector de la biblioteca
 * (`AddDrill`). Sus objetivos son `drillFocusAreas`, los de la biblioteca (con su slug), y no las
 * opciones del formulario, que no lo llevan. Lo que se elige entra en la lista del constructor
 * como un cambio más sin guardar: hasta «Guardar sesión» no se escribe nada, y mientras tanto el
 * aviso de salida cubre también los enlaces del selector.
 *
 * Con la lista vacía, encima de «Añadir ejercicio» está «Proponer entrenamiento» (`Propose`);
 * con `autoPropose` la propuesta se pide sola al entrar. Lo propuesto entra también sin guardar,
 * y mientras siga así lo dice un aviso sobre la lista; si no había nada que proponer, lo dice
 * hasta que se añade algo. `slotMinutes` es lo que dura la franja, para que el constructor diga
 * si lo montado encaja.
 */
export function PracticeEditor({
  clubSlug,
  practice,
  options,
  drillFocusAreas,
  initialValues,
  slotMinutes,
  autoPropose = false,
}: {
  clubSlug: string;
  practice: PracticeDetail;
  options: { teams: TeamOption[]; focusAreas: FocusOption[] };
  drillFocusAreas: FocusArea[];
  initialValues: PracticeFormValues;
  slotMinutes?: number;
  autoPropose?: boolean;
}) {
  const [updatedAt, setUpdatedAt] = useState(practice.updatedAt);
  const [itemsDirty, setItemsDirty] = useState(false);
  const [dataDirty, setDataDirty] = useState(false);
  const [itemsSaving, setItemsSaving] = useState(false);
  const [dataSaving, setDataSaving] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [proposed, setProposed] = useState<Proposed>("none");
  // Con ejercicios no hay nada que proponer al entrar, ni después si la lista se vacía.
  const [autoPending, setAutoPending] = useState(autoPropose && practice.items.length === 0);
  const labelId = useId();
  const unsavedId = useId();
  const panelId = useId();
  const { guard, dialog, release } = useLeaveGuard(itemsDirty || dataDirty);

  function reload() {
    // Se quita el aviso a mano: si no, el navegador preguntaría justo al hacer lo que se pidió.
    release();
    location.reload();
  }

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-2)">
      <BackLink href={`/c/${clubSlug}/train/${practice.eventId}`} label="Volver a la sesión" onClick={guard} />

      <PracticeSummary practice={practice} />

      <div className="flex flex-col gap-(--space-3)">
        {/* No es un `CTAButton`: no hace nada, pliega una parte de la pantalla. */}
        <button
          type="button"
          aria-labelledby={labelId}
          aria-describedby={dataDirty ? unsavedId : undefined}
          aria-expanded={dataOpen}
          aria-controls={panelId}
          onClick={() => setDataOpen((open) => !open)}
          className="flex min-h-(--target-min) w-full cursor-pointer items-center justify-between gap-(--space-3) rounded-lg border border-line bg-surface-1 px-(--space-4) py-(--space-3) text-left font-display text-title uppercase active:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span id={labelId}>Fecha y datos</span>
          <span className="flex items-center gap-(--space-3)">
            {dataDirty ? (
              <span id={unsavedId} className="font-text text-body-s tracking-normal text-ink-2 normal-case">
                Cambios sin guardar
              </span>
            ) : null}
            <ChevronDownIcon size={16} className={dataOpen ? "rotate-180 text-ink-2" : "text-ink-2"} />
          </span>
        </button>
        <div id={panelId} role="group" aria-labelledby={labelId} hidden={!dataOpen}>
          <Card>
            <PracticeForm
              clubSlug={clubSlug}
              options={options}
              initial={initialValues}
              edit={{
                eventId: practice.eventId,
                expectedUpdatedAt: updatedAt,
                locked: itemsSaving,
                onSaved: setUpdatedAt,
                onDirtyChange: setDataDirty,
                onPendingChange: setDataSaving,
                onReload: reload,
              }}
            />
          </Card>
        </div>
      </div>

      {/* Siempre en el árbol: un lector de pantalla solo anuncia lo que cambia en una región que ya existía. */}
      <div role="status" className="empty:hidden">
        {proposed === "loaded" && itemsDirty ? (
          <p className="rounded-md border border-line bg-surface-2 p-(--space-4) text-body text-ink-2">
            Propuesta sin guardar. Revísala, cámbiala y guarda.
          </p>
        ) : null}
        {proposed === "empty" && !itemsDirty ? (
          <p className="rounded-md border border-line bg-surface-2 p-(--space-4) text-body text-ink-2">
            No hay ejercicios en la biblioteca para esta sesión. Móntala tú.
          </p>
        ) : null}
      </div>

      <PracticeBuilder
        clubSlug={clubSlug}
        eventId={practice.eventId}
        initialItems={practice.items}
        expectedUpdatedAt={updatedAt}
        locked={dataSaving}
        onSaved={(next) => {
          setUpdatedAt(next);
          // Guardada, ya no es una propuesta: lo que se cambie después es un cambio más.
          setProposed("none");
        }}
        onDirtyChange={setItemsDirty}
        onPendingChange={setItemsSaving}
        onReload={reload}
        slotMinutes={slotMinutes}
        extraActions={(add, full, empty) => (
          <>
            {empty ? (
              <Propose
                clubSlug={clubSlug}
                eventId={practice.eventId}
                add={add}
                auto={autoPending}
                onAutoUsed={() => setAutoPending(false)}
                onProposed={setProposed}
              />
            ) : null}
            <AddDrill clubSlug={clubSlug} focusAreas={drillFocusAreas} add={add} full={full} />
          </>
        )}
      />

      <LeaveGuardDialog {...dialog} />
    </div>
  );
}
