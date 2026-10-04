"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Briefcase,
  Building2,
  Clock,
  Cpu,
  DollarSign,
  ExternalLink,
  FileText,
  Lightbulb,
  MapPin,
  Minus,
  PauseCircle,
  RefreshCcw,
  Rocket,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  UserCog,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { Skeleton } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth-context";
import {
  ApiError,
  getCompany,
  getCompanyDocuments,
  getCompanySignals,
  getLeadExplanation,
  submitLeadFeedback,
  triggerEnrichment,
  type CompanyDetail,
  type LeadExplanation,
  type RawDocument,
  type SignalItem,
} from "@/lib/api-client";

const SERVICE_LABELS: Record<string, string> = {
  branding: "Employer Branding",
  hiring: "Recruitment & Hiring",
  learning_development: "Learning & Development",
  iac_partnership: "Industry-Academia Partnership",
};

function serviceLabel(key: string): string {
  return SERVICE_LABELS[key] ?? key.replace(/_/g, " ");
}

const STATUS_COLOR: Record<string, string> = {
  enriched: "var(--status-good)",
  pending: "var(--text-muted)",
  failed: "var(--status-critical)",
};

const SIGNAL_ICONS: Record<string, React.ElementType> = {
  hiring: Briefcase,
  expansion: Rocket,
  funding: DollarSign,
  technology_adoption: Cpu,
  leadership_change: UserCog,
  layoffs: TrendingDown,
  hiring_freeze: PauseCircle,
};

function signalLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function TrendBadge({ trend }: { trend: string | null | undefined }) {
  if (!trend) return null;
  const config = {
    increasing: { icon: TrendingUp, color: "var(--status-good)", bg: "var(--status-good-soft)", label: "Increasing" },
    decreasing: { icon: TrendingDown, color: "var(--status-critical)", bg: "var(--status-critical-soft)", label: "Decreasing" },
    stable: { icon: Minus, color: "var(--text-muted)", bg: "var(--gridline)", label: "Stable" },
  }[trend] ?? { icon: Minus, color: "var(--text-muted)", bg: "var(--gridline)", label: trend };
  const Icon = config.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      <Icon size={13} />
      {config.label}
    </span>
  );
}

function CompanyDetailContent() {
  const { token } = useAuth();
  const params = useParams<{ id: string }>();
  const companyId = params.id;

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [documents, setDocuments] = useState<RawDocument[]>([]);
  const [explanation, setExplanation] = useState<LeadExplanation | null>(null);
  const [signals, setSignals] = useState<SignalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [companyResult, documentsResult, signalsResult] = await Promise.all([
        getCompany(token, companyId),
        getCompanyDocuments(token, companyId),
        getCompanySignals(token, companyId),
      ]);
      setCompany(companyResult);
      setDocuments(documentsResult);
      setSignals(signalsResult.results);
      try {
        setExplanation(await getLeadExplanation(token, companyId));
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
        setExplanation(null); // not scored yet
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, companyId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleEnrich() {
    if (!token) return;
    await triggerEnrichment(token, companyId);
    await load();
  }

  async function handleFeedback(isAccurate: boolean) {
    if (!token) return;
    await submitLeadFeedback(token, companyId, { is_accurate: isAccurate });
    setFeedbackSent(true);
  }

  if (isLoading || !company) {
    return (
      <AppShell>
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <BackButton />
          <div className="mb-6 flex items-start justify-between">
            <div className="flex-1">
              <Skeleton className="mb-2 h-7 w-52" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <div className="surface-card p-5">
            <Skeleton className="mb-4 h-3.5 w-40" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  const opportunityScore = explanation?.opportunity_score ?? null;

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <BackButton />

        {/* ── Header ── */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: "var(--series-1-soft)", color: "var(--series-1)" }}
            >
              <Building2 size={20} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{company.name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                {company.industry && <span>{company.industry}</span>}
                {(company.location_city || company.location_country) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={13} />
                    {[company.location_city, company.location_country].filter(Boolean).join(", ")}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:flex-col sm:items-end">
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold capitalize"
              style={{ backgroundColor: "var(--gridline)", color: STATUS_COLOR[company.enrichment_status] }}
            >
              {company.enrichment_status}
            </span>
            <button
              onClick={handleEnrich}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:border-[var(--series-1)]"
              style={{ borderColor: "var(--border)" }}
            >
              <RefreshCcw size={13} />
              Re-run enrichment
            </button>
          </div>
        </div>

        {explanation ? (
          <>
            {/* ── Hero stat grid: Opportunity Score + supporting scores ── */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div
                className="surface-card animate-scale-in p-5 lg:col-span-1"
                style={{ background: "linear-gradient(145deg, var(--series-1-soft), var(--surface-1))" }}
              >
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--series-1)" }}>
                  <Sparkles size={13} />
                  Opportunity Score
                </div>
                <div className="text-3xl font-bold" style={{ color: "var(--series-1)" }}>
                  {opportunityScore !== null ? opportunityScore.toFixed(0) : "—"}
                </div>
                <div className="mt-2">
                  <TrendBadge trend={explanation.intent_trend} />
                </div>
              </div>
              <div className="surface-card animate-scale-in delay-75 p-5">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Conversion probability
                </div>
                <div className="text-2xl font-bold">{explanation.conversion_probability.toFixed(1)}%</div>
              </div>
              <div className="surface-card animate-scale-in delay-150 p-5">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Fit score
                </div>
                <div className="text-2xl font-bold">{explanation.fit_score?.toFixed(0) ?? "—"}</div>
              </div>
              <div className="surface-card animate-scale-in delay-225 p-5">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Intent score
                </div>
                <div className="text-2xl font-bold">{explanation.intent_score?.toFixed(0) ?? "—"}</div>
              </div>
            </div>

            {/* ── Why this company / Why now / What to offer ── */}
            <div className="mb-6 grid gap-4 lg:grid-cols-3">
              <div className="surface-card p-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--series-1)" }}>
                  <Target size={16} />
                  Why this company
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {explanation.why_this_company ?? "Not enough signal yet to explain this recommendation."}
                </p>
              </div>
              <div className="surface-card p-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--accent-2)" }}>
                  <Clock size={16} />
                  Why now
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {explanation.why_now ?? "No recent business signal detected in the last 45 days."}
                </p>
              </div>
              <div className="surface-card p-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--status-good)" }}>
                  <Lightbulb size={16} />
                  What to offer
                </div>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {explanation.what_to_offer ?? "Not enough NLP signal yet to recommend a service line."}
                </p>
              </div>
            </div>

            {/* ── Service probabilities + top factors ── */}
            <div className="mb-6 grid gap-4 lg:grid-cols-2">
              {explanation.service_probabilities && Object.keys(explanation.service_probabilities).length > 0 && (
                <div className="surface-card p-5">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    Service requirement probabilities
                  </h2>
                  <div className="space-y-2.5">
                    {Object.entries(explanation.service_probabilities)
                      .sort(([, a], [, b]) => b - a)
                      .map(([service, probability]) => (
                        <div key={service}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span>{serviceLabel(service)}</span>
                            <span className="font-semibold">{probability.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--gridline)" }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${probability}%`, backgroundColor: "var(--series-1)" }}
                            />
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="surface-card p-5">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Top contributing factors
                </h2>
                <ul className="space-y-2 text-sm">
                  {explanation.top_factors.map((factor, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span style={{ color: factor.weight >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                        {factor.weight >= 0 ? "▲" : "▼"}
                      </span>
                      <span>{factor.factor}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
                  Model: {explanation.model_version}
                </p>
                {!feedbackSent ? (
                  <div className="mt-3 flex items-center gap-3 text-sm">
                    <span style={{ color: "var(--text-secondary)" }}>Is this score accurate?</span>
                    <button
                      onClick={() => handleFeedback(true)}
                      className="inline-flex items-center gap-1 font-medium"
                      style={{ color: "var(--status-good)" }}
                    >
                      <ThumbsUp size={14} /> Yes
                    </button>
                    <button
                      onClick={() => handleFeedback(false)}
                      className="inline-flex items-center gap-1 font-medium"
                      style={{ color: "var(--status-critical)" }}
                    >
                      <ThumbsDown size={14} /> No
                    </button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>Thanks — feedback recorded.</p>
                )}
              </div>
            </div>

            {/* ── Signal timeline ── */}
            <div className="surface-card mb-6 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Signal timeline ({signals.length})
              </h2>
              {signals.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  No structured business signals detected yet.
                </p>
              ) : (
                <ol className="space-y-4">
                  {signals.map((signal) => {
                    const Icon = SIGNAL_ICONS[signal.signal_type] ?? Sparkles;
                    const isPositive = signal.direction === "positive";
                    const color = isPositive ? "var(--status-good)" : "var(--status-critical)";
                    const soft = isPositive ? "var(--status-good-soft)" : "var(--status-critical-soft)";
                    return (
                      <li key={signal.id} className="flex gap-3">
                        <span
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full"
                          style={{ backgroundColor: soft, color }}
                        >
                          <Icon size={16} />
                        </span>
                        <div className="min-w-0 flex-1 border-b pb-4 last:border-0 last:pb-0" style={{ borderColor: "var(--gridline)" }}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold">{signalLabel(signal.signal_type)}</span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase"
                              style={{ backgroundColor: soft, color }}
                            >
                              {signal.direction}
                            </span>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {Math.round(signal.confidence * 100)}% confidence · {timeAgo(signal.detected_at)}
                            </span>
                          </div>
                          {signal.headline && (
                            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                              {signal.headline}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </>
        ) : (
          <div className="surface-card mb-6 p-5">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Not scored yet — trigger enrichment to generate a score.
            </p>
          </div>
        )}

        {/* ── Source documents ── */}
        <div className="surface-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            <FileText size={15} />
            Source evidence ({documents.length})
          </h2>
          {documents.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              No scraped documents yet.
            </p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--gridline)" }}>
              {documents.map((document) => (
                <li key={document.id} className="py-3">
                  <div className="mb-1 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span className="rounded-full px-2 py-0.5 capitalize" style={{ backgroundColor: "var(--gridline)" }}>
                      {document.doc_type.replace("_", " ")}
                    </span>
                    <span>{new Date(document.scraped_at).toLocaleString()}</span>
                    {document.source_url && (
                      <a href={document.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline">
                        source <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm">{document.raw_text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </AppShell>
  );
}

export default function CompanyDetailPage() {
  return (
    <ProtectedRoute>
      <CompanyDetailContent />
    </ProtectedRoute>
  );
}
