"use client";

import { useEffect } from "react";
import { installSyncTriggers } from "@/lib/sync/triggers";

/*
  Mounted once in the field layout. Installs the sync triggers (online,
  foreground, 60 s timer) and removes them when the layout unmounts.
*/
export default function SyncBoot() {
  useEffect(() => {
    const uninstall = installSyncTriggers();
    return uninstall;
  }, []);
  return null;
}
