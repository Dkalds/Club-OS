import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { isoToLocalInputs, nextWeeklySlot } from "@/lib/time";
import { formatStandardNumber } from "@/modules/methodology/format";
import { minutesLabel } from "@/modules/practice/format";
import { phaseBlocks, sessionMinutes, totalMinutes } from "@/modules/practice/items";
import { getPractice } from "@/modules/practice/queries";
import { standardsLabel } from "@/modules/tenancy/navigation";
import { BackLink } from "@/ui/back-link";
import { Card } from "@/ui/card";
import { TrainIcon } from "@/ui/icons";
import { PracticeItemView, PracticeTotal } from "@/ui/practice-item";
import { PracticeSummary } from "@/ui/practice-summary";
import { SectionHeader } from "@/ui/section-header";
import { StandardBadge } from "@/ui/standard-badge";
import { EmptyState } from "@/ui/states";
import { PracticeActions } from "../_components/practice-actions";

/** Cuántos Standards se nombran en la cabecera; el resto se cuenta («+2»). */
const STANDARDS_SHOWN = 3;

/**
 * El detalle de una sesión de entrenamiento: qué se entrena y por qué (sus Standards), sus
 * notas y sus ejercicios por fases, con el total, y lo que se puede hacer con ella.
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Una sesión que no existe, que es de otro club o de otro equipo (RLS no la deja ver)
 * da el mismo 404: `getPractice` devuelve `null` en los tres casos. Si no se puede leer, lanza y
 * lo recoge `error.tsx`; mientras llega, se ve `loading.tsx`. El título de la sesión es el
 * `<h1>`, y la fase de cada bloque, un `<h2>`.
 *
 * Los ejercicios van en bloques de fase seguida (`phaseBlocks`), numerados a lo largo de toda
 * la sesión. La fase ya la dice la cabecera del bloque, así que las filas no la repiten. Un
 * ítem que es un ejercicio de la biblioteca enlaza a su ficha (por su id, nunca por su nombre)
 * si `getPractice` pudo leerla (`drillVisible`); un bloque libre, o el borrador de otro
 * entrenador que RLS esconde, se queda en texto: el enlace llevaría a un 404. Una
 * sesión sin ejercicios dice que no los tiene; si se puede editar, la salida es el «Editar
 * sesión» de las acciones, y si no, volver a Entrenar. En la cabecera, una sesión sin ejercicios
 * dura su franja (`sessionMinutes`), no 0 min.
 *
 * Una sesión ya hecha es su propio resumen: cada ejercicio dice si se hizo y cuánto duró de
 * verdad (lo que registró el directo), y bajo el total previsto va el real.
 *
 * Las acciones (dirigir, editar, duplicar, cancelar) las ve quien gestiona sesiones; `can` solo muestra u
 * oculta: lo que protege es RLS y cada acción. La fecha que propone «Duplicar» se calcula aquí,
 * en el servidor y en el reloj del club: la misma hora del club la semana siguiente, aunque
 * entre medias cambie la hora.
 */
export default async function PracticePage({ params }: PageProps<"/c/[club]/train/[eventId]">) {
  const { club, eventId } = await params;
  const ctx = await requireClub(club);

  const practice = await getPractice(ctx, eventId);
  if (!practice) notFound();

  const trainHref = `/c/${ctx.org.slug}/train`;
  // El total de los ítems es el de la lista; lo que dura la sesión, el de la cabecera, es ese
  // mismo total y, sin ejercicios, su franja.
  const itemsMinutes = totalMinutes(practice.items);
  const shownStandards = practice.standards.slice(0, STANDARDS_SHOWN);
  const moreStandards = practice.standards.length - shownStandards.length;
  const notes = practice.notes?.trim();
  // Una sesión hecha se revisa: cada ejercicio dice si se hizo y cuánto duró de verdad.
  const reviewed = practice.status === "done";

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-2)">
      <BackLink href={trainHref} label="Sesiones" />

      <PracticeSummary
        practice={{
          ...practice,
          totalMinutes: sessionMinutes(practice.items, practice.startsAt, practice.endsAt),
          itemCount: practice.items.length,
        }}
      />

      {shownStandards.length > 0 ? (
        <section className="flex flex-col gap-(--space-3)">
          <SectionHeader title={standardsLabel(ctx.branding.terminology)} />
          {/* `role="list"`: sin viñetas, Safari con VoiceOver deja de anunciarla como lista. */}
          <ul role="list" className="flex flex-wrap items-center gap-(--space-2)">
            {shownStandards.map((standard) => (
              <li key={standard.id} className="max-w-full min-w-0">
                <StandardBadge
                  number={standard.number}
                  title={standard.title}
                  href={`/c/${ctx.org.slug}/way/standards#standard-${formatStandardNumber(standard.number)}`}
                />
              </li>
            ))}
            {moreStandards > 0 ? <li className="text-body-s text-ink-2">+{moreStandards}</li> : null}
          </ul>
        </section>
      ) : null}

      {notes ? (
        <section className="flex flex-col gap-(--space-3)">
          <SectionHeader title="Notas" />
          <p className="text-body wrap-break-word whitespace-pre-line">{notes}</p>
        </section>
      ) : null}

      {practice.items.length > 0 ? (
        <div className="flex flex-col gap-(--space-6)">
          {phaseBlocks(practice.items).map((block) => (
            <section key={block.startIndex} className="flex flex-col gap-(--space-3)">
              <div className="flex items-baseline justify-between gap-(--space-3)">
                <h2 className="min-w-0 font-display text-title wrap-break-word uppercase">
                  {block.phase ?? "Sin fase"}
                </h2>
                <span className="shrink-0 text-body-s text-ink-2 tabular-nums">{minutesLabel(block.minutes)}</span>
              </div>
              <Card variant="flush" as="ul">
                {/* Las filas (`<li>`) van directas dentro de la lista: pintan sus separadores. */}
                {block.items.map((item, offset) => (
                  <PracticeItemView
                    key={item.id}
                    index={block.startIndex + offset}
                    title={item.title}
                    phase={null}
                    minutes={item.minutes}
                    href={item.drillVisible ? `/c/${ctx.org.slug}/drills/${item.drillId}` : undefined}
                    result={
                      reviewed
                        ? { completed: item.completed === true, actualMinutes: item.actualMinutes }
                        : undefined
                    }
                  />
                ))}
              </Card>
            </section>
          ))}
          <Card variant="flush">
            <PracticeTotal minutes={itemsMinutes} />
            {reviewed && practice.actualMinutes !== null ? (
              <PracticeTotal minutes={practice.actualMinutes} label="Real" />
            ) : null}
          </Card>
        </div>
      ) : practice.canEdit ? (
        // Sin acción propia: la salida es el «Editar sesión» de las acciones, que va justo debajo.
        // Dos «Editar sesión» primary en una misma pantalla romperían «un primario por pantalla».
        <EmptyState
          icon={<TrainIcon size={28} />}
          title="Esta sesión aún no tiene ejercicios"
          body="Añade ejercicios para prepararla."
        />
      ) : (
        <EmptyState
          icon={<TrainIcon size={28} />}
          title="Sesión sin ejercicios"
          body="No se añadieron ejercicios a esta sesión."
          action={{ label: "Volver a Sesiones", href: trainHref }}
        />
      )}

      {can(ctx, "practice.manage") ? (
        <PracticeActions
          // Con la sesión como clave, duplicar y pasar al detalle de la copia parte de cero: ni el
          // panel abierto ni el botón parado de la sesión anterior.
          key={practice.eventId}
          clubSlug={ctx.org.slug}
          eventId={practice.eventId}
          canEdit={practice.canEdit}
          status={practice.status}
          itemCount={practice.items.length}
          live={practice.live}
          duplicateDefaults={isoToLocalInputs(
            nextWeeklySlot(practice.startsAt, new Date().toISOString(), ctx.org.timezone),
            ctx.org.timezone,
          )}
        />
      ) : null}
    </div>
  );
}
