"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const LINKS: { href: string; label: string; roles?: Array<"manager" | "admin"> }[] = [
  { href: "/leads", label: "Leads" },
  { href: "/analytics", label: "Analytics", roles: ["manager", "admin"] },
];

export function NavBar() {
  const pathname = usePathname();
  const { role, logout } = useAuth();

  return (
    <nav className="border-b" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold">LeadIntel</span>
          <div className="flex gap-1">
            {LINKS.filter((link) => !link.roles || (role && link.roles.includes(role as "manager" | "admin"))).map(
              (link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    color: pathname.startsWith(link.href) ? "var(--text-primary)" : "var(--text-secondary)",
                    backgroundColor: pathname.startsWith(link.href) ? "var(--gridline)" : "transparent",
                  }}
                >
                  {link.label}
                </Link>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm" style={{ color: "var(--text-secondary)" }}>
          <span className="capitalize">{role?.replace("_", " ")}</span>
          <button onClick={logout} className="rounded-md border px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
