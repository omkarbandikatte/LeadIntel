"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NavBar } from "@/components/NavBar";
import { useAuth } from "@/lib/auth-context";
import { listLeads, type LeadFilters, type LeadListResponse } from "@/lib/api-client";

const SERVICE_LINES = ["branding", "hiring", "learning_development", "iac_partnership"] as const;
const PAGE_SIZE = 25;

function scoreColor(score: number): string {
  if (score >= 80) return "var(--status-good)";
  if (score >= 60) return "var(--series-1)";
  return "var(--text-muted)";
}

function LeadsPageContent() {
  const { token } = useAuth();
  const [filters, setFilters] = useState<LeadFilters>({ sort: "score_desc", page: 1, page_size: PAGE_SIZE });
  const [data, setData] = useState<LeadListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-semibold">Ranked Leads</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Companies ranked by conversion probability, highest first.
        </p>

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
                {line.replace("_", " ")}
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
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>
                    Loading leads…
                  </td>
                </tr>
              )}
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
                    <td className="px-4 py-3 capitalize" style={{ color: "var(--text-secondary)" }}>
                      {lead.recommended_service?.replace("_", " ") ?? "—"}
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
    </div>
  );
}

export default function LeadsPage() {
  return (
    <ProtectedRoute>
      <LeadsPageContent />
    </ProtectedRoute>
  );
}
