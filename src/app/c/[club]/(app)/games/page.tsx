import { redirect } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { agendaHref } from "@/modules/schedule/href";

/**
 * La lista de partidos vive ahora en la Agenda: esta ruta lleva allí, con el filtro de
 * partidos puesto. `?scope=played`, que era su pestaña de jugados, lleva a los anteriores.
 *
 * Primero el club (un club ajeno o que no existe sigue siendo un 404, no una redirección). La
 * ficha, el alta y la edición de un partido siguen en `/games/…`.
 */
export default async function GamesPage({ params, searchParams }: PageProps<"/c/[club]/games">) {
  const { club } = await params;
  const ctx = await requireClub(club);

  const { scope } = await searchParams;

  redirect(agendaHref(ctx.org.slug, { scope: scope === "played" ? "past" : "upcoming", kind: "game" }));
}
