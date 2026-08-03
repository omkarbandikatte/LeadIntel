"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { SkeletonRows } from "@/components/Skeleton";
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
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <BackButton />
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="mb-1 text-xl font-semibold sm:text-2xl">{header.title}</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{header.sub}</p>
          </div>
          {role === "admin" && (
            <div className="flex items-center gap-2">
              <button onClick={handleRunScoring}
                className="rounded-md border px-3 py-1.5 text-sm"
                style={{ borderColor: "var(--border)" }}>
                Run scoring
              </button>
              <Link href="/companies"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--series-1)" }}>
                + Add company
              </Link>
            </div>
          )}
        </div>
        {scoringMsg && (
          <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>{scoringMsg}</p>
        )}

        <div className="mb-6 flex flex-wrap gap-3">
          <input
            placeholder="Industry"
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
            onChange={(event) => updateFilter("industry", event.target.value || undefined)}
          />
          <input
            placeholder="Region"
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
            onChange={(event) => updateFilter("region", event.target.value || undefined)}
          />
          <select
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
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
            className="rounded-md border px-3 py-1.5 text-sm"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
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

        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Recommended</th>
                <th className="px-4 py-3 font-medium">Last scored</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows rows={10} cols={6} />}
              {!isLoading && data?.results.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                    No leads match these filters yet.
                  </td>
                </tr>
              )}
              {!isLoading &&
                data?.results.map((lead) => (
                  <tr
                    key={lead.company_id}
                    className="border-b last:border-0"
                    style={{ borderColor: "var(--gridline)" }}
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/companies/${lead.company_id}`} className="hover:underline">
                        {lead.company_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {lead.industry ?? "—"}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {lead.location ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold" style={{ color: scoreColor(lead.conversion_probability) }}>
                      {lead.conversion_probability.toFixed(1)}
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
                className="rounded-md border px-3 py-1 disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}
              >
                Previous
              </button>
              <button
                disabled={data.page >= totalPages}
                onClick={() => updateFilter("page", data.page + 1)}
                className="rounded-md border px-3 py-1 disabled:opacity-40"
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
