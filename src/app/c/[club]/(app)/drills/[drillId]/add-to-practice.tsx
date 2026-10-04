"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction, type Failure } from "@/lib/use-action";
import { addDrillToPractice } from "@/modules/practice/actions";
import { practiceRowSubtitle } from "@/modules/practice/format";
import type { PracticeListItem } from "@/modules/practice/types";
import { BottomSheet } from "@/ui/bottom-sheet";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert } from "@/ui/form-field";
import { CheckIcon, PlusIcon, TrainIcon } from "@/ui/icons";
import { DateChip } from "@/ui/list-row";
import { EmptyState } from "@/ui/states";

// Cada fila es un botón con la forma de `ListRow` (que es un enlace): el día, el título y los
// metadatos de la sesión, y su hora. Mide como ella, 56px (`min-h-14`) como mínimo. Pulsada, pasa
// a `surface-3`, y `ink-3` no va sobre `surface-3` (design/README.md, Color): lo que va en
// `ink-3` sube a `ink-2` mientras dura la pulsación. El foco va por dentro: la lista llega a los
// bordes de la hoja y recortaría lo que sobresale.
const ROW =
  "group flex min-h-14 w-full cursor-pointer items-center gap-(--space-3) px-(--space-4) py-(--space-2) text-left text-ink " +
  "active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring " +
  "disabled:cursor-default";

/**
 * Lo que se le dice a quien falla: el motivo de siempre (`ACTION_ERROR_COPY`) y, si la acción
 * señala los ejercicios de la sesión (ya lleva el máximo), esa frase, que es la causa y la que
 * se puede entender: «Revisa los campos marcados» no marca nada en esta hoja.
 */
function failureMessage({ error, fieldErrors }: Failure): string {
  return fieldErrors.items ?? ACTION_ERROR_COPY[error];
}

/**
 * El botón que se ofrece al añadir: lleva al constructor de la sesión. Se le da el foco al
 * aparecer: la fila que se pulsó ya no está (el resultado sustituye a la lista) y abrir la sesión
 * es lo que se hace después. React solo enfoca solo botones y campos (`autoFocus`), no enlaces, y
 * se enfoca con un efecto.
 */
function OpenSession({ href }: { href: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.querySelector("a")?.focus();
  }, []);

  return (
    <div ref={box} className="px-(--space-4)">
      <CTAButton variant="primary" block href={href}>
        Abrir sesión
      </CTAButton>
    </div>
  );
}

/**
 * Lo de dentro de la hoja: las sesiones entre las que elegir, y lo que pasa al elegir. Solo
 * existe mientras la hoja está abierta (la hoja desmonta su contenido al cerrarse), así que cada
 * vez que se abre parte de cero: sin el aviso de un fallo anterior y sin el «Añadido» del
 * anterior. `onBusyChange` le dice a quien monta la hoja cuándo hay una acción en marcha.
 */
function Sessions({
  clubSlug,
  drillId,
  practices,
  teamCount,
  onBusyChange,
}: {
  clubSlug: string;
  drillId: string;
  practices: PracticeListItem[];
  teamCount: number;
  onBusyChange: (busy: boolean) => void;
}) {
  const { pending, failure, run } = useAction();
  const [added, setAdded] = useState<PracticeListItem | null>(null);

  // Con un efecto de layout y no uno normal: el aviso de que ya no hay nada en marcha llega en la
  // misma pintura que el resultado, y la hoja se deja cerrar en cuanto se ve «Añadido».
  useLayoutEffect(() => {
    onBusyChange(pending);
  }, [pending, onBusyChange]);

  function choose(practice: PracticeListItem) {
    run(
      () => addDrillToPractice(clubSlug, { eventId: practice.eventId, drillId }),
      () => setAdded(practice),
    );
  }

  return (
    <div className="flex flex-col gap-(--space-3) pb-(--space-4)">
      {failure ? (
        <div className="px-(--space-4)">
          <FormAlert message={failureMessage(failure)} />
        </div>
      ) : null}

      {/* Siempre en el árbol y vacía hasta que se añade: un lector de pantalla solo anuncia el texto que cambia en una región que ya existía. */}
      <div role="status" className="px-(--space-4) empty:hidden">
        {added ? (
          <p className="flex items-center gap-(--space-2) text-body text-success">
            <CheckIcon size={20} />
            Añadido a {added.title}.
          </p>
        ) : null}
      </div>

      {added ? (
        <OpenSession href={`/c/${clubSlug}/train/${added.eventId}/edit`} />
      ) : practices.length === 0 ? (
        <div className="px-(--space-4)">
          <EmptyState
            icon={<TrainIcon size={28} />}
            title="No hay sesiones programadas"
            body="Crea la próxima sesión de tu equipo y añade este ejercicio."
            action={{ label: "Nueva sesión", href: `/c/${clubSlug}/train/new` }}
          />
        </div>
      ) : (
        // Las filas (`<li>`) van directas dentro de la lista: pintan sus separadores.
        <ul role="list" aria-busy={pending} className="border-t border-line">
          {practices.map((practice) => (
            <li key={practice.eventId} className="border-t border-line first:border-t-0">
              <button type="button" disabled={pending} onClick={() => choose(practice)} className={ROW}>
                <span className="flex w-11 shrink-0 items-center justify-center text-brand-accent">
                  <DateChip dow={practice.dow} day={practice.day} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-strong">{practice.title}</span>
                  <span className="block truncate text-body-s text-ink-3 group-active:text-ink-2">
                    {practiceRowSubtitle(practice, teamCount)}
                  </span>
                </span>
                <span className="shrink-0 text-body-s text-ink-3 tabular-nums group-active:text-ink-2">
                  {practice.time}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * «Añadir a sesión» en la ficha de un ejercicio publicado: un botón `secondary` que abre una hoja
 * «Añadir a una sesión» con las próximas sesiones de quien entrena (`practices`, de
 * `listPractices`). Elegir una añade el ejercicio al final de su lista con `addDrillToPractice`,
 * sin pasar por el constructor, y la hoja pasa a decir «Añadido a {título}.» con «Abrir sesión»
 * (el constructor de esa sesión, para ordenarla o quitarlo). Si no puede, dice por qué y deja
 * elegir otra. Sin sesiones, la hoja dice que no hay y ofrece «Nueva sesión».
 *
 * Quien la monta decide si se pinta (`practice.manage` y ejercicio publicado): aquí no se mira.
 * Con varios equipos (`teamCount`; sin él, los que se ven en las sesiones) cada fila empieza por
 * el suyo, como la lista de Entrenar. Mientras guarda, la hoja no se deja cerrar a medias: el
 * resultado llegaría a una pantalla sin hoja y quien lo pidió no sabría si se añadió.
 */
export function AddToPractice({
  clubSlug,
  drillId,
  practices,
  teamCount,
}: {
  clubSlug: string;
  drillId: string;
  practices: PracticeListItem[];
  teamCount?: number;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const teamNames = new Set(practices.map((practice) => practice.teamName.trim()).filter(Boolean));
  const teams = teamCount ?? teamNames.size;

  return (
    <>
      <CTAButton
        variant="secondary"
        block
        icon={<PlusIcon size={16} />}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Añadir a sesión
      </CTAButton>
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          if (!busy) setOpen(next);
        }}
        title="Añadir a una sesión"
      >
        <Sessions
          clubSlug={clubSlug}
          drillId={drillId}
          practices={practices}
          teamCount={teams}
          onBusyChange={setBusy}
        />
      </BottomSheet>
    </>
  );
}
