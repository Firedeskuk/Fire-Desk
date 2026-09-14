"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getLocalSession, roleHome } from "@/lib/local/session";

/*
  Root route. Sends a signed in user to the home of their role and everyone
  else to the login page. Reads the local session only, so it works offline.
*/
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const session = getLocalSession();
    router.replace(session ? roleHome(session.profile.role) : "/login");
  }, [router]);

  return (
    <main className="page-narrow center">
      <p className="muted">Loading Fire Desk</p>
    </main>
  );
}
