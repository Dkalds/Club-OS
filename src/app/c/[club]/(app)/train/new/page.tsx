import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { defaultSessionDate } from "@/lib/time";
import { DEFAULT_SESSION_MINUTES, DEFAULT_SESSION_TIME } from "@/modules/practice/limits";
import { getPracticeFormOptions } from "@/modules/practice/queries";
import { noTeamsState } from "@/modules/team/no-teams";
import { BackLink } from "@/ui/back-link";
import { TeamIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { PracticeForm } from "../_components/practice-form";

/**
 * Nueva sesión de entrenamiento: el formulario con sus datos (equipo, cuándo, duración,
 * objetivos y lugar). Los ejercicios se añaden después, en el constructor.
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Quien no gestiona sesiones recibe el mismo 404 que un club ajeno. Qué equipos se
 * ofrecen lo decide `getPracticeFormOptions` (RLS limita el resto): sin ninguno, el aviso de
 * que aún no está en un equipo, con su salida. Si las opciones no se pueden leer, lanza y lo
 * recoge `error.tsx`.
 *
 * Los valores de partida se calculan aquí, en el servidor: el primer equipo, la hora y la
 * duración con las que se propone un entrenamiento, y el día. El día es hoy en la zona del club
 * (regla 7: nunca la del dispositivo) o, si esa hora ya ha pasado, mañana (`defaultSessionDate`):
 * una sesión creada sin tocar la fecha no nace en el pasado, directa al histórico. `can` solo
 * protege lo que se ve: lo que protege de verdad es RLS y la acción de crear.
 */
export default async function NewPracticePage({ params }: PageProps<"/c/[club]/train/new">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  if (!can(ctx, "practice.manage")) notFound();

  const options = await getPracticeFormOptions(ctx);
  const trainHref = `/c/${ctx.org.slug}/train`;
  const [firstTeam] = options.teams;

  return (
    <div className="flex flex-col gap-(--space-6) px-(--space-4) pt-(--space-2)">
      <BackLink href={trainHref} label="Entrenar" />

      <h1 className="font-display text-display-l uppercase">Nueva sesión</h1>

      {firstTeam ? (
        <PracticeForm
          clubSlug={ctx.org.slug}
          options={options}
          initial={{
            teamId: firstTeam.id,
            title: "",
            date: defaultSessionDate(new Date().toISOString(), ctx.org.timezone, DEFAULT_SESSION_TIME),
            time: DEFAULT_SESSION_TIME,
            durationMinutes: String(DEFAULT_SESSION_MINUTES),
            primaryFocusId: "",
            secondaryFocusId: "",
            location: "",
            notes: "",
          }}
        />
      ) : (
        <EmptyState
          icon={<TeamIcon size={28} />}
          {...noTeamsState(ctx.membership.role, ctx.org.slug, "new-session")}
        />
      )}
    </div>
  );
}
