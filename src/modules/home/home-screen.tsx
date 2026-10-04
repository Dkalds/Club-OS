import { Card } from "@/ui/card";
import { GameCard } from "@/ui/game-card";
import { Hero } from "@/ui/hero";
import { TeamIcon, TrainIcon } from "@/ui/icons";
import { DateChip, ListRow } from "@/ui/list-row";
import { PracticeCard } from "@/ui/practice-card";
import { SectionHeader } from "@/ui/section-header";
import { EmptyState } from "@/ui/states";
import type { HomeData, WeekItem } from "./types";

/** «Buenos días, Ana.»; sin nombre (una cuenta sin persona asociada), «Buenos días.». */
export function heroTitle(greeting: string, firstName: string): string {
  const name = firstName.trim();
  return name ? `${greeting}, ${name}.` : `${greeting}.`;
}

// Margen lateral de pantalla (`space-4`). La portada no lo lleva: va a sangre.
const BLOCK = "px-(--space-4)";

/**
 * La pantalla de Inicio de quien entrena: qué toca ahora y qué viene esta semana.
 *
 * Solo pinta: los datos llegan ya resueltos de `getHomeData`, con las horas en la zona del
 * club (regla 7). Aquí no se formatea ninguna fecha ni se lee la hora. Nada de un club está
 * escrito aquí: el slug y la sigla llegan por props.
 *
 * Orden: saludo → próximo entrenamiento (la única card destacada) o el aviso de que no hay
 * ninguno → próximo partido, si lo hay → «Esta semana». Sin equipos, solo el saludo y el
 * aviso. El `<h1>` es el del saludo; lo demás son `<h2>`.
 *
 * Un entrenamiento (la card destacada y su fila de la semana) lleva a su sesión, `/train/{id}`;
 * un partido aún no tiene pantalla y lleva a la pestaña de Partidos. El aviso de que no hay
 * entrenamiento ofrece «Nueva sesión» solo a quien puede gestionarlas (`canCreatePractice`: lo
 * decide la página con `can`; aquí solo muestra u oculta).
 *
 * Los bloques van sueltos dentro del `<main>` de `AppShell`, que pone la separación entre
 * secciones (`space-6`).
 */
export function HomeScreen({
  home,
  clubSlug,
  ownShortName,
  canCreatePractice,
}: {
  home: HomeData;
  clubSlug: string;
  /** La sigla del club (`branding.shortName`), para su lado del partido. */
  ownShortName: string;
  /** Si quien mira puede crear sesiones: el aviso sin entrenamiento ofrece entonces crear una. */
  canCreatePractice: boolean;
}) {
  const base = `/c/${clubSlug}`;
  const practiceHref = (eventId: string) => `${base}/train/${eventId}`;
  // Los partidos aún no tienen pantalla propia: llevan a la pestaña de Partidos.
  const weekHref = (item: WeekItem) =>
    item.kind === "practice" ? practiceHref(item.eventId) : `${base}/games`;

  return (
    <>
      <Hero kicker={home.kicker} title={heroTitle(home.greeting, home.firstName)} />

      {home.hasTeams ? (
        <>
          <div className={BLOCK}>
            {home.nextPractice ? (
              <PracticeCard practice={home.nextPractice} href={practiceHref(home.nextPractice.eventId)} />
            ) : (
              <EmptyState
                icon={<TrainIcon size={28} />}
                title="No hay entrenamientos programados"
                body="Cuando haya una sesión en el calendario, la verás aquí."
                action={canCreatePractice ? { label: "Nueva sesión", href: `${base}/train/new` } : undefined}
              />
            )}
          </div>

          {home.nextGame ? (
            <div className={BLOCK}>
              <GameCard game={home.nextGame} ownShortName={ownShortName} />
            </div>
          ) : null}

          <section className={`flex flex-col gap-(--space-3) ${BLOCK}`}>
            <SectionHeader title="Esta semana" />
            {home.week.length > 0 ? (
              <Card variant="flush" as="ul">
                {/* Las filas (`<li>`) van directas dentro de la lista: pintan sus separadores. */}
                {home.week.map((item) => (
                  <ListRow
                    key={item.eventId}
                    href={weekHref(item)}
                    lead={<DateChip dow={item.dow} day={item.day} />}
                    title={item.title}
                    subtitle={item.subtitle}
                    trail={item.time}
                  />
                ))}
              </Card>
            ) : (
              <p className="text-ink-2">No hay nada más esta semana.</p>
            )}
          </section>
        </>
      ) : (
        <div className={BLOCK}>
          <EmptyState
            icon={<TeamIcon size={28} />}
            title="Aún no estás en ningún equipo"
            body="Cuando dirección te asigne un equipo, aquí verás tus entrenamientos y partidos."
          />
        </div>
      )}
    </>
  );
}
