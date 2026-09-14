import type { NextConfig } from "next";
import { randomUUID } from "node:crypto";
import withSerwistInit from "@serwist/next";
import { FIELD_SHELLS, FIELD_STATIC_PAGES } from "./lib/fieldRoute";

/*
  @serwist/next runs as a webpack plugin, so the build script uses
  "next build --webpack". Development keeps the service worker disabled.

  The field route shells (one prerendered page per field route, placeholder
  id "_") and the top level field pages are precached, so the installed app
  opens any door or work item offline. A fresh revision per build makes the
  worker refetch them after every deploy.
*/
const revision = randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [...FIELD_SHELLS, ...FIELD_STATIC_PAGES].map((url) => ({ url, revision })),
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withSerwist(nextConfig);
