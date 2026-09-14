"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { UserRole } from "@/lib/supabase/types";
import { getLocalSession, roleHome, subscribeSession, type LocalSession } from "@/lib/local/session";

type Props = {
  /* Roles that may see this part of the app. */
  allow: UserRole[];
  children: React.ReactNode;
};

function serverSnapshot(): LocalSession | null {
  return null;
}

function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

/*
  Client side route guard. Reads the local session (no network, works
  offline) and redirects: no session goes to /login, a role that does not
  belong in this route group goes to its own home. Children render only when
  the role is allowed.
*/
export default function RouteGuard({ allow, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useHydrated();
  const session = useSyncExternalStore(subscribeSession, getLocalSession, serverSnapshot);

  const role = session?.profile.role ?? null;
  const allowed = role !== null && allow.includes(role);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
      return;
    }
    if (!allowed) {
      router.replace(roleHome(session.profile.role));
    }
  }, [hydrated, session, allowed, pathname, router]);

  if (!hydrated || !session || !allowed) {
    return (
      <main className="page-narrow center">
        <p className="muted">Checking your session</p>
      </main>
    );
  }

  return <>{children}</>;
}
