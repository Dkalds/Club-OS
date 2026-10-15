"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { logError } from "@/lib/log";
import { CTAButton } from "@/ui/cta-button";

export default function LiveError({ error, reset }: { error: Error; reset: () => void }) {
  // La ficha de la sesión es esta misma ruta sin su último segmento (`/live`).
  const detailHref = usePathname().replace(/\/live\/?$/, "");

  useEffect(() => {
    logError("live.page", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-(--content-max) flex-col items-center justify-center gap-(--space-4) px-(--space-4) text-center">
      <p role="alert" className="text-body">
        No se pudo cargar el entrenamiento.
      </p>
      <CTAButton variant="primary" block onClick={reset}>
        Reintentar
      </CTAButton>
      <CTAButton variant="ghost" href={detailHref}>
        Volver a la sesión
      </CTAButton>
    </div>
  );
}
