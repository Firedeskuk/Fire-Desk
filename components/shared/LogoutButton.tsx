"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, logoutBlockedMessage } from "@/lib/supabase/auth";
import { clearAll, countPending } from "@/lib/local";

type Props = {
  className?: string;
  /* full width button for the field settings section */
  block?: boolean;
};

/*
  Logs out. Blocked with "N changes are not yet sent. Sync first." while the
  outbox holds anything. On success local data is wiped and the user lands on
  the login page.
*/
export default function LogoutButton({ className, block }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onLogout() {
    setMessage(null);
    setBusy(true);
    try {
      const pendingCount = await countPending();
      if (pendingCount > 0) {
        setMessage(logoutBlockedMessage(pendingCount));
        return;
      }
      await signOut({ pendingCount, wipeLocal: clearAll });
      router.replace("/login");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Logout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={block ? "stack" : undefined}>
      <button
        type="button"
        className={`btn ${block ? "btn-block" : "btn-small"} ${className ?? ""}`}
        onClick={onLogout}
        disabled={busy}
      >
        Log out
      </button>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
