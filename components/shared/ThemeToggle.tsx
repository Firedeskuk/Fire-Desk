"use client";

import { useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribePrefs, type Theme } from "@/lib/local/prefs";

type Props = {
  className?: string;
};

function serverSnapshot(): Theme {
  return "cream";
}

/*
  Cream and dark switch. Reads the stored choice through an external store
  subscription (no setState in effects), writes it back on every tap and
  flips data-theme on <html>. Used in the office header and in the field
  settings section.
*/
export default function ThemeToggle({ className }: Props) {
  const theme = useSyncExternalStore(subscribePrefs, getTheme, serverSnapshot);

  function toggle() {
    const next: Theme = theme === "dark" ? "cream" : "dark";
    setTheme(next);
  }

  return (
    <button
      type="button"
      className={`btn btn-small ${className ?? ""}`}
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to cream theme" : "Switch to dark theme"}
    >
      {theme === "dark" ? "Cream" : "Dark"}
    </button>
  );
}
