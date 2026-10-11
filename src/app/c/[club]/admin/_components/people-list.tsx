"use client";

import { useId, useState } from "react";
import { listName, matchesPerson } from "@/modules/structure/format";
import type { PersonSummary } from "@/modules/structure/types";
import { Card } from "@/ui/card";
import { FIELD_CONTROL_CLASS, FIELD_LABEL_CLASS } from "@/ui/form-field";
import { TeamIcon } from "@/ui/icons";
import { ListRow } from "@/ui/list-row";
import { EmptyState } from "@/ui/states";
import { countLabel } from "./structure-shared";

/** Qué personas se enseñan: las que están en el club, o las archivadas. */
const VIEWS = [
  { archived: false, label: "En el club" },
  { archived: true, label: "Archivadas" },
] as const;

const TAB =
  "inline-flex min-h-(--target-min) cursor-pointer items-center rounded-pill border px-(--space-4) text-body-s font-semibold " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring " +
  "aria-pressed:border-brand-accent aria-pressed:bg-brand-accent-soft aria-pressed:text-brand-accent";

/**
 * Las personas del club, con un buscador por nombre (sin distinguir tildes ni mayúsculas) y un
 * conmutador entre las que están en el club y las archivadas. Cada fila lleva a la página de la
 * persona y dice su año de nacimiento, si lo tiene, y sus equipos de la temporada actual.
 *
 * La búsqueda es local: la lista viaja entera con la página.
 */
export function PeopleList({ clubSlug, people }: { clubSlug: string; people: readonly PersonSummary[] }) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);

  const inView = people.filter((person) => person.archived === archived);
  const shown = inView.filter((person) => matchesPerson(person, query));

  return (
    <div className="flex flex-col gap-(--space-4)">
      <div className="flex flex-col gap-(--space-2)">
        <label htmlFor={searchId} className={FIELD_LABEL_CLASS}>
          Buscar
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          maxLength={80}
          autoComplete="off"
          placeholder="Nombre o apellidos"
          onChange={(event) => setQuery(event.target.value)}
          className={`${FIELD_CONTROL_CLASS} h-(--target-min)`}
        />
      </div>

      <div role="group" aria-label="Qué personas se ven" className="flex flex-wrap gap-(--space-2)">
        {VIEWS.map((view) => (
          <button
            key={view.label}
            type="button"
            aria-pressed={archived === view.archived}
            onClick={() => setArchived(view.archived)}
            className={`${TAB} border-line bg-surface-2 text-ink-2`}
          >
            {view.label}
          </button>
        ))}
      </div>

      <p role="status" className="text-body-s text-ink-2">
        {countLabel(shown.length, "persona", "personas")}
      </p>

      {shown.length > 0 ? (
        <Card as="ul" variant="flush">
          {shown.map((person) => (
            <ListRow
              key={person.id}
              href={`/c/${clubSlug}/admin/people/${person.id}`}
              lead={<TeamIcon />}
              title={listName(person)}
              subtitle={person.teams.length > 0 ? person.teams.join(", ") : "Sin equipo esta temporada"}
              trail={person.birthYear ?? undefined}
            />
          ))}
        </Card>
      ) : inView.length === 0 ? (
        <EmptyState
          icon={<TeamIcon size={28} />}
          title={archived ? "No hay nadie archivado" : "Aún no hay personas"}
          body={archived ? "Aquí verás a quien ya no está en el club." : "Da de alta a la primera persona de tu club."}
        />
      ) : (
        <p className="text-body text-ink-2">Nadie con ese nombre.</p>
      )}
    </div>
  );
}
