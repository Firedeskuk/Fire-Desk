"use client";

import SyncBoot from "@/components/field/SyncBoot";

/*
  Field route group: phone, offline first. Every screen under here is a
  client component that reads and writes lib/local only. SyncBoot installs
  the sync triggers once for the whole group.
*/
export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SyncBoot />
      {children}
    </>
  );
}
