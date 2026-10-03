import { requireAdmin, requireClub } from "@/lib/guards";
import { wayLabel } from "@/modules/tenancy/navigation";

export default async function AdminWayPage({ params }: PageProps<"/c/[club]/admin/way">) {
  const { club } = await params;
  const ctx = await requireClub(club);
  requireAdmin(ctx);

  return (
    <h1 className="font-display text-display-l uppercase">{wayLabel(ctx.branding.terminology)}</h1>
  );
}
