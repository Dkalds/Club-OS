import { notFound } from "next/navigation";
import { requireClub } from "@/lib/guards";
import { drillPermissions } from "@/modules/drills/permissions";
import { getDrill } from "@/modules/drills/queries";
import { TopNavigation } from "@/ui/top-navigation";
import { BoardEditor } from "./_components/board-editor";

/**
 * El editor de la pizarra de un ejercicio: dibujarla desde cero o cambiar la que tiene.
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. La abre quien puede editar el ejercicio (`drillPermissions`: la dirección, y quien
 * entrena en un borrador propio). Un id que no es un uuid, un ejercicio que no existe, uno de
 * otro club, un borrador ajeno y un publicado visto por un entrenador dan EXACTAMENTE el mismo
 * 404: nada dice que exista. `drillPermissions` solo evita enseñar el editor: lo que protege es
 * RLS y la acción de guardar. Si Supabase falla, `getDrill` lanza y lo recoge `error.tsx`.
 *
 * La cabecera de detalle es lo primero del contenido (ver `TopNavigation`) y vuelve a la ficha.
 * Su título es un `<p>`, así que el `<h1>` va aparte, solo para lectores de pantalla, con el
 * nombre del ejercicio: la pantalla no lo repite a la vista.
 *
 * El editor recibe la pizarra ya validada (`drill.board`, o `null` si no tiene o si la que
 * tiene no cumple la forma) y la copia del ejercicio con la que guardará. Lleva el ejercicio
 * como clave: pasar de uno a otro parte de cero.
 */
export default async function DrillBoardPage({ params }: PageProps<"/c/[club]/drills/[drillId]/board">) {
  const { club, drillId } = await params;
  const ctx = await requireClub(club);

  const drill = await getDrill(ctx, drillId);
  if (!drill || !drillPermissions(ctx, drill).edit) notFound();

  return (
    <>
      <TopNavigation variant="detail" title="Pizarra" backHref={`/c/${ctx.org.slug}/drills/${drill.id}`} />

      <div className="flex flex-col gap-(--space-4) px-(--space-4)">
        <h1 className="sr-only">{`Pizarra de ${drill.title}`}</h1>
        <p className="text-body-strong wrap-break-word">{drill.title}</p>

        <BoardEditor
          key={drill.id}
          clubSlug={ctx.org.slug}
          drillId={drill.id}
          title={drill.title}
          initialBoard={drill.board ?? null}
          expectedUpdatedAt={drill.updatedAt}
        />
      </div>
    </>
  );
}
