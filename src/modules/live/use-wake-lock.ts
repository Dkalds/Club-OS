"use client";

import { useEffect, useRef, useState } from "react";

export function useWakeLock(active: boolean): { supported: boolean; locked: boolean } {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const [locked, setLocked] = useState(false);
  const lockRef = useRef<WakeLockSentinel | null>(null);

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
