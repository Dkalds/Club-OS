import type { Metadata } from "next";
import { demoRoles } from "@/modules/auth/demo-login";
import { CourtPlay } from "@/ui/court-play";
import { DemoLogin } from "./demo-login";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entra en tu club · CLUB OS",
};

/**
 * El acceso: arriba la pizarra (`CourtPlay`), debajo el título y el formulario. En el móvil la
 * pizarra va a sangre, hasta debajo de la barra de estado; desde `sm` es una card, y desde `lg`
 * se queda a la izquierda con el formulario a la derecha.
 *
 * `data-court-scope` une las dos mitades: el formulario marca su paso con `data-court-stage`
 * y la jugada lo sigue (ver `CourtPlay`).
 */
export default function LoginPage() {
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
          <h1 className="font-display text-display-xl uppercase">Entra en tu club</h1>
        </div>
        <LoginForm />
        {/* TEMPORAL: solo pinta algo si el servidor tiene las variables de demo. */}
        <DemoLogin roles={demoRoles()} />
      </div>
    </main>
  );
}
