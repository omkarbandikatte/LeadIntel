"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { Skeleton } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth-context";
import {
  ApiError,
  getCompany,
  getCompanyDocuments,
  getLeadExplanation,
  submitLeadFeedback,
  triggerEnrichment,
  type CompanyDetail,
  type LeadExplanation,
  type RawDocument,
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

function CompanyDetailContent() {
  const { token } = useAuth();
  const params = useParams<{ id: string }>();
  const companyId = params.id;

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [documents, setDocuments] = useState<RawDocument[]>([]);
  const [explanation, setExplanation] = useState<LeadExplanation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    try {
      const [companyResult, documentsResult] = await Promise.all([
        getCompany(token, companyId),
        getCompanyDocuments(token, companyId),
      ]);
      setCompany(companyResult);
      setDocuments(documentsResult);
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
        <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
          <BackButton />
          {/* Header skeleton */}
          <div className="mb-6 flex items-start justify-between">
            <div className="flex-1">
              <Skeleton className="mb-2 h-7 w-52" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
          {/* Score card skeleton */}
          <div className="mb-6 rounded-lg border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
            <Skeleton className="mb-4 h-3.5 w-32" />
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          </div>
          {/* Documents skeleton */}
          <div className="rounded-lg border p-5" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
            <Skeleton className="mb-4 h-3.5 w-40" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <BackButton />
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold sm:text-2xl">{company.name}</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {[company.industry, company.location_city, company.location_country].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <span
              className="rounded-full px-3 py-1 text-xs font-medium capitalize"
              style={{ backgroundColor: "var(--gridline)", color: STATUS_COLOR[company.enrichment_status] }}
            >
              {company.enrichment_status}
            </span>
            <button
              onClick={handleEnrich}
              className="mt-2 block rounded-md border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--border)" }}
            >
              Re-run enrichment
            </button>
          </div>
        </div>

        <section
          className="mb-6 rounded-lg border p-5"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Score explanation
          </h2>
          {explanation ? (
            <>
              <div className="mb-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-semibold" style={{ color: "var(--series-1)" }}>
                    {explanation.conversion_probability.toFixed(1)}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Conversion probability
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">{explanation.fit_score?.toFixed(1) ?? "—"}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Fit score
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-semibold">{explanation.intent_score?.toFixed(1) ?? "—"}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Intent score
                  </div>
                </div>
              </div>

              {explanation.recommended_service && (
                <p className="mb-4 text-sm">
                  Recommended: <span className="font-medium">{serviceLabel(explanation.recommended_service)}</span>{" "}
                  <span style={{ color: "var(--text-muted)" }}>
                    ({Math.round((explanation.recommendation_confidence ?? 0) * 100)}% confidence)
                  </span>
                </p>
              )}

              {explanation.service_probabilities && Object.keys(explanation.service_probabilities).length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    Service requirement probabilities
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(explanation.service_probabilities)
                      .sort(([, a], [, b]) => b - a)
                      .map(([service, probability]) => (
                        <div
                          key={service}
                          className="flex items-center justify-between rounded-md px-3 py-2 text-sm"
                          style={{ backgroundColor: "var(--gridline)" }}
                        >
                          <span>{serviceLabel(service)}</span>
                          <span
                            className="font-semibold"
                            style={{
                              color:
                                probability >= 50
                                  ? "var(--status-good)"
                                  : probability >= 25
                                  ? "var(--series-1)"
                                  : "var(--text-secondary)",
                            }}
                          >
                            {probability.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <ul className="mb-4 space-y-1.5 text-sm">
                {explanation.top_factors.map((factor, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span style={{ color: factor.weight >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                      {factor.weight >= 0 ? "▲" : "▼"}
                    </span>
                    <span>{factor.factor}</span>
                  </li>
                ))}
              </ul>

              <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
                Model: {explanation.model_version}
              </p>

              {!feedbackSent ? (
                <div className="flex gap-2 text-sm">
                  <span style={{ color: "var(--text-secondary)" }}>Is this score accurate?</span>
                  <button onClick={() => handleFeedback(true)} className="font-medium" style={{ color: "var(--status-good)" }}>
                    Yes
                  </button>
                  <button onClick={() => handleFeedback(false)} className="font-medium" style={{ color: "var(--status-critical)" }}>
                    No
                  </button>
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Thanks — feedback recorded.</p>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Not scored yet — trigger enrichment to generate a score.
            </p>
          )}
        </section>

        <section
          className="rounded-lg border p-5"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
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
                      <a href={document.source_url} target="_blank" rel="noreferrer" className="hover:underline">
                        source ↗
                      </a>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm">{document.raw_text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
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
