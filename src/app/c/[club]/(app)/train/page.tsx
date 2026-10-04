import { requireClub } from "@/lib/guards";
import { Card } from "@/ui/card";
import { SearchIcon } from "@/ui/icons";
import { ListRow } from "@/ui/list-row";
import { SectionHeader } from "@/ui/section-header";
import { ComingSoon } from "../coming-soon";

/**
 * Entrenar: de momento, la entrada a la biblioteca de ejercicios y, debajo, el aviso de la
 * Fase 1 (`ComingSoon`) para lo que aún no existe. Cuando llegue el resto de la pestaña
 * sustituirá a ese aviso y la entrada se queda.
 *
 * La página pide el contexto ella misma: un layout no protege a sus páginas.
 */
export default async function TrainPage({ params }: PageProps<"/c/[club]/train">) {
  const { club } = await params;
  const ctx = await requireClub(club);

  return (
    <>
      <div className="flex flex-col gap-(--space-3) px-(--space-4) pt-(--space-6)">
        <SectionHeader title="Biblioteca" />
        <Card variant="flush" as="ul">
          <ListRow
            href={`/c/${ctx.org.slug}/drills`}
            lead={<SearchIcon size={24} />}
            title="Biblioteca de ejercicios"
            subtitle="Busca por objetivo, edad y duración"
          />
        </Card>
      </div>
      <ComingSoon clubSlug={club} tab="train" />
    </>
  );
}
