"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { savePracticeItems } from "@/modules/practice/actions";
import { changeMinutes, moveItem, totalMinutes } from "@/modules/practice/items";
import { DEFAULT_ITEM_MINUTES, MAX_ITEMS, MAX_ITEMS_MESSAGE } from "@/modules/practice/limits";
import type { PracticeItemDraft, SavedPracticeItem } from "@/modules/practice/types";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert } from "@/ui/form-field";
import { CheckIcon, PlusIcon, TrainIcon } from "@/ui/icons";
import { practiceItemName, PracticeTotal } from "@/ui/practice-item";
import { EmptyState } from "@/ui/states";
import { PracticeRowEditor, type RowFields } from "./practice-row-editor";
import { errorsByRow, phaseOptions, sameRows, toItem, toRow, type Row, type RowErrors } from "./practice-rows";
import { SortableRow } from "./practice-sortable-row";

/** Los controles de una fila (`data-control` de `PracticeItem`) y el botón de añadir. */
type Control = "toggle" | "up" | "down" | "add";

/** Lo que se le dice al asa, para quien no puede arrastrar con el dedo ni con el ratón. */
const KEYBOARD_INSTRUCTIONS =
  "Pulsa Espacio para coger el ejercicio, las flechas para moverlo y Espacio otra vez para soltarlo. Escape cancela.";

type Add = (item: PracticeItemDraft) => void;

/**
 * Lo que pinta `extraActions`. Es un componente, y no una llamada dentro del constructor, porque
 * `add` toca un ref (el contador de claves) y las reglas de React no dejan entregar, al pintar,
 * una función así a otra función: no pueden saber que solo se llamará desde un manejador. Como
 * prop de un componente sí la aceptan.
 */
function ExtraActions({
  render,
  add,
  full,
}: {
  render: (add: Add, full: boolean) => ReactNode;
  add: Add;
  full: boolean;
}) {
  return render(add, full);
}

/**
 * El constructor de una sesión: la lista ordenada de sus ítems, que se arrastran, se suben y se
 * bajan, se cronometran de cinco en cinco minutos, se editan, se añaden y se quitan, y la barra
 * con el total y «Guardar sesión».
 *
 * La lista sale de `initialItems` una sola vez: guardar repinta la página con los datos nuevos
 * (la acción revalida la app) y eso no debe pisar lo que se esté montando. Nada se guarda hasta
 * pulsar «Guardar sesión», que deja la lista de la sesión tal como está en pantalla
 * (`savePracticeItems`) con la copia esperada de `expectedUpdatedAt`. Esa copia no es suya: la
 * tiene quien lo monta, que la comparte con los datos de la sesión, y recibe la nueva con
 * `onSaved`.
 *
 * Ordenar, de tres maneras que hacen lo mismo (`moveItem`):
 * - Arrastrando el asa, con el ratón (a partir de 8px) o con el dedo (tras 150 ms): dnd-kit,
 *   solo en vertical.
 * - Con el teclado, desde el asa: Espacio la coge, las flechas la mueven, Espacio la suelta y
 *   Escape cancela. dnd-kit lo anuncia, y aquí se le dan los textos en español.
 * - Con «Subir» y «Bajar», en la fila abierta: arrastrar con el dedo falla a menudo, y hay
 *   quien no puede arrastrar. El foco se queda en el botón usado (la fila cambia de sitio y el
 *   navegador lo soltaría) o, si ha llegado al extremo, en su pareja; y la posición nueva se
 *   anuncia con la misma frase que al arrastrar.
 *
 * Solo una fila está abierta a la vez. «Añadir bloque libre» añade al final un bloque de 10
 * minutos, abierto y con el foco en su «Título»; con 30 ítems se desactiva y dice por qué.
 * `extraActions` es el hueco de lo que añade otra cosa (los ejercicios de la biblioteca): recibe
 * `add`, que añade el ítem al final sin abrirlo (ni hace nada si ya hay 30), y `full`, si la
 * lista ya lleva los 30 (quien pinte un selector desactiva ahí sus botones), y lo que pinte va
 * encima de «Añadir bloque libre». `add` es para un manejador, y se puede llamar varias veces
 * en el mismo evento: cada llamada se suma a la anterior. «Quitar» quita sin preguntar: no se
 * pierde nada guardado hasta que se guarda. El foco va entonces a la fila que ocupa su sitio.
 *
 * Cambios sin guardar: los hay mientras la lista difiera de la última copia guardada (la que
 * se abrió o, tras cada guardado, la que se envió); deshacer un cambio vuelve a no haberlos.
 * Con ellos se activa «Guardar sesión» y se avisa a quien lo monta (`onDirtyChange`), que es
 * quien pregunta antes de salir. Se le avisa en el mismo manejador que cambia la lista o que
 * recibe el resultado, y no con un efecto: así lo sabe en la misma pintura, y al aparecer
 * «Sesión guardada.» ya no hay aviso al cerrar la pestaña.
 *
 * Un guardado a la vez en la pantalla. Los datos de la sesión se guardan aparte, contra la
 * misma copia: dos guardados enviados a la vez llevarían la misma, y el segundo fallaría como
 * si otra persona hubiera guardado. Con `locked` (el otro está guardando) «Guardar sesión»
 * espera, y de lo suyo avisa con `onPendingChange`: que empieza, en el mismo toque (antes de
 * pintar nada, para que el otro botón se cierre ya), y que ha terminado, cuando el resultado
 * ya está pintado y la copia nueva, entregada.
 *
 * Si guardar falla, la lista no se toca: el aviso sale arriba (y se lleva el foco) con su
 * salida, «Recargar» si otra persona guardó antes (`onReload`: hasta que se pulsa, lo montado
 * sigue ahí) o «Volver a la sesión» si la sesión ya está cerrada. Los errores de un campo se
 * pintan en su fila, y se abre la primera que tenga alguno.
 */
export function PracticeBuilder({
  clubSlug,
  eventId,
  initialItems,
  expectedUpdatedAt,
  locked,
  onSaved,
  onDirtyChange,
  onPendingChange,
  onReload,
  extraActions,
}: {
  clubSlug: string;
  eventId: string;
  initialItems: SavedPracticeItem[];
  expectedUpdatedAt: string;
  locked: boolean;
  onSaved: (updatedAt: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onReload: () => void;
  extraActions?: (add: Add, full: boolean) => ReactNode;
}) {
  const { pending, failure, run } = useAction();
  const [rows, setRows] = useState<Row[]>(() => initialItems.map(toRow));
  // La última copia guardada: contra ella se mide si hay cambios sin guardar.
  const [savedRows, setSavedRows] = useState(rows);
  // La lista de ahora mismo, para el manejador que recibe el resultado de un guardado: es de
  // cuando se envió, y mientras tanto se ha podido seguir montando.
  const latest = useRef(rows);
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Cuántas filas se han añadido en esta visita: de ahí sale la clave de la siguiente, que así
  // no repite la de ninguna otra, tampoco la de una que ya se quitó. Un ref y no estado: dos
  // filas añadidas en el mismo evento necesitan cada una la suya antes de que se pinte nada.
  const newKeys = useRef(0);
  // El bloque libre recién añadido: su fila se monta con el foco en «Título».
  const [addedKey, setAddedKey] = useState<string | null>(null);
  // Las claves de las filas en el orden del último envío: los errores llegan por posición.
  const [sentKeys, setSentKeys] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLDivElement>(null);
  // A qué control devolver el foco cuando la lista se repinte: `row` es la clave de su fila.
  const refocus = useRef<{ row: string | null; controls: Control[] } | null>(null);
  // Si aún no se ha anunciado ninguna posición desde que se cogió la fila (ver `announcements`).
  const justPicked = useRef(false);
  const dndId = useId();
  const limitId = useId();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    latest.current = rows;
  }, [rows]);

  // El fin del guardado se dice desde aquí y no desde el manejador del resultado: así llega
  // salga como salga (bien, mal o con la llamada caída) y siempre después de pintarlo. Llegar un
  // turno tarde solo retrasa abrir el otro guardado; llegar pronto lo abriría con la copia vieja.
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  // Tras mover o quitar con los botones, la fila ha cambiado de sitio (o ya no está) y el
  // navegador ha soltado el foco: vuelve al primer control de la lista que se pueda usar.
  useEffect(() => {
    const target = refocus.current;
    if (target === null) return;
    refocus.current = null;

    const scope =
      target.row === null ? root.current : root.current?.querySelector(`[data-row="${target.row}"]`);
    for (const control of target.controls) {
      const button = scope?.querySelector<HTMLElement>(`[data-control="${control}"]:not(:disabled)`);
      if (button) {
        button.focus();
        return;
      }
    }
  }, [rows]);

  const dirty = !sameRows(rows, savedRows);
  const full = rows.length >= MAX_ITEMS;
  const phases = phaseOptions([...savedRows, ...rows]);
  const rowErrors = failure ? errorsByRow(failure.fieldErrors, sentKeys) : new Map<string, RowErrors>();
  const sessionHref = `/c/${clubSlug}/train/${eventId}`;

  /**
   * Todo cambio de la lista pasa por aquí: la pinta, quita el «Sesión guardada.» y avisa. Quien
   * lo llama parte de la lista de la última pintura (`rows`): un cambio por evento.
   */
  function change(next: Row[]) {
    setRows(next);
    setSaved(false);
    onDirtyChange(!sameRows(next, savedRows));
  }

  function patch(key: string, fields: Partial<RowFields>) {
    change(rows.map((row) => (row.key === key ? { ...row, ...fields } : row)));
  }

  function minutes(key: string, delta: 5 | -5) {
    change(changeMinutes(rows, rows.findIndex((row) => row.key === key), delta));
  }

  function move(key: string, direction: "up" | "down") {
    const from = rows.findIndex((row) => row.key === key);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= rows.length) return;

    change(moveItem(rows, from, to));
    refocus.current = { row: key, controls: direction === "up" ? ["up", "down"] : ["down", "up"] };
    setAnnouncement(`${practiceItemName(rows[from].title)} está en la posición ${to + 1} de ${rows.length}.`);
  }

  function remove(key: string) {
    const index = rows.findIndex((row) => row.key === key);
    if (index < 0) return;

    const next = rows.filter((row) => row.key !== key);
    change(next);
    if (openKey === key) setOpenKey(null);
    // La fila que ocupa su sitio; si era la última, la anterior; y sin filas, el botón de añadir.
    const neighbour = next[index] ?? next[index - 1];
    refocus.current = neighbour ? { row: neighbour.key, controls: ["toggle"] } : { row: null, controls: ["add"] };
    setAnnouncement(`Has quitado ${practiceItemName(rows[index].title)}.`);
  }

  /**
   * Añade un ítem al final y devuelve su clave; con la sesión llena no añade nada. No pasa por
   * `change`: parte de la lista que haya en el momento de aplicarse, no de la de la última
   * pintura, así que varias llamadas en el mismo evento se suman en vez de pisarse. Una fila
   * nueva siempre es un cambio sin guardar.
   */
  function append(item: PracticeItemDraft): string | null {
    if (rows.length >= MAX_ITEMS) return null;

    newKeys.current += 1;
    // Un ítem añadido es nuevo: no lleva `id` hasta que se guarda.
    const row: Row = {
      key: `nuevo-${newKeys.current}`,
      drillId: item.drillId,
      title: item.title,
      phase: item.phase,
      minutes: item.minutes,
      notes: item.notes,
    };
    // Se vuelve a mirar el tope: una llamada anterior de este mismo evento ha podido llenarla.
    setRows((current) => (current.length < MAX_ITEMS ? [...current, row] : current));
    setSaved(false);
    onDirtyChange(true);
    return row.key;
  }

  function addFreeBlock() {
    const key = append({ drillId: null, title: "", phase: null, minutes: DEFAULT_ITEM_MINUTES, notes: null });
    if (key === null) return;
    setOpenKey(key);
    setAddedKey(key);
  }

  function drop({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    change(
      moveItem(
        rows,
        rows.findIndex((row) => row.key === active.id),
        rows.findIndex((row) => row.key === over.id),
      ),
    );
  }

  function save() {
    if (pending || locked) return;
    setSaved(false);
    onPendingChange(true);

    // Lo que se envía es lo que queda guardado: si se cambia algo mientras guarda, eso sigue sin guardar.
    const sent = rows;
    const keys = sent.map((row) => row.key);
    setSentKeys(keys);
    run(
      async () => {
        const result = await savePracticeItems(clubSlug, {
          eventId,
          expectedUpdatedAt,
          items: sent.map(toItem),
        });
        // Con errores de campo se abre la primera fila que tenga alguno: su mensaje sale dentro.
        if (!result.ok && result.fieldErrors) {
          const [first] = errorsByRow(result.fieldErrors, keys).keys();
          if (first !== undefined) setOpenKey(first);
        }
        return result;
      },
      ({ updatedAt }) => {
        const stillDirty = !sameRows(latest.current, sent);
        setSavedRows(sent);
        setSaved(!stillDirty);
        onSaved(updatedAt);
        onDirtyChange(stillDirty);
      },
    );
  }

  const nameOf = (id: UniqueIdentifier) => practiceItemName(rows.find((row) => row.key === id)?.title ?? "");
  const positionOf = (id: UniqueIdentifier) => rows.findIndex((row) => row.key === id) + 1;

  // Lo que dnd-kit anuncia a los lectores de pantalla al arrastrar, en español. Al coger una
  // fila, dnd-kit avisa enseguida de que está «encima» de su propio sitio: ese primer aviso
  // pisaría el «Has cogido…», así que se calla.
  const announcements: Announcements = {
    onDragStart({ active }) {
      justPicked.current = true;
      return `Has cogido ${nameOf(active.id)}.`;
    },
    onDragOver({ active, over }) {
      if (justPicked.current) {
        justPicked.current = false;
        return undefined;
      }
      return over ? `${nameOf(active.id)} está en la posición ${positionOf(over.id)} de ${rows.length}.` : undefined;
    },
    onDragEnd({ active, over }) {
      return `Has soltado ${nameOf(active.id)} en la posición ${positionOf(over?.id ?? active.id)}.`;
    },
    onDragCancel() {
      return "Has cancelado el movimiento.";
    },
  };

  return (
    // El hueco de abajo es el de la barra de guardado, que es fija: sin él taparía la última
    // fila y el botón de añadir.
    <div ref={root} className="flex flex-col gap-(--space-3) pb-[calc(var(--target-min)+var(--space-6))]">
      {failure ? (
        <FormAlert message={ACTION_ERROR_COPY[failure.error]}>
          {failure.error === "STALE_COPY" ? (
            <CTAButton variant="secondary" className="self-start" onClick={onReload}>
              Recargar
            </CTAButton>
          ) : null}
          {failure.error === "SESSION_CLOSED" ? (
            <CTAButton variant="secondary" className="self-start" href={sessionHref}>
              Volver a la sesión
            </CTAButton>
          ) : null}
        </FormAlert>
      ) : null}

      {/* Con `id`: sin él, dnd-kit numera sus avisos con un contador que no coincide entre el servidor y el navegador. */}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        accessibility={{ announcements, screenReaderInstructions: { draggable: KEYBOARD_INSTRUCTIONS } }}
        onDragEnd={drop}
      >
        {rows.length > 0 ? (
          <SortableContext items={rows.map((row) => row.key)} strategy={verticalListSortingStrategy}>
            <Card variant="flush" as="ul">
              {rows.map((row, index) => (
                <SortableRow
                  key={row.key}
                  row={row}
                  index={index}
                  count={rows.length}
                  expanded={row.key === openKey}
                  focusTitle={row.key === addedKey}
                  onToggle={() => setOpenKey(row.key === openKey ? null : row.key)}
                  onMinutes={(delta) => minutes(row.key, delta)}
                  onMove={(direction) => move(row.key, direction)}
                  onRemove={() => remove(row.key)}
                >
                  <PracticeRowEditor
                    name={practiceItemName(row.title)}
                    item={row}
                    phases={phases}
                    errors={rowErrors.get(row.key) ?? {}}
                    onChange={(fields) => patch(row.key, fields)}
                  />
                </SortableRow>
              ))}
            </Card>
          </SortableContext>
        ) : (
          <EmptyState
            icon={<TrainIcon size={28} />}
            title="Esta sesión aún no tiene ejercicios"
            body="Añade ejercicios para prepararla."
          />
        )}
      </DndContext>

      {extraActions ? (
        <ExtraActions
          render={extraActions}
          full={full}
          add={(item) => {
            append(item);
          }}
        />
      ) : null}
      <CTAButton
        variant="secondary"
        block
        data-control="add"
        icon={<PlusIcon size={16} />}
        disabled={full}
        aria-describedby={full ? limitId : undefined}
        onClick={addFreeBlock}
      >
        Añadir bloque libre
      </CTAButton>
      {full ? (
        <p id={limitId} className="text-body-s text-ink-2">
          {MAX_ITEMS_MESSAGE}
        </p>
      ) : null}

      {/* Lo que pasa al mover o quitar con los botones, para quien no lo ve. Siempre en el árbol. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>

      <div className="fixed inset-x-0 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface-1">
        <div className="mx-auto flex w-full max-w-(--content-max) items-center justify-between gap-(--space-3) px-(--space-4) py-(--space-3)">
          <div className="flex min-w-0 flex-col">
            <PracticeTotal minutes={totalMinutes(rows)} inline />
            {/*
              La región de estado está siempre en el árbol, vacía hasta que se guarda: un lector
              de pantalla solo anuncia el texto que cambia dentro de una región que ya existía.
            */}
            <div role="status">
              {saved ? (
                <p className="flex items-center gap-(--space-1) text-body-s text-success">
                  <CheckIcon size={16} />
                  Sesión guardada.
                </p>
              ) : null}
            </div>
          </div>
          <CTAButton variant="primary" className="shrink-0" disabled={!dirty || pending || locked} onClick={save}>
            Guardar sesión
          </CTAButton>
        </div>
      </div>
    </div>
  );
}
