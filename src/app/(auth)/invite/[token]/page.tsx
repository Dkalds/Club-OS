import type { Metadata } from "next";
import { CourtPlay } from "@/ui/court-play";
import { CTAButton } from "@/ui/cta-button";

export const metadata: Metadata = {
  title: "Te han invitado · CLUB OS",
};

/**
 * Estática: nadie tiene sesión todavía, y el token no es la frontera de seguridad (lo es
 * `create_invitation`/`accept_pending_invitations`, Fase 7 Task 1). No lee el token ni mira
 * si existe: solo explica el paso siguiente y enlaza a `/login`, sin el email relleno.
 * Nadie llega aquí por un email automático ([D15]): el enlace lo comparte dirección a mano.
 *
 * Misma composición que `/login` (`CourtPlay` arriba, texto y acción abajo) para no
 * desentonar entre una pantalla y la otra.
 */
export default function InvitePage() {
  return (
    <main
      data-court-scope
      className="mx-auto flex w-full flex-1 flex-col gap-(--space-6) pb-(--space-12) sm:max-w-(--content-max) sm:px-(--space-4) sm:pt-(--space-12) lg:grid lg:max-w-(--admin-content-max) lg:grid-cols-2 lg:content-center lg:items-center lg:gap-(--space-12)"
    >
      <div className="overflow-hidden border-b border-line bg-surface-1 pt-[env(safe-area-inset-top)] sm:rounded-lg sm:border sm:pt-0">
        <CourtPlay />
      </div>
      <div className="flex flex-col gap-(--space-6) px-(--space-4) sm:px-0">
        <div className="flex flex-col gap-(--space-2)">
          <p className="font-display text-title uppercase text-ink-2">CLUB OS</p>
          <h1 className="font-display text-display-xl uppercase">Te han invitado a un club</h1>
        </div>
        <p className="text-body text-ink-2">
          Entra con el email al que te han invitado. Te pedimos un código de un solo uso, nunca una
          contraseña.
        </p>
        <CTAButton variant="primary" block href="/login">
          Entrar
        </CTAButton>
      </div>
    </main>
  );
}
