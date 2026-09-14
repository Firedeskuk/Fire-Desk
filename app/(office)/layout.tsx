"use client";

import RouteGuard from "@/components/shared/RouteGuard";
import OfficeHeader from "@/components/office/OfficeHeader";
import { OFFICE_ROLES } from "@/lib/local/session";

/*
  Office route group: laptop, online. Manager and admin only. Screens here
  may call Supabase directly through lib/supabase, they are still client
  components to keep one simple data path.
*/
export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  return (
    <RouteGuard allow={OFFICE_ROLES}>
      <OfficeHeader />
      <main className="page">{children}</main>
    </RouteGuard>
  );
}
