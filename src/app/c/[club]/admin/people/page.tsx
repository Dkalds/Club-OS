import { adminPage } from "@/lib/guards";
import { listPeopleForAdmin } from "@/modules/people/queries";
import { listTeamsForAdmin } from "@/modules/team/queries";
import { PeopleScreen } from "./people-screen";

/**
 * Personas del club: lista, alta y edición una a una, archivado, invitar a quien no tiene
 * cuenta, dar una tutela, e importación por CSV (Fase 7 Task 11).
 */
export default adminPage(async (ctx) => {
  const [people, teams] = await Promise.all([listPeopleForAdmin(ctx), listTeamsForAdmin(ctx)]);

  return (
    <PeopleScreen
      clubSlug={ctx.org.slug}
      people={people}
      teams={teams.map((team) => ({ id: team.id, name: team.name }))}
    />
  );
});
