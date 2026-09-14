"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/settings/pricing", label: "Pricing" },
  { href: "/settings/templates", label: "Templates" },
  { href: "/settings/users", label: "Users" },
];

/* Second level navigation for the settings pages. */
export default function SettingsNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="nav" aria-label="Settings sections" style={{ marginBottom: 12 }}>
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={pathname.startsWith(l.href) ? "is-active" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
