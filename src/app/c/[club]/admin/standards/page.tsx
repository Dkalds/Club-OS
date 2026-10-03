import { requireAdmin, requireClub } from "@/lib/guards";
import { standardsLabel } from "@/modules/tenancy/navigation";

export default async function AdminStandardsPage({
  params,
}: PageProps<"/c/[club]/admin/standards">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  requireAdmin(ctx);

  return (
    <h1 className="font-display text-display-l uppercase">
      {standardsLabel(ctx.branding.terminology)}
    </h1>
  );
}
