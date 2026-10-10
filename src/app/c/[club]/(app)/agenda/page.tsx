import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import type { AddOption } from "@/modules/schedule/add-menu";
import { AgendaList } from "@/modules/schedule/agenda-list";
import { listAgenda, parseAgendaKind, parseAgendaScope } from "@/modules/schedule/queries";

/**
 * Agenda: los entrenos y los partidos del equipo activo, por semanas.
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. La pestaña y el filtro salen de la URL: solo `?scope=past` y `?kind=practice` o
 * `?kind=game`, exactos, cambian algo; cualquier otra cosa (otro valor, el parámetro repetido,
 * ninguno) son los próximos y todo. La hora se lee una sola vez, aquí, en el servidor: con ella
 * `listAgenda` decide qué es próximo y qué anterior, y nunca llega de la petición. Si no se
 * puede leer, `listAgenda` lanza y lo recoge `error.tsx`; mientras llega, se ve `loading.tsx`.
 *
 * `can` solo decide qué ofrece «Añadir»: lo que protege es RLS y cada acción de crear.
 */
export default async function AgendaPage({ params, searchParams }: PageProps<"/c/[club]/agenda">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  const base = `/c/${ctx.org.slug}`;

  const query = await searchParams;
  const filters = { scope: parseAgendaScope(query.scope), kind: parseAgendaKind(query.kind) };

  const agenda = await listAgenda(ctx, filters, new Date().toISOString());

  const addOptions: AddOption[] = [];
  if (can(ctx, "practice.manage")) addOptions.push({ label: "Sesión de entrenamiento", href: `${base}/train/new` });
  if (can(ctx, "game.manage")) addOptions.push({ label: "Partido", href: `${base}/games/new` });

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
      <h1 className="font-display text-display-l uppercase">Agenda</h1>
      <AgendaList
        clubSlug={ctx.org.slug}
        filters={filters}
        agenda={agenda}
        addOptions={addOptions}
        role={ctx.membership.role}
      />
    </div>
  );
}
