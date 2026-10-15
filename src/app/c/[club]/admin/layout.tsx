import { requireAdmin, requireClub, requireTerms } from "@/lib/guards";
import { adminNavItems } from "@/modules/tenancy/navigation";
import { AdminShell } from "@/ui/admin-shell";

/**
 * Marco de Gestión, el área de dirección. Los colores del club los pone `../layout.tsx`.
 *
 * Quien no administra recibe el mismo 404 que un club inexistente, pintado por
 * `../not-found.tsx` con su propio `<main>` y sin el marco de ninguna área: Gestión no se
 * anuncia a quien no puede entrar.
 *
 * Un layout no protege a sus páginas (Next puede pintar una página sin volver a ejecutar
 * su layout): cada página de Gestión hace la misma comprobación por su cuenta, exportándose
 * con `adminPage` (`pnpm check:guards` lo exige), y los datos los protege RLS.
 */
export default async function AdminLayout({ children, params }: LayoutProps<"/c/[club]/admin">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  requireAdmin(ctx);
  await requireTerms(ctx);

  return (
    <AdminShell
      brandName={ctx.branding.displayName}
      clubSlug={ctx.org.slug}
      items={adminNavItems(ctx.org.slug, ctx.branding.terminology)}
    >
      {children}
    </AdminShell>
  );
}
