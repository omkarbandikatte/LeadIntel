"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import { BackButton } from "@/components/BackButton";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--page-plane)" }}>

      {/* ── Left panel — 60% ──────────────────────────────── */}
      <div className="relative hidden lg:block" style={{ flex: "0 0 60%" }}>
        <Image
          src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=1400&q=85"
          alt="Team collaborating"
          fill
          className="object-cover"
          priority
        />
        {/* Dark gradient overlay */}
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, rgba(11,11,11,0.65) 0%, rgba(42,120,214,0.55) 100%)" }} />

        {/* Content overlay */}
        <div className="absolute inset-0 flex flex-col justify-between p-12">
          {/* Logo */}
          <Link href="/" className="text-lg font-bold text-white tracking-tight">
            LeadIntel
          </Link>

          {/* Quote / tagline */}
          <div>
            <blockquote className="text-2xl font-semibold leading-snug text-white">
              &quot;Know which company to pitch —<br />before your competitors do.&quot;
            </blockquote>
            <p className="mt-4 text-sm text-white opacity-70">
              AI-powered B2B lead scoring for Cloud Counselage&apos;s BD team.
              Firmographic fit · Intent signals · ML conversion probability.
            </p>

            {/* Stats row */}
            <div className="mt-8 flex gap-8">
              {[
                { v: "85+", l: "Companies tracked" },
                { v: "6,700+", l: "Deals analysed" },
                { v: "4", l: "Service lines ranked" },
              ].map(({ v, l }) => (
                <div key={l}>
                  <div className="text-2xl font-bold text-white">{v}</div>
                  <div className="text-xs text-white opacity-60 mt-0.5">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel — 40% ──────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 lg:px-14"
        style={{ backgroundColor: "var(--page-plane)" }}>

        {/* Mobile logo (hidden on desktop where left panel shows it) */}
        <div className="mb-8 lg:hidden">
          <Link href="/" className="text-xl font-bold tracking-tight">LeadIntel</Link>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <BackButton />
            <h1 className="text-2xl font-semibold">Sign in</h1>
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              B2B Lead Intelligence &amp; Conversion Prediction
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-md border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
                style={{
                  borderColor: "var(--border)",
                  backgroundColor: "var(--surface-1)",
                  // @ts-expect-error custom property
                  "--tw-ring-color": "var(--series-1)",
                }}
                placeholder="bd.exec@cloudcounselage.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="password">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-md border px-3 py-2.5 pr-10 text-sm outline-none transition-colors focus:ring-2"
                  style={{
                    borderColor: "var(--border)",
                    backgroundColor: "var(--surface-1)",
                    // @ts-expect-error custom property
                    "--tw-ring-color": "var(--series-1)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    /* Eye icon — password visible, click to hide */
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    /* Eye-off icon — password hidden, click to show */
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "var(--series-1)" }}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            Don&apos;t have an account?{" "}
            <span style={{ color: "var(--text-secondary)" }}>Contact your admin to create one.</span>
          </p>
        </div>
      </div>

    </div>
  );
}

