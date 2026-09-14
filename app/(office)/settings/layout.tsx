"use client";

import SettingsNav from "@/components/office/SettingsNav";

/* Settings pages share a title and a second level navigation. */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1>Settings</h1>
      <SettingsNav />
      {children}
    </>
  );
}
