"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/shared/ThemeToggle";
import LogoutButton from "@/components/shared/LogoutButton";
import { roleLabel, useLocalSession } from "@/lib/local/session";

const LINKS: { href: string; label: string; match: string }[] = [
  { href: "/dashboard", label: "Dashboard", match: "/dashboard" },
  { href: "/clients", label: "Clients", match: "/clients" },
  { href: "/office/buildings", label: "Buildings", match: "/office/buildings" },
  { href: "/projects", label: "Projects", match: "/projects" },
  { href: "/quotes", label: "Quotes", match: "/quotes" },
  { href: "/settings/pricing", label: "Settings", match: "/settings" },
];

/*
  Office header: brand, section links, user name and role, theme toggle,
  logout. Laptop first, wraps on a narrow window.
*/
export default function OfficeHeader() {
  const pathname = usePathname() ?? "";
  const profile = useLocalSession()?.profile ?? null;

  return (
    <header className="header">
      <div className="header-inner">
        <Link className="brand" href="/dashboard">
          Fire Desk
        </Link>
        <nav className="nav" aria-label="Sections">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={pathname.startsWith(l.match) ? "is-active" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="spacer" />
        <div className="row-sub" style={{ whiteSpace: "nowrap" }}>
          {profile ? `${profile.full_name}, ${roleLabel(profile.role)}` : ""}
        </div>
        <ThemeToggle />
        <LogoutButton />
      </div>
    </header>
  );
}
