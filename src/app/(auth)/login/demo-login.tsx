"use client";

import { useActionState } from "react";
import { demoLogin, type DemoLoginState } from "@/modules/auth/actions";
import type { DemoRole } from "@/modules/auth/demo-login";
import { CTAButton } from "@/ui/cta-button";

const INITIAL: DemoLoginState = {};

// Sin «entrar» en el nombre: los e2e buscan el botón del código por ese texto.
const LABEL: Record<DemoRole, string> = {
  coach: "Probar como entrenador",
  admin: "Probar como dirección",
};

/**
 * Acceso de demo (TEMPORAL, ver `modules/auth/demo-login.ts`): un botón por rol que entra
 * como su usuario de ejemplo, sin código. La página solo lo pinta con los roles que el
 * servidor tiene configurados; el botón envía el rol y el servidor decide la cuenta.
 */
export function DemoLogin({ roles }: { roles: DemoRole[] }) {
  const [state, action, pending] = useActionState(demoLogin, INITIAL);

  if (roles.length === 0) return null;

  return (
    <section className="flex flex-col gap-(--space-3)">
      <h2 className="text-label uppercase text-ink-2">Demo</h2>
      <p className="text-body-s text-ink-2">Entra sin código con un usuario de ejemplo.</p>
      {roles.map((role) => (
        <form key={role} action={action}>
          <input type="hidden" name="role" value={role} />
          <CTAButton type="submit" variant="secondary" block disabled={pending}>
            {LABEL[role]}
          </CTAButton>
        </form>
      ))}
      {state.error ? (
        <p role="alert" className="text-body-s text-danger">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
