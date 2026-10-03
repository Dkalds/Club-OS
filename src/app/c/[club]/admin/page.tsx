import { redirect } from "next/navigation";
import { requireAdmin, requireClub } from "@/lib/guards";

/** La raíz de Gestión no tiene contenido propio: lleva al primer apartado, la metodología. */
export default async function AdminPage({ params }: PageProps<"/c/[club]/admin">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  requireAdmin(ctx);

  redirect(`/c/${ctx.org.slug}/admin/way`);
}
