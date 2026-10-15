import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getConsentStatus } from "@/modules/consents/queries";
import { getClubContext, type ClubContext } from "@/modules/tenancy/queries";
import { can } from "./permissions";

/**
 * El club de la URL, o el 404 opaco: el mismo si el club no existe y si la persona no es
 * miembro. Para páginas y Server Actions (`notFound()` lanza, así que no devuelve `null`).
 *
 * `requireClub` y `requireAdmin` se llaman fuera de cualquier `try`: como lanzan, un `catch`
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

/**
 * Los términos generales bloquean el acceso ([D7]): toda cuenta sin un consentimiento de
 * términos para este club va a `/consent` y no puede saltárselo, ni con la URL directa. Se
 * llama desde el marco de cada área (y desde `adminPage`, que además protege cada página de
 * Gestión por su cuenta, igual que `requireAdmin`).
 */
export async function requireTerms(ctx: ClubContext): Promise<void> {
  const { needsTerms } = await getConsentStatus(ctx);
  if (needsTerms) redirect(`/c/${ctx.org.slug}/consent`);
}

/**
 * Una página de Gestión: `export default adminPage(async (ctx, params) => …)`.
 *
 * Antes de ejecutar nada de la página resuelve el club de la URL y comprueba que quien entra
 * lo administra; si no, el 404 de siempre. La página recibe el contexto ya comprobado y los
 * parámetros de su ruta: no tiene forma de leer datos antes del guard, ni de olvidarlo.
 * `pnpm check:guards` exige que cada `page.tsx` de `/admin` se exporte así.
 *
 * Va en cada página y no solo en el layout de Gestión porque un layout no protege a sus
 * páginas: Next puede pintar una página sin volver a ejecutar su layout.
 */
export function adminPage<P extends { club: string }>(
  render: (ctx: ClubContext, params: P) => ReactNode | Promise<ReactNode>,
): (props: { params: Promise<P> }) => Promise<ReactNode> {
  return async function AdminPage({ params }) {
    const resolved = await params;
    const ctx = await requireClub(resolved.club);
    requireAdmin(ctx);
    await requireTerms(ctx);
    return render(ctx, resolved);
  };
}
