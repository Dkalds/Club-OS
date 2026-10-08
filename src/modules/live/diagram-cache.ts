"use client";

import type { LiveSession } from "./types";

function cacheName(eventId: string): string {
  return `clubos-live-${eventId}`;
}

function cacheKey(eventId: string, itemId: string): string {
  return `/live-cache/${eventId}/${itemId}`;
}

export async function cacheDiagrams(session: LiveSession): Promise<void> {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(cacheName(session.eventId));
  await Promise.all(
    session.items.map(async (item) => {
      if (!item.diagramUrl) return;
      try {
        const response = await fetch(item.diagramUrl);
        await cache.put(cacheKey(session.eventId, item.id), response);
      } catch {
        // Red no disponible: se continúa sin el diagrama en caché
      }
    }),
  );
}

export async function diagramSrc(eventId: string, itemId: string): Promise<string | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(cacheName(eventId));
    const response = await cache.match(cacheKey(eventId, itemId));
    if (!response) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function clearDiagrams(eventId: string): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    await caches.delete(cacheName(eventId));
  } catch {
    /* nada */
  }
}

const MAX_CACHE_AGE_MS = 7 * 24 * 3600 * 1000;

export async function pruneDiagramCaches(nowMs: number): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith("clubos-live-"))
        .map(async (name) => {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          if (keys.length === 0) return;
          const first = keys[0];
          if (!first) return;
          const res = await cache.match(first.url);
          if (!res) return;
          const dateHeader = res.headers.get("date");
          if (!dateHeader) return;
          const age = nowMs - new Date(dateHeader).getTime();
          if (age > MAX_CACHE_AGE_MS) {
            await caches.delete(name);
          }
        }),
    );
  } catch {
    /* nada */
  }
}
