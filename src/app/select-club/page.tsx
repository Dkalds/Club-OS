import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/ui/avatar";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { ListRow } from "@/ui/list-row";
import { SignOutForm } from "@/ui/sign-out-button";
import { EmptyState } from "@/ui/states";

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

  const { data: auth, error: authError } = await supabase.auth.getClaims();
  if (authError) logError("select-club.session", authError);
  const userId = auth?.claims.sub;
  if (!userId) redirect("/login");

  const { data, error } = await supabase
    .from("memberships")
    .select("organization:organizations!inner(slug, name)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) {
    logError("select-club.memberships", error);
    throw new Error("No se han podido leer los clubes de la cuenta.");
  }

  return data
    .flatMap(({ organization }) =>
      organization ? [{ slug: organization.slug, name: organization.name }] : [],
    )
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

const mainClass =
  "mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-(--space-6) px-(--space-4) py-(--space-12)";

/**
 * El selector de club: adónde llega quien entra.
 *
 * Con un solo club salta a él. Con varios, una fila por club. Sin ninguno, el aviso y la
 * salida. Está fuera de cualquier club: la marca es la de plataforma y las filas no llevan
 * colores de ningún club, solo sus iniciales.
 *
 * Si no se pueden leer los clubes, `listClubs` lanza y lo recoge `src/app/error.tsx`.
 */
export default async function SelectClubPage() {
  const clubs = await listClubs();

  if (clubs.length === 1) redirect(`/c/${clubs[0].slug}`);

  if (clubs.length === 0) {
    return (
      <main className={mainClass}>
        <p className="font-display text-title uppercase text-ink-2">CLUB OS</p>
        {/* El estado vacío es toda la pantalla: su título es el `<h1>`. */}
        <EmptyState
          headingLevel={1}
          title="Tu cuenta no tiene acceso a ningún club"
          body="Si crees que es un error, pide una nueva invitación a tu club."
        />
        {/* La salida no es un enlace: cerrar sesión es un POST. */}
        <SignOutForm>
          <CTAButton variant="primary" block type="submit">
            Salir
          </CTAButton>
        </SignOutForm>
      </main>
    );
  }

  return (
    <main className={mainClass}>
      <p className="font-display text-title uppercase text-ink-2">CLUB OS</p>
      <h1 className="font-display text-display-l uppercase">Tus clubes</h1>
      <Card variant="flush" as="ul">
        {/* Las filas (`<li>`) van directas dentro de la lista: pintan sus separadores. */}
        {clubs.map((club) => (
          <ListRow
            key={club.slug}
            href={`/c/${club.slug}`}
            // Decorativas: el nombre ya está escrito al lado.
            lead={
              <span aria-hidden="true" className="flex">
                <Avatar name={club.name} />
              </span>
            }
            title={club.name}
          />
        ))}
      </Card>
    </main>
  );
}
