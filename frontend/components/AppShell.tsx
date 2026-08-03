"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";

function HamburgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="3" y1="5" x2="17" y2="5" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="15" x2="17" y2="15" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">

      {/* ── Desktop sidebar (lg+) — always visible in normal flow ── */}
      <div className="hidden lg:block flex-shrink-0">
        <Sidebar />
      </div>

      {/* ── Mobile sidebar drawer ── */}
      {open && (
        <>
          {/* Scrim */}
          <div
            className="fixed inset-0 z-40 lg:hidden"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <Sidebar onClose={() => setOpen(false)} />
          </div>
        </>
      )}

      {/* ── Content column ── */}
      <div className="flex flex-1 min-w-0 flex-col">
        {/* Mobile top bar */}
        <header
          className="sticky top-0 z-30 flex items-center border-b px-4 h-14 lg:hidden"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
        >
          <button
            onClick={() => setOpen(true)}
            className="mr-3 rounded-md p-1.5 transition-colors"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Open menu"
          >
            <HamburgerIcon />
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
