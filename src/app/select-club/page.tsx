import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Depende de la sesión: nunca se prerenderiza ni se comparte entre usuarios.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tus clubes · CLUB OS",
};

type Club = { slug: string; name: string };

/**
 * Clubes en los que la persona tiene una membresía activa.
 *
 * RLS deja leer la propia membresía aunque esté revocada, y a quien administra un club
 * le deja leer las de todo el club. Por eso la consulta filtra por usuario y por estado,
 * y solo cuenta un club si su fila de `organizations` llega de verdad (`!inner`).
 */
async function listClubs(): Promise<Club[]> {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub;
  if (!userId) redirect("/login");

  const { data, error } = await supabase
    .from("memberships")
    .select("organization:organizations!inner(slug, name)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw new Error("No se han podido leer los clubes de la cuenta.");

  return data
    .flatMap(({ organization }) =>
      organization ? [{ slug: organization.slug, name: organization.name }] : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

const mainClass =
  "mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-(--space-6) px-(--space-4) py-(--space-12)";

export default async function SelectClubPage() {
  const clubs = await listClubs();

  if (clubs.length === 1) redirect(`/c/${clubs[0].slug}`);

  if (clubs.length === 0) {
    return (
      <main className={mainClass}>
        <p className="font-display text-title uppercase text-ink-2">CLUB OS</p>
        <div className="flex flex-col gap-(--space-3)">
          <h1 className="font-display text-display-m uppercase">
            Tu cuenta no tiene acceso a ningún club
          </h1>
          <p className="text-ink-2">
            Si crees que es un error, pide una nueva invitación a tu club.
          </p>
        </div>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="flex min-h-(--target-min) w-full items-center justify-center rounded-md bg-brand-accent px-(--space-5) font-display text-body-l font-bold uppercase tracking-[0.04em] text-brand-on-accent active:bg-brand-accent-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            Salir
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className={mainClass}>
      <p className="font-display text-title uppercase text-ink-2">CLUB OS</p>
      <h1 className="font-display text-display-l uppercase">Tus clubes</h1>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1">
        {clubs.map((club) => (
          <li key={club.slug}>
            {/* El foco va por dentro: la card recorta lo que sobresale. */}
            <Link
              href={`/c/${club.slug}`}
              className="flex min-h-(--target-min) items-center px-(--space-4) py-(--space-4) text-body-strong active:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
            >
              {club.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
