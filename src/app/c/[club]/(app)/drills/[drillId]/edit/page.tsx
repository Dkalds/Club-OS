import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { drillPermissions } from "@/modules/drills/permissions";
import { getDrill, getDrillFormOptions } from "@/modules/drills/queries";
import { standardsLabel } from "@/modules/tenancy/navigation";
import { TopNavigation } from "@/ui/top-navigation";
import { DrillForm } from "../../drill-form";

/**
 * El formulario para editar un ejercicio: parte de lo guardado y «Guardar cambios». Sirve igual
 * a un borrador del entrenador que a un ejercicio publicado que corrige la dirección; guardar no
 * cambia el estado (publicar y archivar son de la ficha).
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Un id que no es un uuid, un ejercicio que no existe, uno de otro club, un borrador
 * ajeno y un ejercicio publicado visto por un entrenador (que no lo edita: `drillPermissions`)
 * dan EXACTAMENTE el mismo 404 que un club que no existe: nada dice que exista. `drillPermissions`
 * solo evita enseñar el formulario: lo que protege es RLS y las acciones. Lo que se puede
 * elegir se lee después de comprobar que se puede editar. Si Supabase falla, las consultas lanzan
 * y lo recoge `error.tsx`; mientras llegan, se ve `loading.tsx`.
 *
 * La cabecera de detalle es lo primero del contenido (ver `TopNavigation`) y vuelve a la ficha.
 * Su título es un `<p>`, así que el `<h1>` va aparte, solo para lectores de pantalla.
 */
export default async function EditDrillPage({ params }: PageProps<"/c/[club]/drills/[drillId]/edit">) {
  const { club, drillId } = await params;
  const ctx = await requireClub(club);

  const drill = await getDrill(ctx, drillId);
  if (!drill || !drillPermissions(ctx, drill).edit) notFound();

  const options = await getDrillFormOptions(ctx);

  return (
    <>
      <TopNavigation
        variant="detail"
        title="Editar ejercicio"
        backHref={`/c/${ctx.org.slug}/drills/${drill.id}`}
      />

      <div className="flex flex-col gap-(--space-4) px-(--space-4)">
        <h1 className="sr-only">Editar ejercicio</h1>

        <DrillForm
          clubSlug={ctx.org.slug}
          mode="edit"
          drill={drill}
          options={options}
          standardsLabel={standardsLabel(ctx.branding.terminology)}
        />
      </div>
    </>
  );
}
