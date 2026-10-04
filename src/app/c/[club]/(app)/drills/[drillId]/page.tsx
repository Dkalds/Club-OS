import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { drillHeader } from "@/modules/drills/format";
import { drillPermissions } from "@/modules/drills/permissions";
import { getDrill } from "@/modules/drills/queries";
import { listPractices } from "@/modules/practice/queries";
import { standardsLabel } from "@/modules/tenancy/navigation";
import { CoachingPointsList } from "@/ui/coaching-points-list";
import { CourtDiagram } from "@/ui/court";
import { MarkdownBody } from "@/ui/markdown-body";
import { TopNavigation } from "@/ui/top-navigation";
import { AddToPractice } from "./add-to-practice";
import { DrillAdminActions } from "./drill-admin-actions";
import {
  EquipmentSection,
  MetaPills,
  PrinciplesSection,
  Section,
  StandardsSection,
  StatusNotice,
  VariantsSection,
  VideoSection,
} from "./drill-sections";
import { DRILL_TITLE_ID } from "./title-id";

/**
 * La ficha de un ejercicio: su diagrama, qué trabaja (objetivo, Standards y principios: la
 * regla «qué/por qué») y cómo se monta (organización, coaching points, variantes, material y
 * vídeo). Solo sale lo que el ejercicio tiene: ninguna sección se pinta vacía.
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Un id que no es un uuid, un ejercicio que no existe, uno de otro club y un borrador
 * que quien mira no puede ver dan EXACTAMENTE el mismo 404 (`getDrill` devuelve `null` en los
 * cuatro casos y aquí no se distinguen): nada dice que exista. Si Supabase falla, `getDrill`
 * lanza y lo recoge `error.tsx`; mientras llega, se ve `loading.tsx`. Un archivado sí se ve:
 * sale de la búsqueda, pero su ficha y su enlace en las sesiones siguen ahí.
 *
 * La cabecera de detalle es lo primero del contenido: el marco oculta entonces la de marca (ver
 * `TopNavigation`). Su título es un `<p>`, así que el `<h1>` es el del ejercicio. «Editar» y los
 * botones de dirección salen según `drillPermissions`, que solo muestra u oculta: lo que protege
 * es RLS y las Server Actions.
 *
 * «Añadir a sesión» sale a quien gestiona sesiones (`practice.manage`) y solo en un ejercicio
 * publicado: un borrador no se ofrece a las sesiones de todo el equipo y un archivado ya no sale
 * en la biblioteca. Va debajo de todo el contenido, antes de los botones de dirección, y es
 * `secondary`: en esta pantalla el único primary posible es «Publicar», que no sale en un
 * publicado. Sus sesiones son las próximas de quien mira (`listPractices`), leídas aquí y solo
 * cuando se va a pintar; si no se pueden leer, lanza como el resto de lecturas de la ficha.
 */
export default async function DrillPage({ params }: PageProps<"/c/[club]/drills/[drillId]">) {
  const { club, drillId } = await params;
  const ctx = await requireClub(club);

  const drill = await getDrill(ctx, drillId);
  if (!drill) notFound();

  const base = `/c/${ctx.org.slug}`;
  const perms = drillPermissions(ctx, drill);
  const objective = drill.objective?.trim();
  const setup = drill.setupMd?.trim();
  const upcoming =
    can(ctx, "practice.manage") && drill.status === "published"
      ? await listPractices(ctx, "upcoming", new Date().toISOString())
      : null;

  return (
    <>
      <TopNavigation
        variant="detail"
        title="Ejercicio"
        backHref={`${base}/drills`}
        action={perms.edit ? { label: "Editar", href: `${base}/drills/${drill.id}/edit` } : undefined}
      />

      <div className="flex flex-col gap-(--space-6) px-(--space-4)">
        <div className="flex flex-col gap-(--space-3)">
          {/* `tabIndex={-1}`: tras publicar o archivar, `DrillAdminActions` le lleva el foco desde el
              código (ver allí por qué); no entra en el orden del tabulador. */}
          <h1
            id={DRILL_TITLE_ID}
            tabIndex={-1}
            className="font-display text-display-l wrap-break-word uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            {drill.title}
          </h1>
          <StatusNotice status={drill.status} />
          <MetaPills header={drillHeader(drill)} />
        </div>

        <CourtDiagram src={drill.diagramUrl} alt={`Diagrama de ${drill.title}`} />

        {objective ? (
          <Section title="Objetivo">
            <p className="text-body-l wrap-break-word">{objective}</p>
          </Section>
        ) : null}

        {setup ? (
          <Section title="Organización">
            <MarkdownBody markdown={setup} />
          </Section>
        ) : null}

        {drill.coachingPoints.length > 0 ? (
          <Section title="Coaching points">
            <CoachingPointsList points={drill.coachingPoints} />
          </Section>
        ) : null}

        {drill.standards.length > 0 ? (
          <StandardsSection
            title={standardsLabel(ctx.branding.terminology)}
            clubSlug={ctx.org.slug}
            standards={drill.standards}
          />
        ) : null}

        {drill.principles.length > 0 ? (
          <PrinciplesSection
            clubSlug={ctx.org.slug}
            sectionSlug={drill.principlesSectionSlug}
            principles={drill.principles}
          />
        ) : null}

        {drill.variants.length > 0 ? <VariantsSection variants={drill.variants} /> : null}

        {drill.equipment.length > 0 ? <EquipmentSection equipment={drill.equipment} /> : null}

        {drill.videoUrl ? <VideoSection url={drill.videoUrl} /> : null}

        {upcoming ? (
          <AddToPractice
            clubSlug={ctx.org.slug}
            drillId={drill.id}
            practices={upcoming.practices}
            teamCount={upcoming.teamCount}
          />
        ) : null}

        <DrillAdminActions
          clubSlug={ctx.org.slug}
          drillId={drill.id}
          canPublish={perms.publish}
          canArchive={perms.archive}
        />
      </div>
    </>
  );
}
