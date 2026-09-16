/*
  Small per device preferences kept in localStorage.
  Everything that touches browser storage lives under lib/local, so that a
  native shell can swap the implementation later without touching screens.
*/

export type Theme = "cream" | "dark";

const THEME_KEY = "firedesk.theme";

type Listener = () => void;
const listeners = new Set<Listener>();

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function readPref(key: string): string | null {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null): void {
  const s = storage();
  if (!s) return;
  try {
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // storage full or blocked, the preference simply does not persist
  }
  notify();
}

/* Subscribe to preference changes, for useSyncExternalStore. */
export function subscribePrefs(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTheme(): Theme {
  return readPref(THEME_KEY) === "dark" ? "dark" : "cream";
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  writePref(THEME_KEY, theme);
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/*
  Inline script text for the root layout. It runs before the first paint so
  the page never flashes cream when the user chose dark. Kept as a string so
  it can be injected with dangerouslySetInnerHTML from a server component.
*/
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});document.documentElement.setAttribute('data-theme',t==='dark'?'dark':'cream');}catch(e){document.documentElement.setAttribute('data-theme','cream');}})();`;
