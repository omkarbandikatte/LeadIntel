"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Minus, Play, Plus, Search, TrendingDown, TrendingUp } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { SkeletonRows } from "@/components/Skeleton";
import { GradientText } from "@/components/reactbits/GradientText";
import { useAuth } from "@/lib/auth-context";
import { listLeads, triggerScoring, type LeadFilters, type LeadListResponse } from "@/lib/api-client";

const SERVICE_LABELS: Record<string, string> = {
  branding: "Employer Branding",
  hiring: "Recruitment & Hiring",
  learning_development: "Learning & Development",
  iac_partnership: "Industry-Academia Partnership",
};

const SERVICE_LINES = ["branding", "hiring", "learning_development", "iac_partnership"] as const;
const PAGE_SIZE = 10;

function scoreColor(score: number): string {
  if (score >= 80) return "var(--status-good)";
  if (score >= 60) return "var(--series-1)";
  return "var(--text-muted)";
}

function ScoreChip({ score }: { score: number }) {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-xs font-bold"
      style={{ backgroundColor: "var(--gridline)", color: scoreColor(score) }}
    >
      {score.toFixed(0)}
    </span>
  );
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === "increasing") return <TrendingUp size={15} style={{ color: "var(--status-good)" }} />;
  if (trend === "decreasing") return <TrendingDown size={15} style={{ color: "var(--status-critical)" }} />;
  return <Minus size={15} style={{ color: "var(--text-muted)" }} />;
}

const inputStyle = {
  borderColor: "var(--border)",
  backgroundColor: "var(--surface-1)",
} as const;

function LeadsPageContent() {
  const { token, role } = useAuth();
  const [filters, setFilters] = useState<LeadFilters>({ sort: "score_desc", page: 1, page_size: PAGE_SIZE });
  const [data, setData] = useState<LeadListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scoringMsg, setScoringMsg] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await listLeads(token, filters);
      setData(response);
    } catch {
      setErrorMessage("Could not load leads. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [token, filters]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  function updateFilter<K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value, page: key === "page" ? (value as number) : 1 }));
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / (filters.page_size ?? PAGE_SIZE))) : 1;

  const ROLE_HEADER: Record<string, { title: string; sub: string }> = {
    bd_executive: { title: "My Leads", sub: "Your pipeline sorted by conversion probability. Focus on the highest-scoring companies." },
    manager:      { title: "Team Leads", sub: "Full pipeline across all BD executives, ranked by conversion probability." },
    admin:        { title: "All Leads", sub: "Complete lead database. Use the scoring panel to re-run the model." },
  };
  const header = ROLE_HEADER[role ?? "bd_executive"] ?? ROLE_HEADER["bd_executive"];

  async function handleRunScoring() {
    if (!token) return;
    setScoringMsg("Queuing…");
    try {
      await triggerScoring(token, "incremental");
      setScoringMsg("✓ Incremental scoring queued — refresh in a moment.");
    } catch {
      setScoringMsg("Failed to queue scoring run.");
    }
  }

  return (
    <AppShell>
      <main className="max-w-7xl px-4 py-6 sm:px-6 sm:py-8 2xl:max-w-[1800px]">
        <BackButton />
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mb-1 font-display text-xl font-bold tracking-tight sm:text-2xl">
              <GradientText animationSpeed={8}>{header.title}</GradientText>
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{header.sub}</p>
          </div>
          {role === "admin" && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRunScoring}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:border-[var(--series-1)]"
                style={{ borderColor: "var(--border)" }}
              >
                <Play size={14} />
                Run scoring
              </button>
              <Link
                href="/companies"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: "var(--series-1)", color: "var(--on-accent)" }}
              >
                <Plus size={14} />
                Add company
              </Link>
            </div>
          )}
        </div>
        {scoringMsg && (
          <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>{scoringMsg}</p>
        )}

        <div className="glass-toolbar mb-6 flex flex-wrap gap-3 p-4">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input
              placeholder="Industry"
              className="rounded-full border py-1.5 pl-8 pr-3 text-sm"
              style={inputStyle}
              onChange={(event) => updateFilter("industry", event.target.value || undefined)}
            />
          </div>
          <input
            placeholder="Region"
            className="rounded-full border px-3 py-1.5 text-sm"
            style={inputStyle}
            onChange={(event) => updateFilter("region", event.target.value || undefined)}
          />
          <select
            className="rounded-full border px-3 py-1.5 text-sm"
            style={inputStyle}
            onChange={(event) => updateFilter("recommended_service", event.target.value || undefined)}
            defaultValue=""
          >
            <option value="">All service lines</option>
            {SERVICE_LINES.map((line) => (
              <option key={line} value={line}>
                {SERVICE_LABELS[line]}
              </option>
            ))}
          </select>
          <select
            className="rounded-full border px-3 py-1.5 text-sm"
            style={inputStyle}
            value={filters.sort}
            onChange={(event) => updateFilter("sort", event.target.value as LeadFilters["sort"])}
          >
            <option value="score_desc">Highest score first</option>
            <option value="score_asc">Lowest score first</option>
            <option value="recent">Most recently scored</option>
          </select>
        </div>

        {errorMessage && (
          <p className="mb-4 text-sm" style={{ color: "var(--status-critical)" }}>
            {errorMessage}
          </p>
        )}

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 text-center font-medium">Conversion</th>
                <th className="px-4 py-3 text-center font-medium">Opportunity</th>
                <th className="px-4 py-3 text-center font-medium">Trend</th>
                <th className="px-4 py-3 font-medium">Recommended</th>
                <th className="px-4 py-3 font-medium">Last scored</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows rows={10} cols={8} />}
              {!isLoading && data?.results.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                    No leads match these filters yet.
                  </td>
                </tr>
              )}
              {!isLoading &&
                data?.results.map((lead) => (
                  <tr
                    key={lead.company_id}
                    className="row-accent border-b transition-colors last:border-0 hover:bg-[var(--surface-2)]"
                    style={{ borderColor: "var(--gridline)", ["--row-accent" as string]: scoreColor(lead.conversion_probability) }}
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/companies/${lead.company_id}`} className="flex items-center gap-2 hover:underline">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                          style={{ backgroundColor: "var(--series-1-soft)", color: "var(--series-1)" }}>
                          {lead.company_name.charAt(0).toUpperCase()}
                        </span>
                        {lead.company_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {lead.industry ?? "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {lead.location ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <span className="font-semibold" style={{ color: scoreColor(lead.conversion_probability) }}>
                          {lead.conversion_probability.toFixed(1)}
                        </span>
                        <span className="h-1 w-12 overflow-hidden rounded-full" style={{ backgroundColor: "var(--gridline)" }}>
                          <span className="block h-full rounded-full" style={{ width: `${lead.conversion_probability}%`, backgroundColor: scoreColor(lead.conversion_probability) }} />
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {lead.opportunity_score !== null ? <ScoreChip score={lead.opportunity_score} /> : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TrendIcon trend={lead.intent_trend} />
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {lead.recommended_service ? (SERVICE_LABELS[lead.recommended_service] ?? lead.recommended_service) : "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                      {new Date(lead.last_scored_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {data && data.total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
            <span>
              Page {data.page} of {totalPages} · {data.total} leads
            </span>
            <div className="flex gap-2">
              <button
                disabled={data.page <= 1}
                onClick={() => updateFilter("page", data.page - 1)}
                className="pill-btn border px-4 py-1.5 disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
              >
                Previous
              </button>
              <button
                disabled={data.page >= totalPages}
                onClick={() => updateFilter("page", data.page + 1)}
                className="pill-btn border px-4 py-1.5 disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

export default function LeadsPage() {
  return (
    <ProtectedRoute>
      <LeadsPageContent />
    </ProtectedRoute>
  );
}
