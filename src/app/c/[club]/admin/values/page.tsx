import { requireAdmin, requireClub } from "@/lib/guards";

export default async function AdminValuesPage({ params }: PageProps<"/c/[club]/admin/values">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  requireAdmin(ctx);

  return <h1 className="font-display text-display-l uppercase">Valores</h1>;
}
