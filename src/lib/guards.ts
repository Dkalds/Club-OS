import { notFound } from "next/navigation";
import { getClubContext, type ClubContext } from "@/modules/tenancy/queries";
import { can } from "./permissions";

/**
 * El club de la URL, o el 404 opaco: el mismo si el club no existe y si la persona no es
 * miembro. Para páginas y Server Actions (`notFound()` lanza, así que no devuelve `null`).
 *
 * Los dos guards de este archivo se llaman fuera de cualquier `try`: como lanzan, un `catch`
 * se tragaría el 404 y la página seguiría adelante con lo que no debe.
 */
export async function requireClub(slug: string): Promise<ClubContext> {
  const ctx = await getClubContext(slug);
  if (!ctx) notFound();
  return ctx;
}

/** Solo administración entra: el resto recibe el mismo 404 que un club inexistente. */
export function requireAdmin(ctx: ClubContext): void {
  if (!can(ctx, "admin.access")) notFound();
}
