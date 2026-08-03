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

// Simple inline SVG icons (stroke-based, 20×20 viewBox)
const ICONS: Record<string, React.ReactNode> = {
  "/dashboard": (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="7" height="7" rx="1" />
      <rect x="11" y="2" width="7" height="7" rx="1" />
      <rect x="2" y="11" width="7" height="7" rx="1" />
      <rect x="11" y="11" width="7" height="7" rx="1" />
    </svg>
  ),
  "/leads": (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="5" x2="17" y2="5" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="15" x2="13" y2="15" />
    </svg>
  ),
  "/companies": (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 18V7l6-4 6 4v11" />
      <path d="M4 18h12" />
      <rect x="8" y="12" width="4" height="6" />
    </svg>
  ),
  "/analytics": (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="18" x2="17" y2="18" />
      <rect x="4" y="11" width="3" height="7" />
      <rect x="9" y="6" width="3" height="12" />
      <rect x="14" y="2" width="3" height="16" />
    </svg>
  ),
  "/admin": (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
    </svg>
  ),
};

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const { role, logout } = useAuth();

  const visibleLinks = NAV_LINKS.filter(
    (link) => !link.roles || (role && link.roles.includes(role as Role))
  );
  const badge = role ? ROLE_BADGE[role as Role] : null;

  return (
    <aside
      className="sticky top-0 flex h-screen w-56 flex-shrink-0 flex-col overflow-y-auto border-r"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
    >
      {/* Logo + optional close button (mobile drawer) */}
      <div className="flex items-center justify-between px-5 pt-6 pb-5">
        <div>
          <Link href="/dashboard" className="block text-base font-bold tracking-tight" onClick={onClose}>
            LeadIntel
          </Link>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>B2B Intelligence</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1.5" style={{ color: "var(--text-muted)" }} aria-label="Close menu">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="3" x2="13" y2="13" /><line x1="13" y1="3" x2="3" y2="13" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3">
        <div className="space-y-0.5">
          {visibleLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  backgroundColor: isActive ? "var(--gridline)" : "transparent",
                  borderLeft: isActive ? "2px solid var(--series-1)" : "2px solid transparent",
                }}
              >
                <span style={{ opacity: isActive ? 1 : 0.6 }}>
                  {ICONS[link.href]}
                </span>
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t px-3 py-4" style={{ borderColor: "var(--border)" }}>
        {badge && (
          <div className="mb-2 px-1">
            <span
              className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{ backgroundColor: "var(--gridline)", color: badge.color }}
            >
              {badge.label}
            </span>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full rounded-md border px-3 py-1.5 text-left text-sm transition-colors"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
