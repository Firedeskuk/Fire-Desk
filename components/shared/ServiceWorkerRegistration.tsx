"use client";

import { useEffect } from "react";

/*
  Registers the service worker built by @serwist/next (public/sw.js).
  Runs once on the client, does nothing in development or where service
  workers are not available.
*/
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // registration failure is not fatal, the app still works online
    });

    // Ask the browser to keep our data when storage gets tight (iOS, Android).
    if (navigator.storage && typeof navigator.storage.persist === "function") {
      navigator.storage.persist().catch(() => undefined);
    }
  }, []);

  return null;
}
