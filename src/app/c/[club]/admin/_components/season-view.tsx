import Link from "next/link";
import { seasonDates } from "@/modules/structure/format";
import type { Category, SeasonDetail, SeasonSummary, SeasonTeam } from "@/modules/structure/types";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { TeamIcon } from "@/ui/icons";
import { ListRow } from "@/ui/list-row";
import { SeasonActions, SeasonEditor } from "./season-editor";
import { BLOCK_HEADING_CLASS, countLabel, Pill } from "./structure-shared";
import { TeamEditor } from "./team-editor";

const SEASON_LINK =
  "inline-flex min-h-(--target-min) shrink-0 items-center gap-(--space-2) rounded-pill border px-(--space-4) text-body-s font-semibold whitespace-nowrap " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

/** Los equipos de una temporada, por categoría y en el orden en que llegan (el de las categorías). */
function byCategory(teams: readonly SeasonTeam[]): Array<{ id: string; name: string; teams: SeasonTeam[] }> {
  const groups: Array<{ id: string; name: string; teams: SeasonTeam[] }> = [];
  for (const team of teams) {
    const last = groups.at(-1);
    if (last && last.id === team.categoryId) last.teams.push(team);
    else groups.push({ id: team.categoryId, name: team.categoryName, teams: [team] });
  }
  return groups;
}

/**
 * Una temporada en Gestión: las temporadas del club para pasar de una a otra, sus datos, lo que
 * se puede hacer con ella entera (marcarla como actual, borrarla), sus equipos por categoría, el
 * alta de un equipo y, al final, el alta de otra temporada.
 *
 * Sin categorías no se puede crear un equipo: en su lugar se dice dónde se crean.
 */
export function SeasonView({
  clubSlug,
  season,
  seasons,
  categories,
}: {
  clubSlug: string;
  season: SeasonDetail;
  seasons: readonly SeasonSummary[];
  categories: readonly Category[];
}) {
  const base = `/c/${clubSlug}/admin`;
  const groups = byCategory(season.teams);

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Temporada</h1>
        <p className="text-ink-2">Lo que ve el club en la app es siempre la temporada actual.</p>
      </header>

      {seasons.length > 1 ? (
        <nav aria-label="Temporadas" className="-mx-(--space-4) overflow-x-auto px-(--space-4)">
          <ul role="list" className="flex gap-(--space-2)">
            {seasons.map((other) => {
              const active = other.id === season.id;
              return (
                <li key={other.id}>
                  <Link
                    href={`${base}/season/${other.id}`}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    className={`${SEASON_LINK} ${
                      active
                        ? "border-brand-accent bg-brand-accent-soft text-brand-accent"
                        : "border-line bg-surface-2 text-ink-2"
                    }`}
                  >
                    {other.name}
                    {other.isCurrent ? <span className="text-label uppercase">Actual</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      <section aria-label={`Temporada ${season.name}`} className="flex flex-col gap-(--space-4)">
        <div className="flex flex-col gap-(--space-1)">
          <div className="flex flex-wrap items-center gap-(--space-2)">
            <h2 className="min-w-0 font-display text-display-m wrap-break-word uppercase">{season.name}</h2>
            {season.isCurrent ? <Pill>Actual</Pill> : null}
          </div>
          <p className="text-ink-2">{seasonDates(season.startsOn, season.endsOn)}</p>
        </div>
        <SeasonActions clubSlug={clubSlug} season={season} hasTeams={season.teams.length > 0} />
      </section>

      <section aria-labelledby="season-teams" className="flex flex-col gap-(--space-4)">
        <div className="flex items-baseline justify-between gap-(--space-3)">
          <h2 id="season-teams" className={BLOCK_HEADING_CLASS}>
            Equipos
          </h2>
          <CTAButton variant="ghost" href={`${base}/season/categories`}>
            Categorías
          </CTAButton>
        </div>

        {groups.length > 0 ? (
          groups.map((group) => (
            <div key={group.id} className="flex flex-col gap-(--space-2)">
              <h3 className="text-label text-ink-2 uppercase">{group.name}</h3>
              <Card as="ul" variant="flush">
                {group.teams.map((team) => (
                  <ListRow
                    key={team.id}
                    href={`${base}/teams/${team.id}`}
                    lead={<TeamIcon />}
                    title={team.name}
                    // Corto: a 375 px el subtítulo es una sola línea.
                    subtitle={`${countLabel(team.players, "jugador", "jugadores")} · ${countLabel(team.staff, "técnico", "técnicos")}`}
                  />
                ))}
              </Card>
            </div>
          ))
        ) : (
          <p className="text-body text-ink-2">Esta temporada aún no tiene equipos.</p>
        )}

        {categories.length > 0 ? (
          // La `key` vacía el alta al cambiar de temporada.
          <TeamEditor key={season.id} clubSlug={clubSlug} seasonId={season.id} categories={categories} />
        ) : (
          <Card>
            <h3 className={BLOCK_HEADING_CLASS}>Nuevo equipo</h3>
            <p className="text-body text-ink-2">Un equipo es de una categoría. Crea antes la primera.</p>
            <CTAButton variant="secondary" href={`${base}/season/categories`} className="self-start">
              Crear una categoría
            </CTAButton>
          </Card>
        )}
      </section>

      <SeasonEditor key={`edit-${season.id}`} clubSlug={clubSlug} season={season} />
      <SeasonEditor key={`new-${season.id}`} clubSlug={clubSlug} copyFrom={seasons} />
    </>
  );
}
