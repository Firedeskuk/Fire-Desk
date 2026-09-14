"use client";

import RouteGuard from "@/components/shared/RouteGuard";
import { FIELD_INSPECTOR_ROLES } from "@/lib/local/session";

/* Inspector screens. Managers and admins may open them too. */
export default function InspectorLayout({ children }: { children: React.ReactNode }) {
  return <RouteGuard allow={FIELD_INSPECTOR_ROLES}>{children}</RouteGuard>;
}
