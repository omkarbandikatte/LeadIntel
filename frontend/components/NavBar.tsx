"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

type Role = "bd_executive" | "manager" | "admin";

const NAV_LINKS: { href: string; label: string; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads",     label: "Leads" },
  { href: "/companies", label: "Companies", roles: ["manager", "admin"] },
  { href: "/analytics", label: "Analytics",  roles: ["manager", "admin"] },
  { href: "/admin",     label: "Admin",       roles: ["admin"] },
];

const ROLE_BADGE: Record<Role, { label: string; color: string }> = {
  admin:        { label: "Admin",        color: "var(--status-critical)" },
  manager:      { label: "Manager",      color: "var(--series-1)" },
  bd_executive: { label: "BD Executive", color: "var(--status-good)" },
};

export function NavBar() {
  const pathname = usePathname();
  const { role, logout } = useAuth();

  const visibleLinks = NAV_LINKS.filter(
    (link) => !link.roles || (role && link.roles.includes(role as Role))
  );

  const badge = role ? ROLE_BADGE[role as Role] : null;

  return (
    <nav className="border-b" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="text-base font-bold tracking-tight">LeadIntel</Link>
          <div className="flex gap-0.5">
            {visibleLinks.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    backgroundColor: isActive ? "var(--gridline)" : "transparent",
                  }}>
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {badge && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: "var(--gridline)", color: badge.color }}>
              {badge.label}
            </span>
          )}
          <button
            onClick={logout}
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

