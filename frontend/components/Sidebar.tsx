"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { GradientText } from "@/components/reactbits/GradientText";

type Role = "bd_executive" | "manager" | "admin";

const NAV_LINKS: { href: string; label: string; icon: React.ElementType; roles?: Role[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: ListChecks },
  { href: "/companies", label: "Companies", icon: Building2, roles: ["manager", "admin"] },
  { href: "/analytics", label: "Analytics", icon: BarChart3, roles: ["manager", "admin"] },
  { href: "/admin", label: "Admin", icon: ShieldCheck, roles: ["admin"] },
];

const ROLE_BADGE: Record<Role, { label: string; color: string; soft: string }> = {
  admin: { label: "Admin", color: "var(--status-critical)", soft: "var(--status-critical-soft)" },
  manager: { label: "Manager", color: "var(--series-1)", soft: "var(--series-1-soft)" },
  bd_executive: { label: "BD Executive", color: "var(--status-good)", soft: "var(--status-good-soft)" },
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
      className="sticky top-0 flex h-screen w-64 flex-shrink-0 flex-col overflow-y-auto border-r"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
    >
      {/* Logo + optional close button (mobile drawer) */}
      <div className="flex items-center justify-between px-5 pt-6 pb-5">
        <Link href="/dashboard" className="flex items-center gap-2.5" onClick={onClose}>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl text-white shadow-sm"
            style={{ background: "linear-gradient(135deg, var(--series-1), var(--accent-l))" }}
          >
            <Sparkles size={16} strokeWidth={2.25} />
          </span>
          <span>
            <span className="block font-display text-base font-bold tracking-tight">
              <GradientText animationSpeed={8}>LeadIntel</GradientText>
            </span>
            <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
              Account Intelligence
            </span>
          </span>
        </Link>
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1.5" style={{ color: "var(--text-muted)" }} aria-label="Close menu">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3">
        <div className="space-y-1">
          {visibleLinks.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className="relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium transition-all hover:bg-[var(--surface-2)]"
                style={{
                  color: isActive ? "var(--series-1)" : "var(--text-secondary)",
                  backgroundColor: isActive ? "var(--series-1-soft)" : "transparent",
                }}
              >
                {isActive && (
                  <span className="absolute inset-y-1.5 left-0 w-1 rounded-full" style={{ backgroundColor: "var(--series-1)" }} />
                )}
                <Icon size={17} strokeWidth={2} style={{ opacity: isActive ? 1 : 0.75 }} />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t px-3 py-4" style={{ borderColor: "var(--border)" }}>
        {badge && (
          <div className="mb-3 px-1">
            <span
              className="inline-block rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ backgroundColor: badge.soft, color: badge.color }}
            >
              {badge.label}
            </span>
          </div>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors hover:border-[var(--series-1)]"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  );
}

