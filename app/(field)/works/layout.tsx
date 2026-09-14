"use client";

import RouteGuard from "@/components/shared/RouteGuard";
import { FIELD_REMEDIAL_ROLES } from "@/lib/local/session";

/*
  Remedial team screens. The remedial role never sees inspections or
  findings, not even in navigation. Managers and admins may open them too.
*/
export default function RemedialLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard allow={FIELD_REMEDIAL_ROLES}>{children}</RouteGuard>;
}
