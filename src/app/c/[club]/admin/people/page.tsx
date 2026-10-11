import { adminPage } from "@/lib/guards";
import { listPeople, PEOPLE_LIMIT } from "@/modules/structure/queries";
import { PeopleList } from "../_components/people-list";
import { PersonEditor } from "../_components/person-editor";

/**
 * Las personas del club: quien juega, quien entrena y quien dirige, tengan cuenta o no. La
 * lista (con su buscador y las archivadas) y, debajo, el alta de una persona nueva.
 *
 * De un menor solo se guarda y se enseña el año de nacimiento.
 */
export default adminPage(async (ctx) => {
  const people = await listPeople(ctx);

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
    </>
  );
});
