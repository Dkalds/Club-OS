import { adminPage } from "@/lib/guards";
import { listCategoriesForAdmin, listSeasonsForAdmin, listTeamsForAdminDetailed } from "@/modules/team/admin-queries";
import { TeamsScreen } from "./teams-screen";

/** Temporadas, categorías y equipos del club: alta y edición, nunca borrado (Fase 7 Task 10). */
export default adminPage(async (ctx) => {
  const [seasons, categories, teams] = await Promise.all([
    listSeasonsForAdmin(ctx),
    listCategoriesForAdmin(ctx),
    listTeamsForAdminDetailed(ctx),
  ]);

  return <TeamsScreen clubSlug={ctx.org.slug} seasons={seasons} categories={categories} teams={teams} />;
});
