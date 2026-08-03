"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { Skeleton } from "@/components/Skeleton";
import { FadeIn } from "@/components/FadeIn";
import { useAuth } from "@/lib/auth-context";
import { getExtendedAnalytics, type ExtendedAnalytics } from "@/lib/api-client";

// Lazy-load chart components — they are canvas/SVG heavy and only needed
// once the user has navigated to the analytics page.
const ChartFallback = () => <Skeleton className="h-40 w-full" />;
const BarChart = dynamic(
  () => import("@/components/charts/BarChart").then((m) => ({ default: m.BarChart })),
  { loading: ChartFallback, ssr: false }
);
const LineChart = dynamic(
  () => import("@/components/charts/LineChart").then((m) => ({ default: m.LineChart })),
  { loading: ChartFallback, ssr: false }
);
const HorizontalBarChart = dynamic(
  () => import("@/components/charts/HorizontalBarChart").then((m) => ({ default: m.HorizontalBarChart })),
  { loading: ChartFallback, ssr: false }
);

const SERVICE_LABELS: Record<string, string> = {
  branding: "Employer Branding",
  hiring: "Recruitment & Hiring",
  learning_development: "L&D",
  iac_partnership: "IAC Partnership",
};

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
      <div className="text-3xl font-bold tabular-nums" style={{ color: accent ?? "var(--text-primary)" }}>{value}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{children}</h2>;
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <FadeIn>
      <div className={`rounded-xl border p-5 ${className}`} style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
        {children}
      </div>
    </FadeIn>
  );
}

function AnalyticsContent() {
  const { token } = useAuth();
  const [data, setData] = useState<ExtendedAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getExtendedAnalytics(token)
      .then(setData)
      .catch(() => setErrorMsg("Could not load analytics data."))
      .finally(() => setIsLoading(false));
  }, [token]);

  if (isLoading) {
    return (
      <AppShell>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <BackButton />
          {/* KPI strip skeleton */}
          <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="rounded-xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
                <Skeleton className="mb-2 h-9 w-16" />
                <Skeleton className="mb-1 h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
          {/* Chart row skeleton */}
          <div className="mb-8">
            <div className="rounded-xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
              <Skeleton className="mb-4 h-3 w-40" />
              <Skeleton className="h-40 w-full" />
            </div>
          </div>
          {/* Two-col chart skeleton */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            {[1,2].map(i => (
              <div key={i} className="rounded-xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
                <Skeleton className="mb-4 h-3 w-36" />
                <Skeleton className="h-44 w-full" />
              </div>
            ))}
          </div>
          {/* Three-col mini-card skeleton */}
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-xl border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
                <Skeleton className="mb-4 h-3 w-28" />
                {[1,2,3].map(j => (
                  <div key={j} className="mb-3">
                    <Skeleton className="mb-1.5 h-3 w-full" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </main>
      </AppShell>
    );
  }

  if (errorMsg || !data) {
    return (
      <AppShell>
        <main className="mx-auto max-w-6xl px-6 py-12 text-center" style={{ color: "var(--status-critical)" }}>{errorMsg ?? "No data."}</main>
      </AppShell>
    );
  }

  const latestAccuracy = data.model_accuracy_trend.length > 0
    ? Math.round(data.model_accuracy_trend[data.model_accuracy_trend.length - 1].top1_recommendation_accuracy * 100)
    : null;

  const totalEnriched = data.enrichment_breakdown.pending + data.enrichment_breakdown.enriched + data.enrichment_breakdown.failed;
  const enrichPct = totalEnriched > 0 ? Math.round((data.enrichment_breakdown.enriched / totalEnriched) * 100) : 0;
  const totalDeals = data.deal_pipeline.open + data.deal_pipeline.won + data.deal_pipeline.lost;
  const overallWinRate = (data.deal_pipeline.won + data.deal_pipeline.lost) > 0
    ? Math.round((data.deal_pipeline.won / (data.deal_pipeline.won + data.deal_pipeline.lost)) * 100) : 0;
  const totalFeedback = data.feedback_summary.accurate + data.feedback_summary.inaccurate;
  const feedbackAccuracyPct = totalFeedback > 0 ? Math.round((data.feedback_summary.accurate / totalFeedback) * 100) : null;

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <BackButton />
        <div className="mb-8">
          <h1 className="mb-1 text-xl font-semibold sm:text-2xl">Analytics</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Pipeline performance, model accuracy, and lead intelligence — live from the database.</p>
        </div>

        {/* KPI strip */}
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[
            <KpiCard key="scored" label="Leads scored" value={data.total_leads_scored} />,
            <KpiCard key="avg" label="Avg score" value={data.avg_conversion_probability.toFixed(1)} sub="conversion probability" accent="var(--series-1)" />,
            <KpiCard key="enrich" label="Enriched" value={`${enrichPct}%`} sub={`${data.enrichment_breakdown.enriched} / ${totalEnriched} companies`} accent="var(--status-good)" />,
            <KpiCard key="win" label="Win rate" value={`${overallWinRate}%`} sub={`${data.deal_pipeline.won} won · ${data.deal_pipeline.lost} lost`} />,
            latestAccuracy !== null
              ? <KpiCard key="acc" label="Model accuracy" value={`${latestAccuracy}%`} sub="latest month top-1" accent={latestAccuracy >= 60 ? "var(--status-good)" : "var(--series-1)"} />
              : <KpiCard key="acc" label="Model accuracy" value="—" sub="no closed deals yet" />,
          ].map((card, i) => (
            <FadeIn key={i} delay={i * 80}>{card}</FadeIn>
          ))}
        </div>

        {/* Score distribution histogram */}
        <div className="mb-8">
          <Card>
            <SectionTitle>Score distribution — conversion probability spread</SectionTitle>
            <BarChart data={data.score_distribution.map((b) => ({ label: b.bucket, value: b.count }))} height={160} />
          </Card>
        </div>

        {/* Score bands */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <SectionTitle>Leads by score band</SectionTitle>
            <BarChart data={data.score_band_performance.map((b) => ({ label: b.band, value: b.count }))} height={180} />
          </Card>
          <Card>
            <SectionTitle>Closed-won rate by score band</SectionTitle>
            <BarChart
              data={data.score_band_performance.map((b) => ({ label: b.band, value: Math.round(b.closed_won_rate * 100) }))}
              valueFormat={(v) => `${v}%`} color="var(--status-good)" height={180} />
          </Card>
        </div>

        {/* Service line */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <SectionTitle>Recommended service — distribution</SectionTitle>
            <HorizontalBarChart
              data={data.service_performance.map((s) => ({ label: SERVICE_LABELS[s.service] ?? s.service, value: s.recommended_count }))}
              color="var(--series-1)" />
          </Card>
          <Card>
            <SectionTitle>Service line — won vs lost deals</SectionTitle>
            <div className="space-y-4">
              {data.service_performance.map((s) => {
                const total = s.won_count + s.lost_count;
                const winPct = total > 0 ? Math.round((s.won_count / total) * 100) : 0;
                return (
                  <div key={s.service}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium">{SERVICE_LABELS[s.service] ?? s.service}</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        <span style={{ color: "var(--status-good)" }}>{s.won_count} won</span>{" · "}
                        <span style={{ color: "var(--status-critical)" }}>{s.lost_count} lost</span>
                        {total > 0 && <span className="ml-2 font-semibold" style={{ color: "var(--text-primary)" }}>{winPct}%</span>}
                      </span>
                    </div>
                    <div className="relative h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--gridline)" }}>
                      {total > 0 && (
                        <>
                          <div className="absolute left-0 top-0 h-full rounded-l-full" style={{ width: `${winPct}%`, backgroundColor: "var(--status-good)" }} />
                          <div className="absolute top-0 h-full rounded-r-full" style={{ left: `${winPct}%`, width: `${100 - winPct}%`, backgroundColor: "var(--status-critical)", opacity: 0.35 }} />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Industry performance */}
        {data.industry_performance.length > 0 && (
          <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card>
              <SectionTitle>Top industries — lead count</SectionTitle>
              <HorizontalBarChart data={data.industry_performance.map((i) => ({ label: i.industry, value: i.count }))} color="var(--series-1)" />
            </Card>
            <Card>
              <SectionTitle>Top industries — win rate</SectionTitle>
              <HorizontalBarChart
                data={data.industry_performance.filter((i) => i.win_rate > 0).sort((a, b) => b.win_rate - a.win_rate)
                  .map((i) => ({ label: i.industry, value: Math.round(i.win_rate * 100) }))}
                valueFormat={(v) => `${v}%`} color="var(--status-good)" maxValue={100} />
            </Card>
          </div>
        )}

        {/* Pipeline + Enrichment + Feedback */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <Card>
            <SectionTitle>Deal pipeline</SectionTitle>
            <div className="space-y-3">
              {[
                { label: "Open", value: data.deal_pipeline.open, color: "var(--series-1)" },
                { label: "Won", value: data.deal_pipeline.won, color: "var(--status-good)" },
                { label: "Lost", value: data.deal_pipeline.lost, color: "var(--status-critical)" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium">{label}</span>
                    <span style={{ color: "var(--text-muted)" }}>{value} ({totalDeals > 0 ? Math.round((value / totalDeals) * 100) : 0}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--gridline)" }}>
                    <div className="h-full rounded-full" style={{ width: totalDeals > 0 ? `${(value / totalDeals) * 100}%` : "0%", backgroundColor: color }} />
                  </div>
                </div>
              ))}
              {data.deal_pipeline.total_deal_value > 0 && (
                <p className="pt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  Total won value: <span className="font-semibold" style={{ color: "var(--status-good)" }}>₹{data.deal_pipeline.total_deal_value.toLocaleString()}</span>
                </p>
              )}
            </div>
          </Card>

          <Card>
            <SectionTitle>Company enrichment</SectionTitle>
            <div className="space-y-3">
              {[
                { label: "Enriched", value: data.enrichment_breakdown.enriched, color: "var(--status-good)" },
                { label: "Pending",  value: data.enrichment_breakdown.pending,  color: "var(--series-1)" },
                { label: "Failed",   value: data.enrichment_breakdown.failed,   color: "var(--status-critical)" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium">{label}</span>
                    <span style={{ color: "var(--text-muted)" }}>{value} ({totalEnriched > 0 ? Math.round((value / totalEnriched) * 100) : 0}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--gridline)" }}>
                    <div className="h-full rounded-full" style={{ width: totalEnriched > 0 ? `${(value / totalEnriched) * 100}%` : "0%", backgroundColor: color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle>Score accuracy feedback</SectionTitle>
            {totalFeedback === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No feedback submitted yet.</p>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Marked accurate",   value: data.feedback_summary.accurate,   color: "var(--status-good)" },
                  { label: "Marked inaccurate",  value: data.feedback_summary.inaccurate, color: "var(--status-critical)" },
                ].map(({ label, value, color }) => (
                  <div key={label}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium">{label}</span>
                      <span style={{ color: "var(--text-muted)" }}>{value} ({Math.round((value / totalFeedback) * 100)}%)</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "var(--gridline)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(value / totalFeedback) * 100}%`, backgroundColor: color }} />
                    </div>
                  </div>
                ))}
                {feedbackAccuracyPct !== null && (
                  <p className="pt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    Model acceptance: <span className="font-semibold" style={{ color: feedbackAccuracyPct >= 70 ? "var(--status-good)" : "var(--series-1)" }}>{feedbackAccuracyPct}%</span>
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Scoring activity */}
        <div className="mb-8">
          <Card>
            <SectionTitle>Scoring activity — last 14 days</SectionTitle>
            <BarChart data={data.scoring_activity_14d.map((d) => ({ label: d.date, value: d.count }))} color="var(--series-1)" height={150} />
          </Card>
        </div>

        {/* Model accuracy trend */}
        <div className="mb-2">
          <Card>
            <SectionTitle>Model accuracy trend — top-1 recommendation per closed month</SectionTitle>
            {data.model_accuracy_trend.length === 0 ? (
              <p className="py-4 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                No closed deals yet — accuracy will appear once CRM deals are imported.
              </p>
            ) : (
              <LineChart
                data={data.model_accuracy_trend.map((p) => ({ label: p.period, value: Math.round(p.top1_recommendation_accuracy * 100) }))}
                valueFormat={(v) => `${v}%`} height={180} />
            )}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}

export default function AnalyticsPage() {
  return (
    <ProtectedRoute allowedRoles={["manager", "admin"]}>
      <AnalyticsContent />
    </ProtectedRoute>
  );
}
