"use client";

/*
  Route ids for field pages. Reads them from the real browser URL, so a page
  served from its offline shell (placeholder id "_") still knows which
  building, door, finding or work item it shows. Falls back to usePathname()
  and useParams() for anything the location does not carry.
*/

import { useParams, usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { parseFieldPath, SHELL_ID } from "./fieldRoute";

function subscribeLocation(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function readLocation(): string {
  return window.location.pathname;
}

function serverLocation(): string | null {
  return null;
}

export function useFieldParams<T extends Record<string, string>>(): T {
  const routerPath = usePathname() ?? "";
  const browserPath = useSyncExternalStore(subscribeLocation, readLocation, serverLocation);
  const params = (useParams() ?? {}) as Record<string, string | string[] | undefined>;

  const fromBrowser = browserPath ? parseFieldPath(browserPath) : {};
  const fromRouter = parseFieldPath(routerPath);

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = Array.isArray(v) ? v.join("/") : (v ?? "");
  }
  for (const source of [fromRouter, fromBrowser]) {
    for (const [k, v] of Object.entries(source)) {
      if (v && v !== SHELL_ID) out[k] = v;
    }
  }
  return out as T;
}
