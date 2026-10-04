import { requireClub } from "@/lib/guards";
import { can } from "@/lib/permissions";
import { hasActiveFilters, parseDrillFilters } from "@/modules/drills/filters";
import { SEARCH_LIMIT } from "@/modules/drills/map-rows";
import { getFocusAreas, searchDrills } from "@/modules/drills/queries";
import { getPrinciples } from "@/modules/methodology/queries";
import type { ClubContext } from "@/modules/tenancy/queries";
import { Card } from "@/ui/card";
import { DrillCard } from "@/ui/drill-card";
import { SearchIcon, TrainIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";
import { TopNavigation } from "@/ui/top-navigation";
import { DrillFiltersBar } from "./filters-bar";

/**
 * El título del principio publicado con ese slug, o `null` si no hay filtro de principio o el
 * slug no es de un principio publicado (no existe, o está en borrador). La barra de filtros
 * enseña entonces el slug: el filtro sigue puesto aunque no se sepa nombrarlo.
 */
async function principleTitleOf(ctx: ClubContext, slug: string | undefined): Promise<string | null> {
  if (slug === undefined) return null;

  const principles = await getPrinciples(ctx);

  return principles.find((principle) => principle.slug === slug)?.title ?? null;
}

/**
 * «3 ejercicios», «1 ejercicio». Si hay más de los que trae la búsqueda no es el total, y no se
 * dice como si lo fuera; con justo 100 coincidencias sí lo es.
 */
function countLine(count: number, hasMore: boolean): string {
  if (hasMore) return `Mostrando los primeros ${SEARCH_LIMIT} ejercicios`;

  return count === 1 ? "1 ejercicio" : `${count} ejercicios`;
}

/**
 * La biblioteca de ejercicios del club: buscador, filtros y la lista, ordenada por título.
 *
 * La página pide el contexto ella misma, antes de leer nada: un layout no protege a sus
 * páginas. Los filtros salen de la URL (`parseDrillFilters` nunca lanza: lo que no vale se
 * ignora) y la barra (`DrillFiltersBar`, lo único de cliente) los cambia con `router.replace`.
 * Qué ejercicios existen para quien mira lo decide RLS: un borrador solo lo ven su autor y la
 * dirección, y un jugador o una familia no ven ninguno; para ellos la pantalla es el estado
 * vacío, sin acción de crear. Si los datos no se pueden leer, las consultas lanzan y lo recoge
 * `error.tsx`; mientras llegan, se ve `loading.tsx`.
 *
 * La cabecera de detalle es lo primero del contenido: el marco oculta entonces la de marca (ver
 * `TopNavigation`). Su título es un `<p>`, así que el `<h1>` de la pantalla va aparte, solo para
 * lectores de pantalla (la cabecera ya dice «Biblioteca» a quien ve). `can` solo muestra u
 * oculta «Nuevo»: lo que protege es RLS y la acción de crear.
 */
export default async function DrillsPage({ params, searchParams }: PageProps<"/c/[club]/drills">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  const base = `/c/${ctx.org.slug}`;

  const filters = parseDrillFilters(await searchParams);
  const [{ drills, hasMore }, focusAreas, principleTitle] = await Promise.all([
    searchDrills(ctx, filters),
    getFocusAreas(ctx),
    principleTitleOf(ctx, filters.principle),
  ]);

  const canCreate = can(ctx, "drill.create");

  return (
    <>
      <TopNavigation
        variant="detail"
        title="Biblioteca"
        backHref={`${base}/train`}
        action={canCreate ? { label: "Nuevo", href: `${base}/drills/new` } : undefined}
      />

      <div className="flex flex-col gap-(--space-4) px-(--space-4)">
        <h1 className="sr-only">Biblioteca de ejercicios</h1>

        <DrillFiltersBar filters={filters} focusAreas={focusAreas} principleTitle={principleTitle} />

        {/* Siempre en el árbol: un aviso que aparece con su texto puesto no siempre se lee.
            Sin ejercicios solo lo oyen los lectores de pantalla; a la vista queda el estado vacío. */}
        <p role="status" className={drills.length > 0 ? "text-body-s text-ink-2" : "sr-only"}>
          {countLine(drills.length, hasMore)}
        </p>

        {drills.length > 0 ? (
          <Card variant="flush">
            {/* Las filas van directas dentro de la card: así pinta sus separadores. */}
            {drills.map((drill) => (
              <DrillCard key={drill.id} drill={drill} href={`${base}/drills/${drill.id}`} />
            ))}
          </Card>
        ) : hasActiveFilters(filters) ? (
          <EmptyState
            icon={<SearchIcon size={28} />}
            title="No hay ejercicios con estos filtros"
            body="Prueba con otra búsqueda o con menos filtros."
            action={{ label: "Quitar filtros", href: `${base}/drills` }}
          />
        ) : (
          <EmptyState
            icon={<TrainIcon size={28} />}
            title="Aún no hay ejercicios"
            body={
              canCreate
                ? "Crea el primero para empezar la biblioteca del club."
                : "Los ejercicios del club los gestiona el cuerpo técnico."
            }
            action={
              canCreate
                ? { label: "Nuevo ejercicio", href: `${base}/drills/new` }
                : { label: "Volver a Inicio", href: base }
            }
          />
        )}
      </div>
    </>
  );
}
