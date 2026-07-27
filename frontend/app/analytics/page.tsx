"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NavBar } from "@/components/NavBar";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { useAuth } from "@/lib/auth-context";
import { getTeamAnalytics, type TeamAnalytics } from "@/lib/api-client";

function AnalyticsPageContent() {
  const { token } = useAuth();
  const [analytics, setAnalytics] = useState<TeamAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    getTeamAnalytics(token)
      .then(setAnalytics)
      .finally(() => setIsLoading(false));
  }, [token]);

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-semibold">Team Analytics</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Score-band performance and model accuracy over time.
        </p>

        {isLoading && <p style={{ color: "var(--text-secondary)" }}>Loading analytics…</p>}

        {analytics && (
          <>
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-1">
              <div
                className="rounded-lg border p-5"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
              >
                <div className="text-3xl font-semibold">{analytics.total_leads_scored}</div>
                <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Total leads scored
                </div>
              </div>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div
                className="rounded-lg border p-5"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
              >
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Leads by score band
                </h2>
                <BarChart
                  data={analytics.score_band_performance.map((band) => ({ label: band.band, value: band.count }))}
                />
              </div>

              <div
                className="rounded-lg border p-5"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
              >
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Closed-won rate by score band
                </h2>
                <BarChart
                  data={analytics.score_band_performance.map((band) => ({
                    label: band.band,
                    value: Math.round(band.closed_won_rate * 100),
                  }))}
                  valueFormat={(value) => `${value}%`}
                  color="var(--status-good)"
                />
              </div>
            </div>

            <div
              className="rounded-lg border p-5"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
            >
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Model accuracy trend (top-1 recommendation)
              </h2>
              <LineChart
                data={analytics.model_accuracy_trend.map((point) => ({
                  label: point.period,
                  value: Math.round(point.top1_recommendation_accuracy * 100),
                }))}
                valueFormat={(value) => `${value}%`}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <ProtectedRoute allowedRoles={["manager", "admin"]}>
      <AnalyticsPageContent />
    </ProtectedRoute>
  );
}
