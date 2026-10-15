import Link from "next/link";
import { adminPage } from "@/lib/guards";
import { scheduleLabel } from "@/modules/calendar/format";
import { listSeasonSchedules, listVenues } from "@/modules/calendar/queries";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { ChevronRightIcon } from "@/ui/icons";
import { BLOCK_HEADING_CLASS } from "../_components/structure-shared";
import { VenueEditor } from "../_components/venue-editor";

/**
 * El calendario del club en Gestión: los horarios semanales de cada equipo de la temporada
 * actual, todos juntos, y las pistas.
 *
 * Los horarios se ven aquí y se cambian en la página de cada equipo, a la que lleva su fila: con
 * un horario, los entrenamientos de la temporada se crean solos. Las pistas son las que sugiere
 * «Lugar» al preparar una sesión o un partido, y las que puede llevar un horario.
 */
export default adminPage(async (ctx) => {
  const [teams, venues] = await Promise.all([listSeasonSchedules(ctx), listVenues(ctx)]);
  const slug = ctx.org.slug;

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Calendario</h1>
        <p className="text-ink-2">Los horarios de cada equipo y las pistas donde se entrena y se juega.</p>
      </header>

      <section aria-labelledby="calendar-schedules" className="flex flex-col gap-(--space-3)">
        <h2 id="calendar-schedules" className={BLOCK_HEADING_CLASS}>
          Horarios de la temporada
        </h2>
        {teams.length > 0 ? (
          <>
            <Card as="ul" variant="flush">
              {teams.map((team) => (
                // Como una fila de lista, pero con una línea por horario, entera: aquí se viene a
                // verlos todos, y un subtítulo de una línea los cortaría.
                <li key={team.teamId} className="border-t border-line first:border-t-0">
                  <Link
                    href={`/c/${slug}/admin/teams/${team.teamId}`}
                    // Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión.
                    prefetch={false}
                    className="group flex min-h-14 items-center gap-(--space-3) px-(--space-4) py-(--space-3) text-ink active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-strong wrap-break-word">{team.teamName}</span>
                      {team.schedules.length > 0 ? (
                        team.schedules.map((schedule) => (
                          <span key={schedule.id} className="block text-body-s text-ink-2 wrap-break-word">
                            {scheduleLabel(schedule)}
                          </span>
                        ))
                      ) : (
                        <span className="block text-body-s text-ink-2">Sin horario</span>
                      )}
                    </span>
                    <ChevronRightIcon size={16} className="shrink-0 text-ink-2" />
                  </Link>
                </li>
              ))}
            </Card>
            <p className="text-body-s text-ink-2">
              El horario de un equipo se añade y se cambia en su página. Las horas son las del reloj del club.
            </p>
          </>
        ) : (
          // Sin `EmptyState`: su título sería otro `<h2>` dentro de este apartado, y su botón,
          // un segundo principal junto a «Crear pista».
          <>
            <p className="text-body text-ink-2">
              Aún no hay equipos esta temporada. Créalos en Temporada para darles su horario.
            </p>
            <CTAButton variant="secondary" href={`/c/${slug}/admin/season`} className="self-start">
              Ir a Temporada
            </CTAButton>
          </>
        )}
      </section>

      <section aria-labelledby="calendar-venues" className="flex flex-col gap-(--space-4)">
        <div className="flex flex-col gap-(--space-1)">
          <h2 id="calendar-venues" className={BLOCK_HEADING_CLASS}>
            Pistas
          </h2>
          <p className="text-body-s text-ink-2">
            Son las que se sugieren al escribir el lugar de una sesión o de un partido.
          </p>
        </div>
        {venues.length > 0 ? (
          <ul className="flex flex-col gap-(--space-4)">
            {venues.map((venue) => (
              <li key={venue.id}>
                <VenueEditor clubSlug={slug} venue={venue} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-2">Aún no hay pistas.</p>
        )}
        <VenueEditor clubSlug={slug} />
      </section>
    </>
  );
});
