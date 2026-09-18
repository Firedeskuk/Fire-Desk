"use client";

/*
  True when the door screen was opened by a scan from another building
  (ScanQrButton adds ?scan=other to the URL). Read from the real browser
  location, like lib/useFieldParams, so it also works when the service worker
  served the offline shell.
*/

import { useSyncExternalStore } from "react";
import { SCAN_ARRIVAL_QUERY } from "./ScanQrButton";

function subscribe(listener: () => void): () => void {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

function read(): boolean {
  return window.location.search.slice(1).split("&").includes(SCAN_ARRIVAL_QUERY);
}

function serverRead(): boolean {
  return false;
}

export function useScanArrival(): boolean {
  return useSyncExternalStore(subscribe, read, serverRead);
}
