"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { SkeletonCard, SkeletonRows } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth-context";
import {
  listLeads,
  getTeamAnalytics,
  listCompanies,
  listUsers,
  triggerScoring,
  type LeadListItem,
  type TeamAnalytics,
  type CompanyListResponse,
  type UserListResponse,
} from "@/lib/api-client";

const SERVICE_LABELS: Record<string, string> = {
  branding: "Employer Branding",
  hiring: "Recruitment & Hiring",
  learning_development: "Learning & Development",
  iac_partnership: "Industry-Academia Partnership",
};

function scoreColor(score: number) {
  if (score >= 75) return "var(--status-good)";
  if (score >= 55) return "var(--series-1)";
  return "var(--text-muted)";
}

function ScoreChip({ score }: { score: number }) {
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: "var(--gridline)", color: scoreColor(score) }}>
      {score.toFixed(1)}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
      <div className="text-3xl font-semibold">{value}</div>
      <div className="mt-1 text-sm font-medium">{label}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

// ───────────── BD Executive view ─────────────
function BdDashboard() {
  const { token } = useAuth();
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [highPriority, setHighPriority] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      listLeads(token, { sort: "score_desc", page: 1, page_size: 5 }),
      listLeads(token, { min_score: 75, page_size: 1 }),
    ]).then(([top, hp]) => {
      setLeads(top.results);
      setTotal(top.total);
      setHighPriority(hp.total);
    }).finally(() => setIsLoading(false));
  }, [token]);

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-1 text-xl font-semibold sm:text-2xl">My Pipeline</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Your top leads to focus on today, ranked by conversion probability.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isLoading ? <><SkeletonCard /><SkeletonCard /></> : (
            <><StatCard label="Total leads" value={total} />
            <StatCard label="High priority" value={highPriority} sub="score ≥ 75" /></>
          )}
        </div>

        <div className="rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <div className="border-b px-4 py-3 text-sm font-semibold"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
            Top leads to action
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Recommended service</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows rows={5} cols={4} />}
              {!isLoading && leads.map((lead) => (
                <tr key={lead.company_id} className="border-b last:border-0" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/companies/${lead.company_id}`} className="hover:underline">{lead.company_name}</Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{lead.industry ?? "—"}</td>
                  <td className="px-4 py-3"><ScoreChip score={lead.conversion_probability} /></td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {lead.recommended_service ? (SERVICE_LABELS[lead.recommended_service] ?? lead.recommended_service) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t px-4 py-3 text-center" style={{ borderColor: "var(--border)" }}>
            <Link href="/leads" className="text-sm hover:underline" style={{ color: "var(--series-1)" }}>
              View all {total} leads →
            </Link>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

// ───────────── Manager view ─────────────
function ManagerDashboard() {
  const { token } = useAuth();
  const [analytics, setAnalytics] = useState<TeamAnalytics | null>(null);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      getTeamAnalytics(token),
      listLeads(token, { sort: "score_desc", page: 1, page_size: 5 }),
    ]).then(([a, l]) => {
      setAnalytics(a);
      setLeads(l.results);
      setTotal(l.total);
    }).finally(() => setIsLoading(false));
  }, [token]);

  const avgProb = leads.length
    ? (leads.reduce((s, l) => s + l.conversion_probability, 0) / leads.length).toFixed(1)
    : "—";

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-1 text-xl font-semibold sm:text-2xl">Team Overview</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Pipeline health and model performance across your team.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {isLoading ? <><SkeletonCard /><SkeletonCard /><SkeletonCard /></> : (
            <><StatCard label="Total leads scored" value={analytics?.total_leads_scored ?? "—"} />
            <StatCard label="Active pipeline" value={total} />
            <StatCard label="Avg score (top 5)" value={avgProb} /></>
          )}
        </div>

        {analytics && (
          <div className="mb-6 rounded-lg border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Score band breakdown
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {analytics.score_band_performance.map((band) => (
                <div key={band.band} className="rounded-md p-3 text-center"
                  style={{ backgroundColor: "var(--gridline)" }}>
                  <div className="text-xl font-semibold">{band.count}</div>
                  <div className="text-xs font-medium capitalize" style={{ color: "var(--text-secondary)" }}>{band.band}</div>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {Math.round(band.closed_won_rate * 100)}% won
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <div className="border-b px-4 py-3 text-sm font-semibold"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
            Top leads
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Last scored</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows rows={5} cols={4} />}
              {!isLoading && leads.map((lead) => (
                <tr key={lead.company_id} className="border-b last:border-0" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/companies/${lead.company_id}`} className="hover:underline">{lead.company_name}</Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{lead.industry ?? "—"}</td>
                  <td className="px-4 py-3"><ScoreChip score={lead.conversion_probability} /></td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {new Date(lead.last_scored_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t px-4 py-3 flex justify-between text-sm" style={{ borderColor: "var(--border)" }}>
            <Link href="/leads" className="hover:underline" style={{ color: "var(--series-1)" }}>View all leads →</Link>
            <Link href="/analytics" className="hover:underline" style={{ color: "var(--series-1)" }}>Full analytics →</Link>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

// ───────────── Admin view ─────────────
function AdminDashboard() {
  const { token } = useAuth();
  const [companies, setCompanies] = useState<CompanyListResponse | null>(null);
  const [users, setUsers] = useState<UserListResponse | null>(null);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scoringStatus, setScoringStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const [c, u, l] = await Promise.all([
      listCompanies(token, { page_size: 1 }),
      listUsers(token),
      listLeads(token, { sort: "score_desc", page_size: 5 }),
    ]);
    setCompanies(c);
    setUsers(u);
    setLeads(l.results);
  }, [token]);

  useEffect(() => { load().finally(() => setIsLoading(false)); }, [load]);

  const pendingCount = users?.results.filter((u) => u.is_active).length ?? 0;

  async function runScoring(mode: "full" | "incremental") {
    if (!token) return;
    setScoringStatus("Queuing…");
    try {
      const result = await triggerScoring(token, mode);
      setScoringStatus(`✓ Queued (task ${result.task_id.slice(0, 8)}…)`);
    } catch {
      setScoringStatus("Failed to queue scoring run.");
    }
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-1 text-xl font-semibold sm:text-2xl">System Dashboard</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          System health, quick actions, and recent pipeline activity.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {isLoading ? <><SkeletonCard /><SkeletonCard /><SkeletonCard /></> : (
            <><StatCard label="Total companies" value={companies?.total ?? "—"} />
            <StatCard label="Active users" value={pendingCount} />
            <StatCard label="Roles" value={3} sub="admin · manager · bd_executive" /></>
          )}
        </div>

        {/* Quick actions */}
        <div className="mb-6 rounded-lg border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Quick actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => runScoring("incremental")}
              className="rounded-md border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--border)" }}>
              Run incremental scoring
            </button>
            <button onClick={() => runScoring("full")}
              className="rounded-md border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--border)" }}>
              Run full scoring
            </button>
            <Link href="/companies"
              className="rounded-md border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--border)" }}>
              Manage companies
            </Link>
            <Link href="/admin"
              className="rounded-md border px-4 py-2 text-sm font-medium"
              style={{ borderColor: "var(--border)" }}>
              Manage users
            </Link>
          </div>
          {scoringStatus && (
            <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>{scoringStatus}</p>
          )}
        </div>

        {/* Recent top leads */}
        <div className="rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <div className="border-b px-4 py-3 text-sm font-semibold"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
            Top leads (most recent scoring)
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Recommended</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows rows={5} cols={4} />}
              {!isLoading && leads.map((lead) => (
                <tr key={lead.company_id} className="border-b last:border-0" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/companies/${lead.company_id}`} className="hover:underline">{lead.company_name}</Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{lead.industry ?? "—"}</td>
                  <td className="px-4 py-3"><ScoreChip score={lead.conversion_probability} /></td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {lead.recommended_service ? (SERVICE_LABELS[lead.recommended_service] ?? lead.recommended_service) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t px-4 py-3 text-center" style={{ borderColor: "var(--border)" }}>
            <Link href="/leads" className="text-sm hover:underline" style={{ color: "var(--series-1)" }}>
              View all leads →
            </Link>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

// ───────────── Router ─────────────
function DashboardContent() {
  const { role } = useAuth();

  if (role === "admin") return <AdminDashboard />;
  if (role === "manager") return <ManagerDashboard />;
  return <BdDashboard />;
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
