import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { defaultSessionDate } from "@/lib/time";
import { templateSubtitle } from "@/modules/practice/format";
import {
  DEFAULT_SESSION_MINUTES,
  DEFAULT_SESSION_TIME,
  MAX_SESSION_MINUTES,
  MIN_SESSION_MINUTES,
} from "@/modules/practice/limits";
import { getPracticeFormOptions, getTeamDefaults } from "@/modules/practice/queries";
import { getTemplate } from "@/modules/practice/template-queries";
import { noTeamsState } from "@/modules/team/no-teams";
import { BackLink } from "@/ui/back-link";
import { Card } from "@/ui/card";
import { TeamIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { PracticeForm } from "../_components/practice-form";
import { TemplateDelete } from "../_components/template-delete";

/**
 * Nueva sesión de entrenamiento: el formulario con sus datos (equipo, cuándo, duración,
 * objetivos y lugar) y, al final, sus dos caminos: proponer un entrenamiento o empezar desde
 * cero. Los ejercicios se montan después, en el constructor.
 *
 * Con `?template={id}` la sesión sale de una plantilla propia: el formulario trae su título y
 * sus objetivos, dura lo que suman sus ejercicios y tiene un solo botón, «Crear sesión», que la
 * crea con esos ejercicios ya guardados. Debajo, «Borrar plantilla». Una plantilla que no existe,
 * que es de otra persona o de otro club da el mismo 404 (`getTemplate`).
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Quien no gestiona sesiones recibe el mismo 404 que un club ajeno. Qué equipos se
 * ofrecen lo decide `getPracticeFormOptions` (RLS limita el resto): sin ninguno, el aviso de
 * que aún no está en un equipo, con su salida. Si las opciones no se pueden leer, lanza y lo
 * recoge `error.tsx`.
 *
 * Los valores de partida se calculan aquí, en el servidor: el equipo (el activo o el primero),
 * y la hora, la duración y el lugar de la última sesión de ese equipo (`getTeamDefaults`; las
 * 18:00, 75 minutos y sin lugar si no tiene ninguna). El día es hoy en la zona del club (regla
 * 7: nunca la del dispositivo) o, si esa hora ya ha pasado, mañana (`defaultSessionDate`): una
 * sesión creada sin tocar la fecha no nace en el pasado, directa al histórico. `can` solo
 * protege lo que se ve: lo que protege de verdad es RLS y la acción de crear.
 */
export default async function NewPracticePage({ params, searchParams }: PageProps<"/c/[club]/train/new">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  if (!can(ctx, "practice.manage")) notFound();

  const { template: templateParam } = await searchParams;
  const template = typeof templateParam === "string" ? await getTemplate(ctx, templateParam) : null;
  if (templateParam !== undefined && template === null) notFound();

  const options = await getPracticeFormOptions(ctx);
  const trainHref = `/c/${ctx.org.slug}/train`;
  const [firstTeam] = options.teams;
  // El equipo activo, si hay uno elegido; si no, el primero.
  const teamId = options.defaultTeamId ?? firstTeam?.id;
  const teamDefaults = await getTeamDefaults(ctx, options.teams);
  const defaults = (teamId === undefined ? undefined : teamDefaults[teamId]) ?? {
    time: DEFAULT_SESSION_TIME,
    durationMinutes: DEFAULT_SESSION_MINUTES,
    location: null,
  };
  // Una plantilla dura lo que suman sus ejercicios, si cabe en lo que se puede programar.
  const durationMinutes =
    template && template.totalMinutes >= MIN_SESSION_MINUTES && template.totalMinutes <= MAX_SESSION_MINUTES
      ? template.totalMinutes
      : defaults.durationMinutes;

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-2)">
      <BackLink
        href={template ? `${trainHref}?scope=templates` : trainHref}
        label={template ? "Plantillas" : "Sesiones"}
      />

      <h1 className="font-display text-display-l uppercase">Nueva sesión</h1>

      {template ? (
        <Card>
          <p className="text-label text-ink-2 uppercase">Plantilla</p>
          <p className="text-body-strong wrap-break-word">{template.title}</p>
          <p className="text-body-s text-ink-2">{templateSubtitle(template)}</p>
        </Card>
      ) : null}

      {teamId !== undefined ? (
        <PracticeForm
          // Con la plantilla como clave: pasar de una a otra, o a ninguna, parte de cero.
          key={template?.id ?? "blank"}
          clubSlug={ctx.org.slug}
          options={options}
          template={template ? { id: template.id } : undefined}
          teamDefaults={teamDefaults}
          initial={{
            teamId,
            title: template?.title ?? "",
            date: defaultSessionDate(new Date().toISOString(), ctx.org.timezone, defaults.time),
            time: defaults.time,
            durationMinutes: String(durationMinutes),
            primaryFocusId: template?.primaryFocus?.id ?? "",
            secondaryFocusId: template?.secondaryFocus?.id ?? "",
            location: defaults.location ?? "",
            notes: "",
          }}
        />
      ) : (
        <EmptyState
          icon={<TeamIcon size={28} />}
          {...noTeamsState(ctx.membership.role, ctx.org.slug, "new-session")}
        />
      )}

      {template ? <TemplateDelete clubSlug={ctx.org.slug} templateId={template.id} /> : null}
    </div>
  );
}
