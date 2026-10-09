"use client";

import { useEffect } from "react";
import { logError } from "@/lib/log";

export default function LiveError({ error }: { error: Error }) {
  useEffect(() => {
    logError("live.page", error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-space-4 p-space-4">
      <p className="text-body-m">No se pudo cargar el entrenamiento.</p>
      <a href=".." className="text-body-s text-ink-2 underline">
        Volver
      </a>
    </div>
  );
}
