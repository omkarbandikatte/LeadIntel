"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { FadeIn } from "@/components/FadeIn";
import { CountUp } from "@/components/reactbits/CountUp";
import { GradientText } from "@/components/reactbits/GradientText";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { ClickSpark } from "@/components/reactbits/ClickSpark";
import { Aurora } from "@/components/reactbits/Aurora";
import { StarBorder } from "@/components/reactbits/StarBorder";
import { TiltedCard } from "@/components/reactbits/TiltedCard";
import { Marquee } from "@/components/reactbits/Marquee";
import { Squares } from "@/components/reactbits/Squares";
import { Beams } from "@/components/reactbits/Beams";
import { Particles } from "@/components/reactbits/Particles";
import { Waves } from "@/components/reactbits/Waves";
import { DotGrid } from "@/components/reactbits/DotGrid";
import { PulseRings } from "@/components/reactbits/PulseRings";
import Hyperspeed from "@/components/Hyperspeed";

// Stable reference (module scope) so the WebGL scene isn't torn down and
// rebuilt on every re-render — Hyperspeed reinitializes whenever this object
// identity changes. Colors are mapped to the site's indigo/violet/green/amber palette.
const HYPERSPEED_OPTIONS = {
  onSpeedUp: () => {},
  onSlowDown: () => {},
  distortion: "turbulentDistortion",
  length: 400,
  roadWidth: 10,
  islandWidth: 2,
  lanesPerRoad: 4,
  fov: 90,
  fovSpeedUp: 150,
  speedUp: 2,
  carLightsFade: 0.4,
  totalSideLightSticks: 20,
  lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05,
  brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5] as [number, number],
  lightStickHeight: [1.3, 1.7] as [number, number],
  movingAwaySpeed: [60, 80] as [number, number],
  movingCloserSpeed: [-120, -160] as [number, number],
  carLightsLength: [400 * 0.03, 400 * 0.2] as [number, number],
  carLightsRadius: [0.05, 0.14] as [number, number],
  carWidthPercentage: [0.3, 0.5] as [number, number],
  carShiftX: [-0.8, 0.8] as [number, number],
  carFloorSeparation: [0, 5] as [number, number],
  colors: {
    roadColor: 0x070809,
    islandColor: 0x0a0b0d,
    background: 0x07080a,
    shoulderLines: 0x818cf8,
    brokenLines: 0x818cf8,
    leftCars: [0x818cf8, 0xc084fc, 0x34d399],
    rightCars: [0xc084fc, 0x818cf8, 0xfbbf24],
    sticks: 0x818cf8,
  },
};

// ─── tiny reusable primitives ────────────────────────────────────────────────

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-widest lp-glass"
      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
      <span className="h-1.5 w-1.5 rounded-full animate-pulse-soft" style={{ backgroundColor: "var(--series-1)" }} />
      {children}
    </span>
  );
}

function FeatureCard({ icon, title, body, big = false }: { icon: React.ReactNode; title: string; body: string; big?: boolean }) {
  return (
    <SpotlightCard
      className={`h-full rounded-2xl border p-6 ${big ? "sm:col-span-2 sm:row-span-1 lg:p-8" : ""}`}
      spotlightColor="var(--series-1-soft)"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl"
        style={{ backgroundColor: "var(--series-1-soft)", color: "var(--series-1)" }}>
        {icon}
      </div>
      <h3 className={`mb-2 font-display font-semibold ${big ? "text-xl" : "text-base"}`}>{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{body}</p>
    </SpotlightCard>
  );
}

function StatCard({ to, suffix = "", separator = "", label }: {
  to: number; suffix?: string; separator?: string; label: string;
}) {
  return (
    <div className="rounded-2xl border p-6 text-center lp-glass" style={{ borderColor: "var(--border)" }}>
      <div className="font-display text-4xl font-bold tabular-nums" style={{ color: "var(--series-1)" }}>
        <CountUp to={to} duration={1.8} suffix={suffix} separator={separator} />
      </div>
      <div className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}

function StepDot({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="relative flex gap-5 pb-10 last:pb-0">
      <span className="absolute left-[19px] top-10 bottom-0 w-px" style={{ backgroundColor: "var(--border)" }} />
      <div className="flex-shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold shadow-md"
          style={{ backgroundColor: "var(--series-1)", color: "var(--on-accent)", boxShadow: "0 0 0 4px var(--series-1-soft)" }}>{n}</div>
      </div>
      <div>
        <h4 className="mb-1 font-display font-semibold">{title}</h4>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{body}</p>
      </div>
    </div>
  );
}

// ─── icons ───────────────────────────────────────────────────────────────────

const IconSearch = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
  </svg>
);
const IconBrain = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M12 2a5 5 0 00-5 5v1a5 5 0 005 5 5 5 0 005-5V7a5 5 0 00-5-5z" />
    <path d="M7 8H4a2 2 0 00-2 2v2a2 2 0 002 2h1M17 8h3a2 2 0 012 2v2a2 2 0 01-2 2h-1M7 14v6M17 14v6M12 18v4" />
  </svg>
);
const IconTarget = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);
const IconChart = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);
const IconSync = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <polyline points="1 4 1 10 7 10" /><polyline points="23 20 23 14 17 14" />
    <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" />
  </svg>
);
const IconShield = () => (
  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconArrowRight = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);

// ─── page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Redirect already-authenticated users straight to the dashboard
  useEffect(() => {
    if (!isLoading && token) router.replace("/dashboard");
  }, [isLoading, token, router]);

  if (isLoading || token) return null;

  return (
    <ClickSpark sparkColor="var(--series-1)" className="lp-dark" style={{ backgroundColor: "var(--page-plane)", color: "var(--text-primary)" }}>

      {/* persistent animated backdrop behind the entire page (absolute, not fixed —
          position:fixed would escape this stacking context and render behind
          the opaque .lp-dark background instead of in front of it) */}
      <div className="absolute inset-0 z-0" style={{ backgroundColor: "var(--page-plane)" }}>
        <Aurora colors={["var(--series-1)", "var(--accent-l)", "var(--status-good)"]} speed={20} />
        <div className="lp-grid-overlay absolute inset-0" />
      </div>

      {/* ── Top Nav ─────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b lp-glass">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <span className="font-display text-lg font-bold tracking-tight">LeadIntel</span>
          <nav className="hidden items-center gap-8 text-sm sm:flex" style={{ color: "var(--text-secondary)" }}>
            <a href="#features" className="hover:text-current transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-current transition-colors">How it works</a>
            <a href="#service-lines" className="hover:text-current transition-colors">Service lines</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login"
              className="hidden rounded-full px-4 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 sm:inline-block"
              style={{ backgroundColor: "var(--series-1)", color: "var(--on-accent)" }}>
              Sign in
            </Link>
            <button
              type="button"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full sm:hidden"
              style={{ color: "var(--text-primary)" }}>
              {menuOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t px-4 py-3 text-sm sm:hidden"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <a href="#features" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white/5">Features</a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white/5">How it works</a>
            <a href="#service-lines" onClick={() => setMenuOpen(false)} className="rounded-lg px-2 py-2 hover:bg-white/5">Service lines</a>
            <Link href="/login" onClick={() => setMenuOpen(false)}
              className="mt-1 rounded-lg px-2 py-2 text-center font-medium"
              style={{ backgroundColor: "var(--series-1)", color: "var(--on-accent)" }}>
              Sign in
            </Link>
          </nav>
        )}
      </header>
      {/* spacer so page content clears the fixed header above */}
      <div className="h-16" aria-hidden />

      {/* ── Hero ────────────────────────────────────────── */}
      <section className="relative min-h-[640px] overflow-hidden sm:min-h-[760px]">
        {/* Hyperspeed (reactbits.dev) — scoped to this section only, not the whole page */}
        <div className="absolute inset-0 z-0"><Hyperspeed effectOptions={HYPERSPEED_OPTIONS} /></div>
        {/* scrim so the hero copy stays legible over the busy 3D background */}
        <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: "var(--hero-overlay)" }} />

        <div className="relative mx-auto max-w-4xl px-4 pt-16 pb-28 sm:px-6 sm:pt-24 sm:pb-40 text-center">
          <h1 className="font-accent text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Not every lead deserves a call.{" "}
            <GradientText colors={["var(--series-1)", "var(--accent-l)", "var(--series-1)"]} animationSpeed={6} className="italic">
              We&apos;ll tell you which ones do.
            </GradientText>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--text-secondary)" }}>
            LeadIntel scrapes firmographic signals, job postings, and press activity, then runs an ML scoring model
            to rank B2B leads by conversion probability and recommend the right Cloud Counselage service line for each company.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <StarBorder color="var(--series-1)" speed="4s">
              <Link href="/login"
                className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--series-1)", color: "var(--on-accent)" }}>
                Get started <IconArrowRight />
              </Link>
            </StarBorder>
            <a href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-lg border px-6 py-3 text-sm font-semibold transition-colors hover:bg-gridline"
              style={{ borderColor: "var(--border)" }}>
              See how it works
            </a>
          </div>
          <div className="mt-14">
            <Marquee
              items={["FastAPI", "Next.js", "XGBoost", "spaCy", "HuggingFace", "Celery", "PostgreSQL", "JWT Auth"]}
              speed={24}
            />
          </div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────── */}
      <section className="relative z-10 -mt-20 px-4 sm:-mt-24">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 sm:gap-6 sm:grid-cols-4">
          <StatCard to={85} suffix="+" label="Real companies tracked" />
          <StatCard to={6700} suffix="+" separator="," label="Historical deals analysed" />
          <StatCard to={0.74} label="Model ROC AUC (XGBoost)" />
          <StatCard to={4} label="Service lines ranked" />
        </div>
      </section>

      {/* ── Features ────────────────────────────────────── */}
      <section id="features" className="relative mx-auto max-w-6xl overflow-hidden px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-24">
        <div className="absolute inset-0 z-0 opacity-70"><Squares color="var(--series-1)" /></div>
        <div className="relative mb-12 text-center">
          <Badge>Features</Badge>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Everything your BD team needs to close faster</h2>
          <p className="mt-3 text-base" style={{ color: "var(--text-secondary)" }}>
            No paid APIs. No vendor lock-in. Open-source stack from ingestion to inference.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: <IconSearch />, title: "Automated company enrichment", body: "Scrapers pull job postings, press releases, and about-page text from target company websites. No manual research required.", big: true },
            { icon: <IconBrain />, title: "NLP intent detection", body: "spaCy + a local HuggingFace zero-shot classifier reads scraped text and predicts which service the company needs most — branding, hiring, L&D, or IAC partnership." },
            { icon: <IconTarget />, title: "ML conversion scoring", body: "An XGBoost classifier trained on historical won/lost deals outputs a 0-100 conversion probability. The model self-improves as your team closes more deals." },
            { icon: <IconChart />, title: "Live analytics dashboard", body: "Win rates by service line, score-band performance, industry breakdown, and model accuracy trend — all computed live from your pipeline data." },
            { icon: <IconSync />, title: "CRM sync loop", body: "Push scored leads to CSV for your CRM. Pull won/lost outcomes back to feed the retraining loop. Nightly Celery jobs keep scores fresh automatically." },
            { icon: <IconShield />, title: "Role-based access", body: "Three roles — BD Executive, Manager, Admin — each with the right level of access. JWT auth, bcrypt passwords, zero plain-text secrets." },
          ].map(({ icon, title, body, big }, i) => (
            <FadeIn key={title} delay={i * 80} className={big ? "sm:col-span-2 lg:col-span-1" : ""}>
              <FeatureCard icon={icon} title={title} body={body} big={big} />
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Dashboard screenshot ─────────────────────────── */}
      <section className="relative overflow-hidden border-y py-16 backdrop-blur-xl sm:py-24" style={{ borderColor: "var(--border)", backgroundColor: "rgba(var(--surface-1-rgb), 0.5)" }}>
        <div className="absolute inset-0 z-0 opacity-60"><Beams colors={["var(--series-1)", "var(--accent-l)"]} /></div>
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div>
              <Badge>Dashboard</Badge>
              <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Your entire pipeline at a glance</h2>
              <p className="mt-4 text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                BD executives see their personal lead list ranked by conversion probability. Managers get team-wide analytics.
                Admins control scoring runs, CRM sync, and user management — all from one interface.
              </p>
              <ul className="mt-6 space-y-3 text-sm" style={{ color: "var(--text-secondary)" }}>
                {[
                  "Leads sorted by predicted conversion probability",
                  "Recommended service line per company with confidence %",
                  "Score explanation — top factors that drove each score",
                  "One-click feedback to mark scores accurate or inaccurate",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold" style={{ color: "var(--status-good)" }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/login"
                className="mt-8 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold"
                style={{ backgroundColor: "var(--series-1)", color: "var(--on-accent)" }}>
                Open dashboard <IconArrowRight />
              </Link>
            </div>
            <TiltedCard className="overflow-hidden rounded-xl border shadow-lg" maxTilt={6}>
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
                <Image
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&q=80"
                  alt="Analytics dashboard preview"
                  width={900}
                  height={600}
                  className="w-full object-cover"
                />
              </div>
            </TiltedCard>
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────── */}
      <section id="how-it-works" className="relative mx-auto max-w-6xl overflow-hidden px-4 py-16 sm:px-6 sm:py-24">
        <div className="absolute inset-0 z-0 opacity-70"><Particles color="var(--accent-l)" /></div>
        <div className="relative grid items-center gap-16 lg:grid-cols-2">
          <TiltedCard className="overflow-hidden rounded-xl border shadow-md" maxTilt={6}>
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
              <Image
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=900&q=80"
                alt="Team collaborating on leads"
                width={900}
                height={620}
                className="w-full object-cover"
              />
            </div>
          </TiltedCard>
          <div>
            <Badge>How it works</Badge>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">From raw web signals to a ranked lead list in minutes</h2>
            <div className="mt-8">
              {[
                { n: 1, title: "Add target companies", body: "Upload a CSV or add companies one by one. The enrichment pipeline kicks off automatically." },
                { n: 2, title: "Scrape & analyse", body: "Celery workers fetch job postings, press releases, and about pages. spaCy + HuggingFace extract intent signals." },
                { n: 3, title: "Score with ML", body: "The XGBoost model combines firmographic fit + intent signals to output a conversion probability for each company." },
                { n: 4, title: "Pitch the right service", body: "The recommended service line — Employer Branding, Hiring, L&D, or IAC Partnership — is surfaced alongside the score." },
                { n: 5, title: "Close the loop", body: "Record won/lost outcomes via CRM sync. The model retrains nightly and gets smarter with every deal." },
              ].map(({ n, title, body }, i) => (
                <FadeIn key={n} delay={i * 100} direction="left">
                  <StepDot n={n} title={title} body={body} />
                </FadeIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Service lines ───────────────────────────────── */}
      <section id="service-lines" className="relative overflow-hidden border-t py-16 backdrop-blur-xl sm:py-24" style={{ borderColor: "var(--border)", backgroundColor: "rgba(var(--surface-1-rgb), 0.5)" }}>
        <div className="absolute inset-0 z-0"><Waves colors={["var(--series-1)", "var(--status-good)"]} /></div>
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <Badge>Cloud Counselage Service Lines</Badge>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">Four revenue streams. One intelligent ranker.</h2>
            <p className="mt-3 text-base" style={{ color: "var(--text-secondary)" }}>
              LeadIntel predicts which service each company needs and ranks them by likelihood to convert.
            </p>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { name: "Employer Branding", desc: "Companies in growth mode that need a strong employer brand to attract talent.", color: "var(--series-1)" },
              { name: "Recruitment & Hiring", desc: "Companies with active hiring signals — high job-posting counts and fast headcount growth.", color: "var(--status-good)" },
              { name: "Learning & Development", desc: "Mid-size companies investing in workforce upskilling and corporate training programmes.", color: "var(--accent-l)" },
              { name: "IAC Partnership", desc: "Large enterprises seeking industry-academia collaboration for R\u0026D and talent pipelines.", color: "var(--accent-2)" },
            ].map(({ name, desc, color }, i) => (
              <FadeIn key={name} delay={i * 90}>
                <TiltedCard maxTilt={8} className="h-full">
                  <SpotlightCard className="rounded-xl border p-5 h-full"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--page-plane)" }}>
                    <div className="mb-3 h-1 w-10 rounded-full" style={{ backgroundColor: color }} />
                    <h3 className="mb-2 font-display text-sm font-semibold">{name}</h3>
                    <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{desc}</p>
                  </SpotlightCard>
                </TiltedCard>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Team ────────────────────────────────────────── */}
      <section id="team" className="relative mx-auto max-w-4xl overflow-hidden px-4 py-14 sm:px-6 sm:py-20">
        <DotGrid color="var(--accent-2)" className="z-0" />
        <div className="relative mb-9 text-center">
          <Badge>Project Team</Badge>
          <h2 className="mt-4 font-display text-2xl font-bold sm:text-3xl">Meet the team behind LeadIntel</h2>
        </div>
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
          {[
            {
              name: "Omkar Pramod Bandikatte",
              enrollment: "60009230009",
              code: "D069",
              image: "/team/ronak-parmar.png",
            },
            {
              name: "Ronak Parmar",
              enrollment: "60009230009",
              code: "D078",
              image: "/team/omkar-pramod-bandikatte.png",
            },
          ].map(({ name, enrollment, code, image }, i) => (
            <FadeIn key={name} delay={i * 120} direction={i === 0 ? "left" : "up"}>
              <TiltedCard maxTilt={5} className="h-full">
                <SpotlightCard
                  className="group flex h-full min-h-40 overflow-hidden rounded-xl border p-0 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
                  spotlightColor="var(--series-1-soft)"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
                >
                  <div className="relative w-32 shrink-0 overflow-hidden sm:w-36">
                    <Image
                      src={image}
                      alt={name}
                      fill
                      sizes="144px"
                      className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
                    />
                    <div className="absolute inset-y-0 right-0 w-px opacity-60" style={{ backgroundColor: "var(--series-1)" }} />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-center p-4">
                    <span className="mb-3 h-0.5 w-8 origin-left rounded-full transition-transform duration-500 group-hover:scale-x-150" style={{ backgroundColor: "var(--series-1)" }} />
                    <h3 className="font-display text-base font-semibold leading-snug">{name}</h3>
                    <p className="mt-1 text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>{enrollment}</p>
                    <span className="mt-3 w-fit rounded-full px-2.5 py-1 text-xs font-semibold transition-colors duration-300"
                      style={{ color: "var(--series-1)", backgroundColor: "var(--series-1-soft)" }}>
                      {code}
                    </span>
                  </div>
                </SpotlightCard>
              </TiltedCard>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="absolute inset-0 z-0" style={{ backgroundColor: "var(--page-plane)" }}>
          <Image
            src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=1800&q=80"
            alt=""
            fill
            className="object-cover opacity-50"
          />
          <PulseRings color="var(--accent-l)" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(7,8,10,0.55) 0%, rgba(7,8,10,0.94) 100%)" }} />
        </div>
        <div className="relative mx-auto max-w-2xl px-6 text-center text-white">
          <h2 className="font-display text-4xl font-bold">Ready to stop guessing which lead to call next?</h2>
          <p className="mt-4 text-base opacity-80">
            LeadIntel turns your target company list into a ranked pipeline with AI-predicted conversion scores — all running locally, no paid APIs required.
          </p>
          <StarBorder color="#fff" speed="4s" className="mt-8">
            <Link href="/login"
              className="inline-flex items-center gap-2 rounded-lg px-7 py-3 text-sm font-bold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--page-plane)", color: "var(--series-1)" }}>
              Sign in and explore <IconArrowRight />
            </Link>
          </StarBorder>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t px-6 py-10 backdrop-blur-xl" style={{ borderColor: "var(--border)", backgroundColor: "rgba(var(--surface-1-rgb), 0.5)" }}>
        <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-3">
          <div>
            <span className="font-display text-lg font-bold" style={{ color: "var(--text-primary)" }}>LeadIntel</span>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Built for the Cloud Counselage BD team · Open-source stack · No paid APIs.
            </p>
          </div>
          <div className="flex gap-6 text-sm sm:justify-center" style={{ color: "var(--text-secondary)" }}>
            <a href="#features" className="hover:text-current transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-current transition-colors">How it works</a>
            <a href="#service-lines" className="hover:text-current transition-colors">Service lines</a>
          </div>
          <div className="text-sm sm:text-right">
            <Link href="/login" className="hover:underline" style={{ color: "var(--series-1)" }}>Sign in →</Link>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-6xl border-t pt-6 text-center text-xs"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          © {new Date().getFullYear()} LeadIntel · Cloud Counselage
        </div>
      </footer>

    </ClickSpark>
  );
}

