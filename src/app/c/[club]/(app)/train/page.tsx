import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { PracticeList } from "@/modules/practice/practice-list";
import { listPractices } from "@/modules/practice/queries";
import { Card } from "@/ui/card";
import { SearchIcon } from "@/ui/icons";
import { ListRow } from "@/ui/list-row";
import { SectionHeader } from "@/ui/section-header";

/**
 * Entrenar: las sesiones de entrenamiento de quien las gestiona (próximas e histórico) y, debajo,
 * la entrada a la biblioteca de ejercicios.
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. La pestaña sale de la URL: solo `?scope=history`, exacto, es el histórico; cualquier
 * otra cosa (otro valor, el parámetro repetido, ninguno) son las próximas. La hora se lee una
 * sola vez, aquí, en el servidor: con ella `listPractices` decide qué es próximo y qué
 * histórico, y nunca llega de la petición. Si las sesiones no se pueden leer, `listPractices`
 * lanza y lo recoge `error.tsx`; mientras llegan, se ve `loading.tsx`.
 *
 * `can` solo muestra u oculta «Nueva sesión»: lo que protege es RLS y la acción de crear.
 */
export default async function TrainPage({ params, searchParams }: PageProps<"/c/[club]/train">) {
  const { club } = await params;
  const ctx = await requireClub(club);

  const { scope: requested } = await searchParams;
  const scope = requested === "history" ? "history" : "upcoming";

  const { practices, teamCount, truncated } = await listPractices(ctx, scope, new Date().toISOString());

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-6)">
      <h1 className="font-display text-display-l uppercase">Entrenar</h1>

      <PracticeList
        clubSlug={ctx.org.slug}
        scope={scope}
        practices={practices}
        teamCount={teamCount}
        canCreate={can(ctx, "practice.manage")}
        role={ctx.membership.role}
        truncated={truncated}
      />

      <section className="flex flex-col gap-(--space-3)">
        <SectionHeader title="Biblioteca" />
        <Card variant="flush" as="ul">
          <ListRow
            href={`/c/${ctx.org.slug}/drills`}
            lead={<SearchIcon size={24} />}
            title="Biblioteca de ejercicios"
            subtitle="Busca por objetivo, edad y duración"
          />
        </Card>
      </section>
    </div>
  );
}
