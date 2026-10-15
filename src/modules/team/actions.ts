"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { fail, fromZodError, ok, type ActionResult } from "@/lib/action-result";
import { requireClub } from "@/lib/guards";
import { listMyTeams } from "./queries";
import { ACTIVE_TEAM_COOKIE, activeTeamCookiePath } from "./scope";

// El equipo activo se elige aquí. No escribe en la base de datos (por eso no pasa por
// `mutate`): solo deja una cookie de preferencia. Sigue el mismo orden que las demás acciones:
// Zod sobre la entrada, el club, la comprobación de que se puede, la escritura y revalidar.

/** Un año: la preferencia sobrevive a la temporada, y un equipo que deje de ser mío se ignora. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Todo lo que se pinta dentro del marco de la app depende del equipo activo. */
const APP_ROUTE = "/c/[club]/(app)";

const setActiveTeamSchema = z.object({
  /** El equipo que se quiere ver; `null` para volver a verlos todos. */
  teamId: z.string().uuid("No encontramos este contenido.").nullable(),
});

export type SetActiveTeamInput = z.input<typeof setActiveTeamSchema>;

/**
 * Elige el equipo activo de quien llama en este club, o lo quita (`teamId: null`).
 *
 * Solo se puede elegir uno de «mis equipos» (`listMyTeams`, con la sesión de la persona y RLS):
 * el de otro club, uno que no entreno o uno que no existe es `NOT_FOUND` y no deja cookie. Aun
 * así la cookie nunca da acceso a nada: quien la lee (`getTeamScope`) vuelve a comprobar que el
 * equipo es mío.
 *
 * La cookie vive bajo `/c/{slug}`, no se lee desde JavaScript y no lleva datos de nadie: solo
 * el id opaco de un equipo.
 */
export async function setActiveTeam(clubSlug: string, input: SetActiveTeamInput): Promise<ActionResult<null>> {
  const parsed = setActiveTeamSchema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  // Fuera de todo try/catch: `notFound()` funciona lanzando.
  const ctx = await requireClub(clubSlug);
  const { teamId } = parsed.data;
  const store = await cookies();
  const path = activeTeamCookiePath(ctx.org.slug);

  if (teamId === null) {
    store.delete({ name: ACTIVE_TEAM_COOKIE, path });
  } else {
    const teams = await listMyTeams(ctx);
    if (!teams.some((team) => team.id === teamId)) return fail("NOT_FOUND");

    store.set(ACTIVE_TEAM_COOKIE, teamId, {
      path,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: ONE_YEAR_SECONDS,
    });
  }

  revalidatePath(APP_ROUTE, "layout");
  return ok(null);
}
