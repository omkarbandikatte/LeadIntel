"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: ReactNode;
  allowedRoles?: Array<"bd_executive" | "manager" | "admin">;
}) {
  const { token, role, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!token) {
      router.replace("/");
      return;
    }
    if (allowedRoles && role && !allowedRoles.includes(role)) {
      router.replace("/leads");
    }
  }, [isLoading, token, role, allowedRoles, router]);

  if (isLoading || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ color: "var(--text-secondary)" }}>
        Loading…
      </div>
    );
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return null;
  }

  return <>{children}</>;
}
