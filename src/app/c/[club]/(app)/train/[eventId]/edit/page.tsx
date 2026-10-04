import { notFound, redirect } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { isoToLocalInputs } from "@/lib/time";
import { getFocusAreas } from "@/modules/drills/queries";
import { sessionMinutes } from "@/modules/practice/items";
import { getPractice, getPracticeFormOptions } from "@/modules/practice/queries";
import { PracticeEditor } from "../../_components/practice-editor";

/**
 * El constructor de una sesión de entrenamiento: la pantalla en la que quien entrena la monta
 * (`PracticeEditor`).
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Una sesión que no existe, que es de otro club o de otro equipo (RLS no la deja ver)
 * da el mismo 404: `getPractice` devuelve `null` en los tres casos. Quien la ve pero no
 * gestiona sesiones recibe ese mismo 404. `can` solo decide lo que se pinta: lo que protege de
 * verdad es RLS y cada acción.
 *
 * Una sesión hecha o cancelada no se edita: quien gestiona sesiones va a su detalle, donde
 * puede duplicarla. Se mira después del permiso: a quien no lo tiene no se le dice ni eso.
 *
 * Los datos del formulario de «Fecha y datos» se calculan aquí, en el servidor: la fecha y la
 * hora en la zona del club (regla 7: nunca la del dispositivo) y la duración de la franja, que
 * no es la suma de los ejercicios. Los objetivos del club para el selector de ejercicios salen de
 * la biblioteca (`getFocusAreas`, con su slug, que es lo que filtra la búsqueda), no de las
 * opciones del formulario, que no lo llevan. Si algo no se puede leer, lanza y lo recoge
 * `error.tsx`.
 */
export default async function EditPracticePage({ params }: PageProps<"/c/[club]/train/[eventId]/edit">) {
  const { club, eventId } = await params;
  const ctx = await requireClub(club);

  const practice = await getPractice(ctx, eventId);
  if (!practice) notFound();
  if (!can(ctx, "practice.manage")) notFound();
  if (practice.status !== "scheduled") redirect(`/c/${ctx.org.slug}/train/${practice.eventId}`);

  const [options, drillFocusAreas] = await Promise.all([getPracticeFormOptions(ctx), getFocusAreas(ctx)]);

  return (
    <PracticeEditor
      clubSlug={ctx.org.slug}
      practice={practice}
      options={options}
      drillFocusAreas={drillFocusAreas}
      initialValues={{
        teamId: practice.teamId,
        title: practice.title,
        ...isoToLocalInputs(practice.startsAt, ctx.org.timezone),
        // Sin ítems, `sessionMinutes` da lo que dura la franja.
        durationMinutes: String(sessionMinutes([], practice.startsAt, practice.endsAt)),
        primaryFocusId: practice.primaryFocus?.id ?? "",
        secondaryFocusId: practice.secondaryFocus?.id ?? "",
        location: practice.location ?? "",
        notes: practice.notes ?? "",
      }}
    />
  );
}
