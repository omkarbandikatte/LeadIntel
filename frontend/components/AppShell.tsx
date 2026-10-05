"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen" style={{ backgroundColor: "var(--page-plane)" }}>
      <div className="app-ambient-bg" aria-hidden />

      {/* ── Desktop sidebar (lg+) — always visible in normal flow ── */}
      <div className="hidden lg:block flex-shrink-0">
        <Sidebar />
      </div>

      {/* ── Mobile sidebar drawer ── */}
      {open && (
        <>
          {/* Scrim */}
          <div
            className="fixed inset-0 z-40 lg:hidden animate-fade-in"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden animate-fade-in-left">
            <Sidebar onClose={() => setOpen(false)} />
          </div>
        </>
      )}

      {/* ── Content column ── */}
      <div className="flex flex-1 min-w-0 flex-col">
        {/* Mobile top bar */}
        <header
          className="sticky top-0 z-30 flex items-center border-b px-4 h-14 lg:hidden backdrop-blur"
          style={{ borderColor: "var(--border)", backgroundColor: "rgba(var(--surface-1-rgb), 0.85)" }}
        >
          <button
            onClick={() => setOpen(true)}
            className="mr-3 rounded-md p-1.5 transition-colors"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-bold tracking-tight">LeadIntel</span>
        </header>

        {/* Page content fades in on mount */}
        <div className="animate-fade-in flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}

