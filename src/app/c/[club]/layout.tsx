import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { brandingToCssVars } from "@/modules/tenancy/branding";
import { getClubContext } from "@/modules/tenancy/queries";

// Depende de la sesión: nunca se prerenderiza ni se comparte entre usuarios.
export const dynamic = "force-dynamic";

/**
 * Marco de un club: resuelve el club de la URL y pinta su marca. Nada más: el marco de cada
 * área lo ponen los layouts de dentro, `(app)/layout.tsx` (la app móvil del entrenador) y
 * `admin/layout.tsx` (Gestión).
 *
 * Si el club no existe o la persona no es miembro, `notFound()`: el mismo 404 en los dos
 * casos, pintado por `src/app/not-found.tsx`, fuera de este marco y sin nada del club.
 *
 * Si no se puede saber (Supabase no responde), `getClubContext` lanza y lo recoge
 * `src/app/error.tsx`, también fuera de este marco: lo que lanza un layout sube al límite
 * del segmento de arriba, no al `error.tsx` de su carpeta. Es la misma página de error para
 * cualquier club, sea de quien sea. Esta carpeta no tiene `error.tsx` propio: lo que lancen
 * los layouts de las dos áreas, que cuelgan de aquí, sube igual hasta ese.
 *
 * Un layout no protege a sus páginas (Next puede pintar una página sin volver a ejecutar
 * su layout): cada página bajo `/c/[club]` pide también el contexto, que con `cache()`
 * es la misma consulta, y los datos los protege RLS.
 */
export default async function ClubLayout({ children, params }: LayoutProps<"/c/[club]">) {
  const { club } = await params;
  const context = await getClubContext(club);
  if (!context) notFound();

  const { org, branding } = context;

  return (
    <div
      data-club={org.slug}
      // Los colores del club sustituyen a los de plataforma para todo lo que hay dentro.
      style={brandingToCssVars(branding.colors) as CSSProperties}
      className="flex flex-1 flex-col"
    >
      {children}
    </div>
  );
}
