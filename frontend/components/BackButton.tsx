"use client";

import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      title="Go back"
      className="mb-5 inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors"
      style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "transparent" }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 5 7 9 3" />
      </svg>
    </button>
  );
}
