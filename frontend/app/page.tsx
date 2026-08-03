"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { FadeIn } from "@/components/FadeIn";

// ─── tiny reusable primitives ────────────────────────────────────────────────

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-full border px-3 py-0.5 text-xs font-medium tracking-wide"
      style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--surface-1)" }}>
      {children}
    </span>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border p-6" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
        style={{ backgroundColor: "var(--gridline)", color: "var(--series-1)" }}>
        {icon}
      </div>
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{body}</p>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-bold tabular-nums" style={{ color: "var(--series-1)" }}>{value}</div>
      <div className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{label}</div>
    </div>
  );
}

function StepDot({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: "var(--series-1)" }}>{n}</div>
      </div>
      <div>
        <h4 className="mb-1 font-semibold">{title}</h4>
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

  // Redirect already-authenticated users straight to the dashboard
  useEffect(() => {
    if (!isLoading && token) router.replace("/dashboard");
  }, [isLoading, token, router]);

  if (isLoading || token) return null;

  return (
    <div style={{ backgroundColor: "var(--page-plane)", color: "var(--text-primary)" }}>

      {/* ── Top Nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b backdrop-blur-sm"
        style={{ borderColor: "var(--border)", backgroundColor: "rgba(var(--surface-1-rgb), 0.9)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <span className="text-base font-bold tracking-tight">LeadIntel</span>
          <nav className="hidden items-center gap-6 text-sm sm:flex" style={{ color: "var(--text-secondary)" }}>
            <a href="#features" className="hover:text-current transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-current transition-colors">How it works</a>
            <a href="#service-lines" className="hover:text-current transition-colors">Service lines</a>
          </nav>
          <Link href="/login"
            className="rounded-md px-4 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--series-1)" }}>
            Sign in
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* background image */}
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1800&q=80"
            alt=""
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0" style={{ background: "var(--hero-overlay)" }} />
        </div>

        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-28 text-center">
          <Badge>AI-Powered B2B Lead Intelligence</Badge>
          <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Know which companies to pitch —<br className="hidden sm:block" />
            <span style={{ color: "var(--series-1)" }}>before your competitors do.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed sm:text-lg" style={{ color: "var(--text-secondary)" }}>
            LeadIntel scrapes firmographic signals, job postings, and press activity, then runs an ML scoring model
            to rank B2B leads by conversion probability and recommend the right Cloud Counselage service line for each company.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/login"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--series-1)" }}>
              Get started <IconArrowRight />
            </Link>
            <a href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-lg border px-6 py-3 text-sm font-semibold transition-colors hover:bg-gridline"
              style={{ borderColor: "var(--border)" }}>
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* ── Stats bar ───────────────────────────────────── */}
      <section className="border-y" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 px-4 py-10 sm:gap-8 sm:py-12 sm:grid-cols-4">
          <StatCard value="85+" label="Real companies tracked" />
          <StatCard value="6,700+" label="Historical deals analysed" />
          <StatCard value="0.74" label="Model ROC AUC (XGBoost)" />
          <StatCard value="4" label="Service lines ranked" />
        </div>
      </section>

      {/* ── Features ────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mb-12 text-center">
          <Badge>Features</Badge>
          <h2 className="mt-4 text-3xl font-bold">Everything your BD team needs to close faster</h2>
          <p className="mt-3 text-base" style={{ color: "var(--text-secondary)" }}>
            No paid APIs. No vendor lock-in. Open-source stack from ingestion to inference.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: <IconSearch />, title: "Automated company enrichment", body: "Scrapers pull job postings, press releases, and about-page text from target company websites. No manual research required." },
            { icon: <IconBrain />, title: "NLP intent detection", body: "spaCy + a local HuggingFace zero-shot classifier reads scraped text and predicts which service the company needs most — branding, hiring, L&D, or IAC partnership." },
            { icon: <IconTarget />, title: "ML conversion scoring", body: "An XGBoost classifier trained on historical won/lost deals outputs a 0-100 conversion probability. The model self-improves as your team closes more deals." },
            { icon: <IconChart />, title: "Live analytics dashboard", body: "Win rates by service line, score-band performance, industry breakdown, and model accuracy trend — all computed live from your pipeline data." },
            { icon: <IconSync />, title: "CRM sync loop", body: "Push scored leads to CSV for your CRM. Pull won/lost outcomes back to feed the retraining loop. Nightly Celery jobs keep scores fresh automatically." },
            { icon: <IconShield />, title: "Role-based access", body: "Three roles — BD Executive, Manager, Admin — each with the right level of access. JWT auth, bcrypt passwords, zero plain-text secrets." },
          ].map(({ icon, title, body }, i) => (
            <FadeIn key={title} delay={i * 80}>
              <FeatureCard icon={icon} title={title} body={body} />
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── Dashboard screenshot ─────────────────────────── */}
      <section className="border-y py-16 sm:py-24" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
            <div>
              <Badge>Dashboard</Badge>
              <h2 className="mt-4 text-3xl font-bold">Your entire pipeline at a glance</h2>
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
                className="mt-8 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: "var(--series-1)" }}>
                Open dashboard <IconArrowRight />
              </Link>
            </div>
            <div className="overflow-hidden rounded-xl border shadow-lg" style={{ borderColor: "var(--border)" }}>
              <Image
                src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&q=80"
                alt="Analytics dashboard preview"
                width={900}
                height={600}
                className="w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────── */}
      <section id="how-it-works" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border shadow-md" style={{ borderColor: "var(--border)" }}>
            <Image
              src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=900&q=80"
              alt="Team collaborating on leads"
              width={900}
              height={620}
              className="w-full object-cover"
            />
          </div>
          <div>
            <Badge>How it works</Badge>
            <h2 className="mt-4 text-3xl font-bold">From raw web signals to a ranked lead list in minutes</h2>
            <div className="mt-8 space-y-6">
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
      <section className="border-t py-16 sm:py-24" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <Badge>Cloud Counselage Service Lines</Badge>
            <h2 className="mt-4 text-3xl font-bold">Four revenue streams. One intelligent ranker.</h2>
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
                <div className="rounded-xl border p-5 h-full" style={{ borderColor: "var(--border)", backgroundColor: "var(--page-plane)" }}>
                  <div className="mb-3 h-1 w-10 rounded-full" style={{ backgroundColor: color }} />
                  <h3 className="mb-2 text-sm font-semibold">{name}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-20 sm:py-28">
        <div className="absolute inset-0 -z-10">
          <Image
            src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=1800&q=80"
            alt=""
            fill
            className="object-cover"
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(42,120,214,0.9) 0%, rgba(11,11,11,0.85) 100%)" }} />
        </div>
        <div className="relative mx-auto max-w-2xl px-6 text-center text-white">
          <h2 className="text-4xl font-bold">Ready to stop guessing which lead to call next?</h2>
          <p className="mt-4 text-base opacity-80">
            LeadIntel turns your target company list into a ranked pipeline with AI-predicted conversion scores — all running locally, no paid APIs required.
          </p>
          <Link href="/login"
            className="mt-8 inline-flex items-center gap-2 rounded-lg px-7 py-3 text-sm font-bold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--page-plane)", color: "var(--series-1)" }}>
            Sign in and explore <IconArrowRight />
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer className="border-t px-6 py-8" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm sm:flex-row"
          style={{ color: "var(--text-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>LeadIntel</span>
          <span>Built for Cloud Counselage BD team · Open-source stack · No paid APIs</span>
          <Link href="/login" className="hover:underline" style={{ color: "var(--series-1)" }}>Sign in →</Link>
        </div>
      </footer>

    </div>
  );
}

