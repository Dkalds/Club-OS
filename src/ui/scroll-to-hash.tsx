"use client";

import { useEffect } from "react";

/**
 * El elemento que nombra el fragmento de una URL (`#principle-ataque`), o `null`. Se busca por
 * `id`, nunca con un selector construido con el texto de la URL (un `#1abc` o unas comillas lo
 * romperían). Como hace el navegador, primero el fragmento tal cual y luego decodificado; uno
 * mal codificado (`%E0%A4%A`) no lanza: solo queda el intento sin decodificar.
 */
function targetOf(hash: string): HTMLElement | null {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  if (fragment === "") return null;

  const ids = [fragment];
  try {
    const decoded = decodeURIComponent(fragment);
    if (decoded !== fragment) ids.push(decoded);
  } catch {
    // Mal codificado: no hay versión decodificada que probar.
  }

  for (const id of ids) {
    const element = document.getElementById(id);
    if (element) return element;
  }
  return null;
}

/**
 * Lleva la página al elemento que nombra el fragmento de la URL cuando el contenido llega
 * después de que el navegador haya dado por buena la carga.
 *
 * Al abrir una URL con ancla (recargar, abrirla en otra pestaña, un enlace compartido) el
 * navegador salta al destino mientras la página carga y deja de intentarlo cuando acaba. Las
 * páginas de The Way que tienen destinos (`#principle-{slug}`, `#standard-NN`) se transmiten tras
 * su `loading.tsx`: con la latencia de una base de datos real el esqueleto se pinta, la carga
 * termina y el contenido se destapa después (React retrasa unos 300 ms destapar un límite de
 * Suspense). Entonces nadie vuelve a mirar el fragmento y la persona se queda arriba, lejos de
 * lo que le han enlazado. Este componente va DENTRO del contenido de la página, no en un layout
 * (que se monta antes de que el destino exista), y cuando se monta hace ese salto.
 *
 * Hace el salto una sola vez, al montarse, y solo si la página sigue arriba del todo: si no, el
 * navegador (o Next, en una navegación dentro de la app) ya ha ido al destino, o la persona ya
 * ha seguido leyendo, y volver al ancla sería un tirón. Sin animación y sin mover el foco.
 * `scrollIntoView` respeta el `scroll-margin-top` del destino (`anchor-below-header`), así que la
 * cabecera fija no lo tapa. No hace nada sin fragmento o sin un elemento con ese id.
 *
 * No pinta nada.
 */
export function ScrollToHash() {
  useEffect(() => {
    const target = targetOf(window.location.hash);
    if (!target || window.scrollY > 0) return;

    target.scrollIntoView({ behavior: "instant", block: "start" });
  }, []);

  return null;
}
