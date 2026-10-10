import { adminPage } from "@/lib/guards";
import { listInvitations } from "@/modules/invitations/queries";
import { listTeamsForAdmin } from "@/modules/team/queries";
import { InvitesScreen } from "./invites-screen";

/**
 * Las invitaciones del club: lista, alta, reenvío y cancelación. El enlace de una invitación
 * nueva o reenviada se enseña una vez, con un botón de copiar: no hay email automático
 * ([D15]), dirección lo envía por el medio que prefiera.
 */
export default adminPage(async (ctx) => {
  const [invitations, teams] = await Promise.all([listInvitations(ctx), listTeamsForAdmin(ctx)]);

  return (
    <InvitesScreen
      clubSlug={ctx.org.slug}
      invitations={invitations}
      teams={teams.map((team) => ({ id: team.id, name: team.name }))}
    />
  );
});
