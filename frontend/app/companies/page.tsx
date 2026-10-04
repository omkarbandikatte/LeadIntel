"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ExternalLink, Plus, Search, Upload, X } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { SkeletonRows } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth-context";
import { listCompanies, createCompany, bulkUploadCompanies, type Company, type BulkUploadResponse } from "@/lib/api-client";

const STATUS_COLOR: Record<string, { color: string; soft: string }> = {
  enriched: { color: "var(--status-good)", soft: "var(--status-good-soft)" },
  pending: { color: "var(--text-muted)", soft: "var(--gridline)" },
  failed: { color: "var(--status-critical)", soft: "var(--status-critical-soft)" },
};

const PAGE_SIZE = 10;

function CompaniesContent() {
  const { token, role } = useAuth();
  const [results, setResults] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add company form
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Bulk upload
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResponse | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await listCompanies(token, { page, page_size: PAGE_SIZE, search: search || undefined });
      setResults(data.results);
      setTotal(data.total);
    } catch {
      setErrorMsg("Could not load companies.");
    } finally {
      setIsLoading(false);
    }
  }, [token, page, search]);

  useEffect(() => { load(); }, [load]);

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await createCompany(token, {
        name: newName,
        website: newWebsite || undefined,
        industry: newIndustry || undefined,
      });
      setNewName("");
      setNewWebsite("");
      setNewIndustry("");
      setShowForm(false);
      setPage(1);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create company.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBulkUpload() {
    if (!token || !bulkFile) return;
    setIsBulkUploading(true);
    setBulkResult(null);
    setBulkError(null);
    try {
      const result = await bulkUploadCompanies(token, bulkFile);
      setBulkResult(result);
      setBulkFile(null);
      load();
    } catch (err: unknown) {
      setBulkError(err instanceof Error ? err.message : "Bulk upload failed.");
    } finally {
      setIsBulkUploading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <BackButton />
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Companies</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              All tracked companies and their enrichment status.
            </p>
          </div>
          {role === "admin" && (
            <div className="flex gap-2">
              <button
                onClick={() => { setShowBulkUpload(false); setShowForm((v) => !v); setBulkResult(null); }}
                className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--series-1)]"
                style={{ borderColor: "var(--border)" }}>
                {showForm ? <X size={14} /> : <Plus size={14} />}
                {showForm ? "Cancel" : "Add company"}
              </button>
              <button
                onClick={() => { setShowForm(false); setShowBulkUpload((v) => !v); setBulkResult(null); }}
                className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.02]"
                style={{ backgroundColor: "var(--series-1)" }}>
                <Upload size={14} />
                {showBulkUpload ? "Cancel" : "Bulk upload CSV"}
              </button>
            </div>
          )}
        </div>

        {/* Bulk upload form */}
        {showBulkUpload && role === "admin" && (
          <div className="surface-card animate-scale-in mb-6 p-5">
            <h2 className="mb-1 text-sm font-semibold">Bulk upload via CSV</h2>
            <p className="mb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
              Required column: <code className="rounded px-1" style={{ backgroundColor: "var(--gridline)" }}>name</code>. Optional: <code className="rounded px-1" style={{ backgroundColor: "var(--gridline)" }}>website</code>, <code className="rounded px-1" style={{ backgroundColor: "var(--gridline)" }}>industry</code>.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => { setBulkFile(e.target.files?.[0] ?? null); setBulkResult(null); setBulkError(null); }}
                className="text-sm"
              />
              <button
                onClick={handleBulkUpload}
                disabled={!bulkFile || isBulkUploading}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: "var(--series-1)" }}>
                {isBulkUploading ? "Uploading…" : "Upload"}
              </button>
            </div>
            {bulkResult && (
              <div className="mt-3 rounded-xl p-3 text-sm" style={{ backgroundColor: "var(--surface-2)" }}>
                <span style={{ color: "var(--status-good)" }}>✓</span>
                {" "}Accepted <strong>{bulkResult.accepted}</strong>, rejected <strong>{bulkResult.rejected}</strong>
                {bulkResult.errors.length > 0 && (
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs" style={{ color: "var(--status-critical)" }}>
                    {bulkResult.errors.map((e) => (
                      <li key={e.row}>Row {e.row}: {e.reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {bulkError && <p className="mt-3 text-sm" style={{ color: "var(--status-critical)" }}>{bulkError}</p>}
          </div>
        )}

        {/* Add company form */}
        {showForm && role === "admin" && (
          <form onSubmit={handleCreate} className="surface-card animate-scale-in mb-6 p-5">
            <h2 className="mb-4 text-sm font-semibold">New company</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Company name *</label>
                <input required value={newName} onChange={(e) => setNewName(e.target.value)}
                  placeholder="Acme Corp" className="w-full rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--page-plane)" }} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Website</label>
                <input value={newWebsite} onChange={(e) => setNewWebsite(e.target.value)}
                  placeholder="https://acme.com" className="w-full rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--page-plane)" }} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Industry</label>
                <input value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)}
                  placeholder="Manufacturing" className="w-full rounded-lg border px-3 py-1.5 text-sm"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--page-plane)" }} />
              </div>
            </div>
            {formError && <p className="mt-2 text-sm" style={{ color: "var(--status-critical)" }}>{formError}</p>}
            <button type="submit" disabled={isSubmitting}
              className="mt-4 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: "var(--series-1)" }}>
              {isSubmitting ? "Adding…" : "Add company"}
            </button>
          </form>
        )}

        {/* Search */}
        <div className="surface-card mb-4 inline-flex w-full max-w-sm items-center gap-2 px-3 py-2">
          <Search size={15} style={{ color: "var(--text-muted)" }} />
          <input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-transparent text-sm outline-none" />
        </div>

        {errorMsg && <p className="mb-4 text-sm" style={{ color: "var(--status-critical)" }}>{errorMsg}</p>}

        <div className="surface-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonRows rows={10} cols={5} />}
              {!isLoading && results.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--text-secondary)" }}>No companies found.</td></tr>
              )}
              {!isLoading && results.map((company) => {
                const status = STATUS_COLOR[company.enrichment_status] ?? STATUS_COLOR.pending;
                return (
                  <tr key={company.id} className="border-b transition-colors last:border-0 hover:bg-[var(--surface-2)]" style={{ borderColor: "var(--gridline)" }}>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                          style={{ backgroundColor: "var(--series-1-soft)", color: "var(--series-1)" }}
                        >
                          <Building2 size={13} />
                        </span>
                        <Link href={`/companies/${company.id}`} className="hover:underline">{company.name}</Link>
                        {company.website && (
                          <a href={company.website} target="_blank" rel="noreferrer"
                            style={{ color: "var(--text-muted)" }}><ExternalLink size={12} /></a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{company.industry ?? "—"}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                      {[company.location_city, company.location_country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize"
                        style={{ backgroundColor: status.soft, color: status.color }}>
                        {company.enrichment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                      {new Date(company.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm" style={{ color: "var(--text-secondary)" }}>
            <span>Page {page} of {totalPages} · {total} companies</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border px-3 py-1 disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}>Previous</button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border px-3 py-1 disabled:opacity-40"
                style={{ borderColor: "var(--border)" }}>Next</button>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}

export default function CompaniesPage() {
  return (
    <ProtectedRoute allowedRoles={["manager", "admin"]}>
      <CompaniesContent />
    </ProtectedRoute>
  );
}
