"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* /settings has no content of its own, it opens the pricing page. */
export default function SettingsIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings/pricing");
  }, [router]);

  return <p className="muted">Loading</p>;
}
