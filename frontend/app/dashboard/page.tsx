"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Play,
  Rocket,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { SkeletonCard, SkeletonRows } from "@/components/Skeleton";
import { CountUp } from "@/components/reactbits/CountUp";
import { SpotlightCard } from "@/components/reactbits/SpotlightCard";
import { GradientText } from "@/components/reactbits/GradientText";
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

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ElementType;
}) {
  return (
    <SpotlightCard className="surface-card animate-scale-in p-5" spotlightColor="var(--series-1-soft)">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-display text-3xl font-bold">
            {typeof value === "number" ? <CountUp to={value} duration={1.2} /> : value}
          </div>
          <div className="mt-1 text-sm font-medium">{label}</div>
          {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{sub}</div>}
        </div>
        {Icon && (
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--series-1-soft)", color: "var(--series-1)" }}
          >
            <Icon size={18} />
          </span>
        )}
      </div>
    </SpotlightCard>
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
      <main className="max-w-6xl px-4 py-6 sm:px-6 sm:py-8 2xl:max-w-[1600px]">
        <h1 className="mb-1 font-display text-xl font-bold tracking-tight sm:text-2xl">
          <GradientText animationSpeed={8}>My Pipeline</GradientText>
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Your top leads to focus on today, ranked by conversion probability.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isLoading ? <><SkeletonCard /><SkeletonCard /></> : (
            <><StatCard label="Total leads" value={total} icon={Target} />
            <StatCard label="High priority" value={highPriority} sub="score ≥ 75" icon={Rocket} /></>
          )}
        </div>

        <div className="surface-card overflow-hidden">
          <div className="border-b px-4 py-3 text-sm font-semibold"
            style={{ borderColor: "var(--border)" }}>
            Top leads to action
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 text-center font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Recommended service</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows rows={5} cols={4} />}
              {!isLoading && leads.map((lead) => (
                <tr key={lead.company_id} className="border-b transition-colors last:border-0 hover:bg-[var(--surface-2)]" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/companies/${lead.company_id}`} className="hover:underline">{lead.company_name}</Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{lead.industry ?? "—"}</td>
                  <td className="px-4 py-3 text-center"><ScoreChip score={lead.conversion_probability} /></td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {lead.recommended_service ? (SERVICE_LABELS[lead.recommended_service] ?? lead.recommended_service) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t px-4 py-3 text-center" style={{ borderColor: "var(--border)" }}>
            <Link href="/leads" className="text-sm font-medium hover:underline" style={{ color: "var(--series-1)" }}>
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
      <main className="max-w-6xl px-4 py-6 sm:px-6 sm:py-8 2xl:max-w-[1600px]">
        <h1 className="mb-1 font-display text-xl font-bold tracking-tight sm:text-2xl">
          <GradientText animationSpeed={8}>Team Overview</GradientText>
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Pipeline health and model performance across your team.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {isLoading ? <><SkeletonCard /><SkeletonCard /><SkeletonCard /></> : (
            <><StatCard label="Total leads scored" value={analytics?.total_leads_scored ?? "—"} icon={Target} />
            <StatCard label="Active pipeline" value={total} icon={TrendingUp} />
            <StatCard label="Avg score (top 5)" value={avgProb} icon={Rocket} /></>
          )}
        </div>

        {analytics && (
          <div className="surface-card mb-6 p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Score band breakdown
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {analytics.score_band_performance.map((band) => (
                <div key={band.band} className="rounded-xl p-3 text-center"
                  style={{ backgroundColor: "var(--surface-2)" }}>
                  <div className="text-xl font-bold">{band.count}</div>
                  <div className="text-xs font-medium capitalize" style={{ color: "var(--text-secondary)" }}>{band.band}</div>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {Math.round(band.closed_won_rate * 100)}% won
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="surface-card overflow-hidden">
          <div className="border-b px-4 py-3 text-sm font-semibold"
            style={{ borderColor: "var(--border)" }}>
            Top leads
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 text-center font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Last scored</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows rows={5} cols={4} />}
              {!isLoading && leads.map((lead) => (
                <tr key={lead.company_id} className="border-b transition-colors last:border-0 hover:bg-[var(--surface-2)]" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/companies/${lead.company_id}`} className="hover:underline">{lead.company_name}</Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{lead.industry ?? "—"}</td>
                  <td className="px-4 py-3 text-center"><ScoreChip score={lead.conversion_probability} /></td>
                  <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                    {new Date(lead.last_scored_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t px-4 py-3 flex justify-between text-sm" style={{ borderColor: "var(--border)" }}>
            <Link href="/leads" className="font-medium hover:underline" style={{ color: "var(--series-1)" }}>View all leads →</Link>
            <Link href="/analytics" className="font-medium hover:underline" style={{ color: "var(--series-1)" }}>Full analytics →</Link>
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
      <main className="max-w-6xl px-4 py-6 sm:px-6 sm:py-8 2xl:max-w-[1600px]">
        <h1 className="mb-1 font-display text-xl font-bold tracking-tight sm:text-2xl">
          <GradientText animationSpeed={8}>System Dashboard</GradientText>
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          System health, quick actions, and recent pipeline activity.
        </p>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {isLoading ? <><SkeletonCard /><SkeletonCard /><SkeletonCard /></> : (
            <><StatCard label="Total companies" value={companies?.total ?? "—"} icon={Building2} />
            <StatCard label="Active users" value={pendingCount} icon={Users} />
            <StatCard label="Roles" value={3} sub="admin · manager · bd_executive" icon={ShieldCheck} /></>
          )}
        </div>

        {/* Quick actions */}
        <div className="surface-card mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Quick actions
          </h2>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => runScoring("incremental")}
              className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--series-1)]"
              style={{ borderColor: "var(--border)" }}>
              <Play size={14} />
              Run incremental scoring
            </button>
            <button onClick={() => runScoring("full")}
              className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--series-1)]"
              style={{ borderColor: "var(--border)" }}>
              <Rocket size={14} />
              Run full scoring
            </button>
            <Link href="/companies"
              className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--series-1)]"
              style={{ borderColor: "var(--border)" }}>
              <Building2 size={14} />
              Manage companies
            </Link>
            <Link href="/admin"
              className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--series-1)]"
              style={{ borderColor: "var(--border)" }}>
              <Settings size={14} />
              Manage users
            </Link>
          </div>
          {scoringStatus && (
            <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>{scoringStatus}</p>
          )}
        </div>

        {/* Recent top leads */}
        <div className="surface-card overflow-hidden">
          <div className="border-b px-4 py-3 text-sm font-semibold"
            style={{ borderColor: "var(--border)" }}>
            Top leads (most recent scoring)
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 text-center font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Recommended</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows rows={5} cols={4} />}
              {!isLoading && leads.map((lead) => (
                <tr key={lead.company_id} className="border-b transition-colors last:border-0 hover:bg-[var(--surface-2)]" style={{ borderColor: "var(--gridline)" }}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/companies/${lead.company_id}`} className="hover:underline">{lead.company_name}</Link>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{lead.industry ?? "—"}</td>
                  <td className="px-4 py-3 text-center"><ScoreChip score={lead.conversion_probability} /></td>
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
