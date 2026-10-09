import type { TeamDetail } from "@/modules/team/types";
import { Card } from "@/ui/card";
import { TeamIcon } from "@/ui/icons";
import { PlayerCard } from "@/ui/player-card";
import { SectionHeader } from "@/ui/section-header";
import { EmptyState } from "@/ui/states";

const ROLE_LABEL: Record<TeamDetail["staff"][number]["role"], string> = {
  head_coach: "Entrenador principal",
  assistant: "Ayudante",
};

/**
 * La plantilla de un equipo: su cuerpo técnico y sus jugadores por dorsal, cada uno enlazado a
 * su ficha. La URL de la ficha lleva ids opacos, nunca el nombre del jugador.
 */
export function TeamRoster({ team, clubSlug }: { team: TeamDetail; clubSlug: string }) {
  const playerHref = (personId: string) => `/c/${clubSlug}/team/${team.id}/players/${personId}`;
  const count = team.players.length;

  return (
    <div className="flex flex-col gap-(--space-6)">
      <p className="text-body-s text-ink-3">{[team.categoryName, team.seasonName].filter(Boolean).join(" · ")}</p>

      {team.staff.length > 0 ? (
        <section className="flex flex-col gap-(--space-3)">
          <SectionHeader title="Cuerpo técnico" />
          <ul className="flex flex-col gap-(--space-1)">
            {team.staff.map((member) => (
              <li key={member.personId} className="text-body">
                {`${member.firstName} ${member.lastName}`}
                <span className="text-ink-3">{` · ${ROLE_LABEL[member.role]}`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-(--space-3)">
        <SectionHeader title={count === 1 ? "Plantilla · 1 jugador" : `Plantilla · ${count} jugadores`} />
        {count === 0 ? (
          <EmptyState icon={<TeamIcon size={28} />} title="Este equipo aún no tiene jugadores" body="Dirección da de alta la plantilla en Gestión." />
        ) : (
          <Card variant="flush" as="ul">
            {team.players.map((player) => (
              <PlayerCard
                key={player.personId}
                href={playerHref(player.personId)}
                firstName={player.firstName}
                lastName={player.lastName}
                jerseyNumber={player.jerseyNumber}
                position={player.position}
              />
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
