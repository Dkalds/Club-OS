"use client";

import { useEffect, useRef, useState } from "react";

export function useWakeLock(active: boolean): { supported: boolean; locked: boolean } {
  // `supported` empieza en `false` en el servidor y en el cliente (durante la hidratación).
  // useEffect lo actualiza después, evitando el error de hidratación #418.
  const [supported, setSupported] = useState(false);
  const [locked, setLocked] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    setSupported("wakeLock" in navigator);
  }, []);

  useEffect(() => {
    if (!supported || !active) return;

    let cancelled = false;

    async function request() {
      if (cancelled) return;
      try {
        lockRef.current = await navigator.wakeLock.request("screen");
        if (!cancelled) setLocked(true);
        lockRef.current.addEventListener("release", () => {
          if (!cancelled) setLocked(false);
        });
      } catch {
        setLocked(false);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void request();
    }

    void request();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
      setLocked(false);
    };
  }, [supported, active]);

  return { supported, locked };
}
