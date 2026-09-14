/*
  Service worker source, compiled by @serwist/next into public/sw.js.

  Precaches the app shell (everything Next emits plus the field route shells
  listed in next.config.ts) and caches same origin GET requests at runtime,
  so the installed app opens with zero network.

  Field routes such as /buildings/<id>/assets/<assetId> are client rendered,
  so one prerendered shell per route (placeholder id "_") can stand in for
  any id. When a navigation fails offline, the matching shell is served and
  the page reads the real ids from the URL (lib/useFieldParams.ts).

  Supabase calls are never cached here: the field app talks to lib/local,
  and lib/sync goes to the network on purpose.
*/

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist, StaleWhileRevalidate } from "serwist";
import { shellFor } from "@/lib/fieldRoute";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist: Serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // pages: try the network, fall back to the last cached copy, then to the
      // route shell for field pages
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "firedesk-pages",
        networkTimeoutSeconds: 4,
        plugins: [
          {
            handlerDidError: async ({ request }): Promise<Response | undefined> => {
              const url = new URL(request.url);
              const shell = shellFor(url.pathname);
              if (!shell) return undefined;
              const cached: Response | undefined = await serwist.matchPrecache(shell);
              if (cached) return cached;
              const runtime: Response | undefined = await caches.match(shell);
              return runtime;
            },
          },
        ],
      }),
    },
    {
      // everything else from our own origin: static files, chunks, icons,
      // RSC payloads for client side navigation
      matcher: ({ request, sameOrigin }) => sameOrigin && request.method === "GET",
      handler: new StaleWhileRevalidate({
        cacheName: "firedesk-static",
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
