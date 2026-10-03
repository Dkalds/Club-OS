import { notFound } from "next/navigation";
import { getClubContext } from "@/modules/tenancy/queries";

/** Inicio del club. Provisional: la pantalla de verdad llega con la Task 11. */
export default async function ClubHomePage({ params }: PageProps<"/c/[club]">) {
  const { club } = await params;
  if (!(await getClubContext(club))) notFound();

  return (
    <div className="px-(--space-4) pt-(--space-6)">
      <h1 className="font-display text-display-l uppercase">Inicio</h1>
    </div>
  );
}
