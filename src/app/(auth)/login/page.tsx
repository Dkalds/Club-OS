import type { Metadata } from "next";
import { demoRoles } from "@/modules/auth/demo-login";
import { DemoLogin } from "./demo-login";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entra en tu club · CLUB OS",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-(--content-max) flex-1 flex-col gap-(--space-6) px-(--space-4) py-(--space-12)">
      <p className="font-display text-title uppercase text-ink-2">CLUB OS</p>
      <h1 className="font-display text-display-l uppercase">Entra en tu club</h1>
      <LoginForm />
      {/* TEMPORAL: solo pinta algo si el servidor tiene las variables de demo. */}
      <DemoLogin roles={demoRoles()} />
    </main>
  );
}
