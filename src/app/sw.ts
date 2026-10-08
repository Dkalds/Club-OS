/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { CacheFirst, NetworkFirst, NetworkOnly, Serwist } from "serwist";

const sw = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true, concurrency: 1 },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    // Live y documentos de sesión: red primero, caída en caché hasta 3 s
    {
      matcher: ({ url }) =>
        url.pathname.match(/^\/c\/[^/]+\/train\/[^/]+\/live/) !== null,
      handler: new NetworkFirst({ networkTimeoutSeconds: 3, cacheName: "documents-live" }),
    },
    // API y POST: nunca en caché
    {
      matcher: ({ url, request }) =>
        url.pathname.startsWith("/api/") || request.method !== "GET",
      handler: new NetworkOnly(),
    },
    // Auth: nunca en caché
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/login") || url.pathname.startsWith("/auth/"),
      handler: new NetworkOnly(),
    },
    // Todos los demás documentos (páginas Next): red primero
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkFirst({
        networkTimeoutSeconds: 3,
        cacheName: "documents",
      }),
    },
    // Estáticos Next.js (JS, CSS, fuentes): caché primero
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"),
      handler: new CacheFirst({ cacheName: "next-static" }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      { url: "/~offline", matcher: ({ request }) => request.destination === "document" },
    ],
  },
});

sw.addEventListeners();

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (string | { url: string; revision: string | null })[];
};
