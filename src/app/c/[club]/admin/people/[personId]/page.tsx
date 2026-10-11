import { notFound } from "next/navigation";
import { adminPage } from "@/lib/guards";
import { ACCESS_LABEL, fullName, STAFF_ROLE_LABEL } from "@/modules/structure/format";
import { getPerson } from "@/modules/structure/queries";
import type { PersonTeam } from "@/modules/structure/types";
import { BackLink } from "@/ui/back-link";
import { Card } from "@/ui/card";
import { TeamIcon } from "@/ui/icons";
import { ListRow } from "@/ui/list-row";
import { PersonArchive, PersonEditor } from "../../_components/person-editor";
import { BLOCK_HEADING_CLASS, Pill } from "../../_components/structure-shared";

/** Qué hace una persona en un equipo. */
function seatLabel(as: PersonTeam["as"]): string {
  return as === "player" ? "En la plantilla" : STAFF_ROLE_LABEL[as];
}

/**
 * Una persona del club: sus datos, sus equipos de cualquier temporada (la actual primero), si
 * tiene acceso a la app y con qué rol, y archivarla o recuperarla. Una que no existe, que es de
 * otro club o cuyo id no tiene forma de uuid da el mismo 404.
 *
 * El acceso se lee, no se cambia: invitar y dar o quitar acceso llega con las invitaciones.
 */
export default adminPage<{ club: string; personId: string }>(async (ctx, { personId }) => {
  const person = await getPerson(ctx, personId);
  if (!person) notFound();

  const slug = ctx.org.slug;

  return (
    <>
      <BackLink href={`/c/${slug}/admin/people`} label="Personas" />
      <header className="flex flex-col gap-(--space-2)">
        <div className="flex flex-wrap items-center gap-(--space-2)">
          <h1 className="min-w-0 font-display text-display-l wrap-break-word uppercase">{fullName(person)}</h1>
          {person.archived ? <Pill tone="muted">Archivada</Pill> : null}
        </div>
        <p className="text-ink-2">
          {person.access ? `Tiene acceso a la app: ${ACCESS_LABEL[person.access]}.` : "No tiene acceso a la app."}
        </p>
      </header>

      <section aria-labelledby="person-teams" className="flex flex-col gap-(--space-3)">
        <h2 id="person-teams" className={BLOCK_HEADING_CLASS}>
          Equipos
        </h2>
        {person.teams.length > 0 ? (
          <Card as="ul" variant="flush">
            {person.teams.map((team) => (
              <ListRow
                // La misma persona puede entrenar y jugar en un equipo: la clave lleva las dos cosas.
                key={`${team.teamId}-${team.as}`}
                href={`/c/${slug}/admin/teams/${team.teamId}`}
                lead={<TeamIcon />}
                title={team.teamName}
                subtitle={`${seatLabel(team.as)} · ${team.seasonName}`}
                trail={team.isCurrent ? "Actual" : undefined}
              />
            ))}
          </Card>
        ) : (
          <p className="text-body text-ink-2">No está en ningún equipo. Se añade desde la página de cada equipo.</p>
        )}
      </section>

      <PersonEditor clubSlug={slug} person={person} />
      <PersonArchive clubSlug={slug} person={person} archived={person.archived} />
    </>
  );
});
