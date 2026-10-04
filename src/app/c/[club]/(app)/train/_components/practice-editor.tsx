"use client";

import { useId, useState } from "react";
import type { FocusOption, PracticeDetail, TeamOption } from "@/modules/practice/types";
import { BackLink } from "@/ui/back-link";
import { Card } from "@/ui/card";
import { ChevronDownIcon } from "@/ui/icons";
import { LeaveGuardDialog, useLeaveGuard } from "@/ui/leave-guard";
import { PracticeSummary } from "@/ui/practice-summary";
import { PracticeBuilder } from "./practice-builder";
import { PracticeForm, type PracticeFormValues } from "./practice-form";

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
 * - La salida. Hay cambios sin guardar si los hay en la lista o en los datos (cada uno avisa de
 *   lo suyo con `onDirtyChange`). Mientras los haya, `useLeaveGuard` pide confirmación al
 *   cerrar o recargar la pestaña, y cualquier enlace que saque de la pantalla abre «¿Salir sin
 *   guardar?» antes de salir: «Volver a la sesión» y, sobre todo, las pestañas de la navegación
 *   inferior, que quedan justo debajo de «Guardar sesión».
 * - «Recargar», tras una copia obsoleta en cualquiera de los dos: quien lo pulsa ya ha
 *   decidido tirar lo suyo, así que `release` quita antes el aviso de la pestaña y el navegador
 *   no pregunta otra vez.
 *
 * «Fecha y datos» se pliega escondiendo el panel, no desmontándolo: lo escrito en el formulario
 * sigue ahí (y sigue contando como cambio sin guardar) aunque se cierre.
 *
 * La cabecera es la de la sesión guardada y se repinta cuando la página lo hace (cada guardado
 * revalida la app). No lleva la duración ni el número de ejercicios: cambian con cada toque, y
 * el total de lo que hay en pantalla lo dice la barra de guardado.
 *
 * `initialValues` son los datos de la sesión como los pide el formulario, con la fecha y la
 * hora ya en el reloj del club: los calcula la página, en el servidor (regla 7).
 */
export function PracticeEditor({
  clubSlug,
  practice,
  options,
  initialValues,
}: {
  clubSlug: string;
  practice: PracticeDetail;
  options: { teams: TeamOption[]; focusAreas: FocusOption[] };
  initialValues: PracticeFormValues;
}) {
  const [updatedAt, setUpdatedAt] = useState(practice.updatedAt);
  const [itemsDirty, setItemsDirty] = useState(false);
  const [dataDirty, setDataDirty] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const toggleId = useId();
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
          id={toggleId}
          aria-expanded={dataOpen}
          aria-controls={panelId}
          onClick={() => setDataOpen((open) => !open)}
          className="flex min-h-(--target-min) w-full cursor-pointer items-center justify-between gap-(--space-3) rounded-lg border border-line bg-surface-1 px-(--space-4) py-(--space-3) text-left font-display text-title uppercase active:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          Fecha y datos
          <ChevronDownIcon size={16} className={dataOpen ? "rotate-180 text-ink-2" : "text-ink-2"} />
        </button>
        <div id={panelId} role="group" aria-labelledby={toggleId} hidden={!dataOpen}>
          <Card>
            <PracticeForm
              clubSlug={clubSlug}
              options={options}
              initial={initialValues}
              edit={{
                eventId: practice.eventId,
                expectedUpdatedAt: updatedAt,
                onSaved: setUpdatedAt,
                onDirtyChange: setDataDirty,
                onReload: reload,
              }}
            />
          </Card>
        </div>
      </div>

      <PracticeBuilder
        clubSlug={clubSlug}
        eventId={practice.eventId}
        initialItems={practice.items}
        expectedUpdatedAt={updatedAt}
        onSaved={setUpdatedAt}
        onDirtyChange={setItemsDirty}
        onReload={reload}
      />

      <LeaveGuardDialog {...dialog} />
    </div>
  );
}
