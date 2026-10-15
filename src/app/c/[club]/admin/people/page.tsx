import { adminPage } from "@/lib/guards";
import { fullName } from "@/modules/structure/format";
import { listPeople, PEOPLE_LIMIT } from "@/modules/structure/queries";
import { PeopleList } from "../_components/people-list";
import { PersonEditor } from "../_components/person-editor";
import { ImportCsv } from "./_components/import-csv";
import { CreateGuardianshipForm } from "./_components/guardianship-form";

/**
 * Las personas del club: quien juega, quien entrena y quien dirige, tengan cuenta o no. La
 * lista (con su buscador y las archivadas) y, debajo, el alta de una persona nueva, dar una
 * tutela e importar personas desde un CSV.
 *
 * De un menor solo se guarda y se enseña el año de nacimiento.
 */
export default adminPage(async (ctx) => {
  const people = await listPeople(ctx);
  // Una persona archivada no se tutela ni tutela a nadie nuevo.
  const active = people
    .filter((person) => !person.archived)
    .map((person) => ({ id: person.id, name: fullName(person) }));

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Personas</h1>
        <p className="text-ink-2">Quien juega y quien entrena en tu club, tenga o no acceso a la app.</p>
      </header>

      <PeopleList clubSlug={ctx.org.slug} people={people} />
      {people.length >= PEOPLE_LIMIT ? (
        <p className="text-body-s text-ink-2">{`Se enseñan las primeras ${PEOPLE_LIMIT} personas.`}</p>
      ) : null}

      <PersonEditor clubSlug={ctx.org.slug} />
      {active.length > 1 ? <CreateGuardianshipForm clubSlug={ctx.org.slug} people={active} /> : null}
      <ImportCsv clubSlug={ctx.org.slug} />
    </>
  );
});
