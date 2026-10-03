import { requireAdmin, requireClub } from "@/lib/guards";

export default async function AdminPrinciplesPage({
  params,
}: PageProps<"/c/[club]/admin/principles">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  requireAdmin(ctx);

  return <h1 className="font-display text-display-l uppercase">Principios</h1>;
}
