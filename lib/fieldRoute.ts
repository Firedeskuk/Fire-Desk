/*
  Field routes and their offline shells.

  Field pages are client components, so the HTML for /buildings/<any id> is
  the same document for every id. Next prerenders one copy of each route with
  the placeholder id "_" (see the generateStaticParams layouts under
  app/(field)), the service worker precaches those shells, and when the phone
  is offline and asks for a door it never opened before, the worker serves the
  matching shell. The page then reads the real ids from the URL, never from
  the placeholder params. Pure functions, no React, shared with app/sw.ts.
*/

export const SHELL_ID = "_";

/* Route pattern, shell URL and the names of the ids in order. */
export type FieldRoute = {
  pattern: RegExp;
  shell: string;
  keys: string[];
};

export const FIELD_ROUTES: FieldRoute[] = [
  {
    pattern: /^\/buildings\/([^/]+)\/assets\/([^/]+)\/?$/,
    shell: "/buildings/_/assets/_",
    keys: ["id", "assetId"],
  },
  {
    pattern: /^\/buildings\/([^/]+)\/findings\/([^/]+)\/?$/,
    shell: "/buildings/_/findings/_",
    keys: ["id", "findingId"],
  },
  {
    pattern: /^\/buildings\/([^/]+)\/floors\/([^/]+)\/?$/,
    shell: "/buildings/_/floors/_",
    keys: ["id", "floorId"],
  },
  {
    pattern: /^\/buildings\/([^/]+)\/?$/,
    shell: "/buildings/_",
    keys: ["id"],
  },
  {
    pattern: /^\/works\/([^/]+)\/items\/([^/]+)\/?$/,
    shell: "/works/_/items/_",
    keys: ["buildingId", "itemId"],
  },
  {
    pattern: /^\/works\/([^/]+)\/?$/,
    shell: "/works/_",
    keys: ["buildingId"],
  },
];

/* Every shell URL, for the precache list. */
export const FIELD_SHELLS: string[] = FIELD_ROUTES.map((r) => r.shell);

/* Top level field pages that are static already and must be precached too. */
export const FIELD_STATIC_PAGES: string[] = ["/buildings", "/works", "/login", "/offline", "/"];

/* The shell that can stand in for this pathname, or null when it is not a field route. */
export function shellFor(pathname: string): string | null {
  for (const r of FIELD_ROUTES) {
    if (r.pattern.test(pathname)) return r.shell;
  }
  if (pathname === "/buildings" || pathname === "/works") return pathname;
  return null;
}

/* Ids from the pathname, decoded. Empty object when it is not a field route. */
export function parseFieldPath(pathname: string): Record<string, string> {
  for (const r of FIELD_ROUTES) {
    const m = r.pattern.exec(pathname);
    if (m) {
      const out: Record<string, string> = {};
      r.keys.forEach((k, i) => {
        out[k] = safeDecode(m[i + 1]);
      });
      return out;
    }
  }
  return {};
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
