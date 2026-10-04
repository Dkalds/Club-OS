import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { getDrillFormOptions } from "@/modules/drills/queries";
import { standardsLabel } from "@/modules/tenancy/navigation";
import { TopNavigation } from "@/ui/top-navigation";
import { DrillForm } from "../drill-form";

/**
 * El formulario de un ejercicio nuevo: título, jugadores, duración, edades, objetivos y el resto,
 * y «Guardar borrador». Un ejercicio nace siempre en borrador, a nombre de quien lo crea; el
 * diagrama se añade después, al editarlo (su carpeta es la del ejercicio, que aún no existe).
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Quien no puede crear ejercicios (`drill.create`: la dirección y el entrenador) recibe
 * el mismo 404 que un club que no existe, y no se lee nada del club. `can` solo evita llegar
 * hasta aquí: lo que protege es RLS y la acción de crear. Si Supabase falla al leer lo que se
 * puede elegir, lanza y lo recoge `error.tsx`; mientras llega, se ve `loading.tsx`.
 *
 * La cabecera de detalle es lo primero del contenido: el marco oculta entonces la de marca (ver
 * `TopNavigation`). Su título es un `<p>`, así que el `<h1>` de la pantalla va aparte, solo para
 * lectores de pantalla (la cabecera ya dice «Nuevo ejercicio» a quien ve).
 */
export default async function NewDrillPage({ params }: PageProps<"/c/[club]/drills/new">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  if (!can(ctx, "drill.create")) notFound();

  const options = await getDrillFormOptions(ctx);

  return (
    <>
      <TopNavigation variant="detail" title="Nuevo ejercicio" backHref={`/c/${ctx.org.slug}/drills`} />

      <div className="flex flex-col gap-(--space-4) px-(--space-4)">
        <h1 className="sr-only">Nuevo ejercicio</h1>

        <DrillForm
          clubSlug={ctx.org.slug}
          mode="new"
          drill={null}
          options={options}
          standardsLabel={standardsLabel(ctx.branding.terminology)}
        />
      </div>
    </>
  );
}
