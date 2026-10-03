import { notFound } from "next/navigation";
import { navItems, type NavKey } from "@/modules/tenancy/navigation";
import { getClubContext } from "@/modules/tenancy/queries";

/**
 * Contenido provisional de una pestaña que todavía no tiene pantalla.
 *
 * El título usa la etiqueta de la pestaña, que sale de la terminología del club. La
 * Task 10 trae `EmptyState`; hasta entonces es texto plano con la misma composición.
 */
export async function ComingSoon({
  clubSlug,
  tab,
}: {
  clubSlug: string;
  tab: Exclude<NavKey, "home">;
}) {
  const context = await getClubContext(clubSlug);
  if (!context) notFound();

  const item = navItems(context.org.slug, context.branding.terminology).find(
    (candidate) => candidate.key === tab,
  );
  if (!item) notFound();

  return (
    <div className="flex flex-col items-center gap-(--space-3) px-(--space-6) py-(--space-12) text-center">
      <h1 className="font-display text-title uppercase">{item.label} llega en una próxima fase</h1>
      <p className="text-ink-2">Estamos preparando esta sección.</p>
    </div>
  );
}
