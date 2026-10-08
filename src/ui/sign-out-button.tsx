"use client";

import { type FormEvent, type ReactNode, useRef } from "react";
import { clearLiveData } from "@/modules/live/clear-live-data";

/**
 * Formulario de «Salir» que limpia los datos de Live del dispositivo antes de hacer POST
 * a `/auth/sign-out`. Los hijos deciden la apariencia del botón de envío.
 */
export function SignOutForm({ children }: { children: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await clearLiveData();
    formRef.current?.submit();
  }

  return (
    <form ref={formRef} action="/auth/sign-out" method="post" onSubmit={handleSubmit}>
      {children}
    </form>
  );
}
