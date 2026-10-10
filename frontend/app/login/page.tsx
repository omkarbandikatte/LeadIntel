"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";
import { BackButton } from "@/components/BackButton";
import { Aurora } from "@/components/reactbits/Aurora";
import { GradientText } from "@/components/reactbits/GradientText";
import { CountUp } from "@/components/reactbits/CountUp";
import { StarBorder } from "@/components/reactbits/StarBorder";

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
    <div className="lp-dark flex min-h-screen" style={{ backgroundColor: "var(--page-plane)" }}>

      {/* ── Left panel — 60% ──────────────────────────────── */}
      <div className="relative hidden overflow-hidden lg:block" style={{ flex: "0 0 60%", backgroundColor: "var(--page-plane)" }}>
        <Image
          src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=1400&q=85"
          alt="Team collaborating"
          fill
          priority
          className="object-cover opacity-60 mix-blend-luminosity"
        />
        <div className="absolute inset-0 opacity-70"><Aurora colors={["var(--series-1)", "var(--accent-l)", "var(--status-good)"]} speed={18} /></div>
        <div className="lp-grid-overlay absolute inset-0" />
        {/* Dark gradient overlay for text contrast */}
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, rgba(7,8,10,0.45) 0%, rgba(7,8,10,0.92) 100%)" }} />

        {/* Content overlay */}
        <div className="absolute inset-0 flex flex-col justify-between p-12">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-bold text-white tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <Sparkles size={16} />
            </span>
            LeadIntel
          </Link>

          {/* Quote / tagline */}
          <div>
            <blockquote className="font-display text-2xl font-semibold leading-snug text-white">
              <GradientText colors={["#ffffff", "var(--accent-l)", "#ffffff"]} animationSpeed={6}>
                Know which company to pitch —
              </GradientText>
              <br />before your competitors do.
            </blockquote>
            <p className="mt-4 text-sm text-white opacity-70">
              AI-powered B2B lead scoring for Cloud Counselage&apos;s BD team.
              Firmographic fit · Intent signals · ML conversion probability.
            </p>

            {/* Stats row */}
            <div className="mt-8 flex gap-8">
              {[
                { to: 85, suffix: "+", separator: "", l: "Companies tracked" },
                { to: 6700, suffix: "+", separator: ",", l: "Deals analysed" },
                { to: 4, suffix: "", separator: "", l: "Service lines ranked" },
              ].map(({ to, suffix, separator, l }) => (
                <div key={l}>
                  <div className="font-display text-2xl font-bold text-white">
                    <CountUp to={to} suffix={suffix} separator={separator} duration={1.6} />
                  </div>
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
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg, var(--series-1), var(--accent-l))" }}
          >
            <Sparkles size={16} />
          </span>
          <Link href="/" className="font-display text-xl font-bold tracking-tight">LeadIntel</Link>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <BackButton />
            <h1 className="font-display text-2xl font-bold tracking-tight">Sign in</h1>
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
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
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
                  className="w-full rounded-xl border px-3 py-2.5 pr-10 text-sm outline-none transition-colors focus:ring-2"
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
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm" style={{ color: "var(--status-critical)" }}>
                {error}
              </p>
            )}

            <StarBorder color="var(--series-1)" speed="4s" className="w-full">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold shadow-sm transition-transform hover:scale-[1.01] disabled:opacity-60"
                style={{ backgroundColor: "var(--series-1)", color: "var(--on-accent)" }}
              >
                {isSubmitting ? "Signing in…" : "Sign in"}
              </button>
            </StarBorder>
          </form>

          <p className="mt-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
            New company?{" "}
            <Link href="/signup" className="font-medium" style={{ color: "var(--series-1)" }}>
              Set up your own lead intelligence workspace
            </Link>
          </p>
        </div>
      </div>

    </div>
  );
}

