"use client";
import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { SkeletonRows, Skeleton } from "@/components/Skeleton";
import { useAuth } from "@/lib/auth-context";
import {
  listUsers,
  createUser,
  triggerScoring,
  triggerCrmSync,
  type UserItem,
  type ScoringRunResponse,
  type CrmSyncResponse,
} from "@/lib/api-client";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  bd_executive: "BD Executive",
};

const ROLE_COLOR: Record<string, string> = {
  admin: "var(--status-critical)",
  manager: "var(--series-1)",
  bd_executive: "var(--status-good)",
};

function AdminContent() {
  const { token } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add user form
  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"bd_executive" | "manager" | "admin">("bd_executive");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Scoring
  const [scoringResult, setScoringResult] = useState<ScoringRunResponse | null>(null);
  const [scoringError, setScoringError] = useState<string | null>(null);
  const [isScoringRunning, setIsScoringRunning] = useState(false);

  // CRM sync
  const [syncResult, setSyncResult] = useState<CrmSyncResponse | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncRunning, setIsSyncRunning] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await listUsers(token);
      setUsers(data.results);
    } catch {
      setErrorMsg("Could not load users.");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setIsSubmitting(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      const user = await createUser(token, {
        email: newEmail,
        full_name: newFullName,
        password: newPassword,
        role: newRole,
      });
      setFormSuccess(`User "${user.email}" created successfully.`);
      setNewEmail("");
      setNewFullName("");
      setNewPassword("");
      setNewRole("bd_executive");
      setShowForm(false);
      load();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleScoring(mode: "full" | "incremental") {
    if (!token) return;
    setIsScoringRunning(true);
    setScoringResult(null);
    setScoringError(null);
    try {
      const result = await triggerScoring(token, mode);
      setScoringResult(result);
    } catch (err: unknown) {
      setScoringError(err instanceof Error ? err.message : "Failed to queue scoring.");
    } finally {
      setIsScoringRunning(false);
    }
  }

  async function handleSync(direction: "push" | "pull") {
    if (!token) return;
    setIsSyncRunning(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const result = await triggerCrmSync(token, direction);
      setSyncResult(result);
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : "CRM sync failed.");
    } finally {
      setIsSyncRunning(false);
    }
  }

  const byRole = {
    admin: users.filter((u) => u.role === "admin"),
    manager: users.filter((u) => u.role === "manager"),
    bd_executive: users.filter((u) => u.role === "bd_executive"),
  };

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <BackButton />
        <h1 className="mb-1 text-xl font-semibold sm:text-2xl">Admin Panel</h1>
        <p className="mb-8 text-sm" style={{ color: "var(--text-secondary)" }}>
          User management, scoring controls, and CRM sync.
        </p>

        {/* ── Scoring ── */}
        <section className="mb-8 rounded-lg border p-5"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
          <h2 className="mb-1 text-base font-semibold">Scoring engine</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            Trigger a scoring run against all companies. Incremental only processes unscored companies; full re-scores everything.
          </p>
          <div className="flex gap-3">
            <button
              disabled={isScoringRunning}
              onClick={() => handleScoring("incremental")}
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}>
              {isScoringRunning ? "Queuing…" : "Run incremental"}
            </button>
            <button
              disabled={isScoringRunning}
              onClick={() => handleScoring("full")}
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}>
              {isScoringRunning ? "Queuing…" : "Run full rescore"}
            </button>
          </div>
          {scoringResult && (
            <div className="mt-3 rounded-md p-3 text-sm" style={{ backgroundColor: "var(--gridline)" }}>
              <span style={{ color: "var(--status-good)" }}>✓ Queued</span>
              {" — "}Mode: <strong>{scoringResult.mode}</strong>
              {" · "}Model: <strong>{scoringResult.model_version}</strong>
              {" · "}Task: <code className="text-xs">{scoringResult.task_id.slice(0, 16)}…</code>
            </div>
          )}
          {scoringError && (
            <p className="mt-3 text-sm" style={{ color: "var(--status-critical)" }}>{scoringError}</p>
          )}
        </section>

        {/* ── CRM Sync ── */}
        <section className="mb-8 rounded-lg border p-5"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
          <h2 className="mb-1 text-base font-semibold">CRM sync</h2>
          <p className="mb-4 text-sm" style={{ color: "var(--text-secondary)" }}>
            <strong>Push</strong> exports scored leads to a CSV in <code className="text-xs">data/crm_sync/export/</code>.
            {" "}<strong>Pull</strong> imports won/lost outcomes from that CSV to update deal records and feed the retraining loop.
          </p>
          <div className="flex gap-3">
            <button
              disabled={isSyncRunning}
              onClick={() => handleSync("push")}
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}>
              {isSyncRunning ? "Syncing…" : "Push to CSV"}
            </button>
            <button
              disabled={isSyncRunning}
              onClick={() => handleSync("pull")}
              className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: "var(--border)" }}>
              {isSyncRunning ? "Syncing…" : "Pull from CSV"}
            </button>
          </div>
          {syncResult && (
            <div className="mt-3 rounded-md p-3 text-sm" style={{ backgroundColor: "var(--gridline)" }}>
              <span style={{ color: "var(--status-good)" }}>✓</span>
              {" "}Direction: <strong>{syncResult.direction}</strong>
              {" · "}Records: <strong>{syncResult.record_count}</strong>
              {" · "}Status: <strong>{syncResult.status}</strong>
              {syncResult.error_detail && (
                <span style={{ color: "var(--status-critical)" }}> · {syncResult.error_detail}</span>
              )}
            </div>
          )}
          {syncError && (
            <p className="mt-3 text-sm" style={{ color: "var(--status-critical)" }}>{syncError}</p>
          )}
        </section>

        {/* ── Users ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Users ({users.length})</h2>
            <button
              onClick={() => { setShowForm((v) => !v); setFormError(null); setFormSuccess(null); }}
              className="rounded-md px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--series-1)" }}>
              {showForm ? "Cancel" : "+ Add user"}
            </button>
          </div>

          {formSuccess && (
            <p className="mb-4 rounded-md p-3 text-sm" style={{ backgroundColor: "var(--gridline)", color: "var(--status-good)" }}>
              {formSuccess}
            </p>
          )}

          {showForm && (
            <form onSubmit={handleCreateUser}
              className="mb-6 rounded-lg border p-5"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)" }}>
              <h3 className="mb-4 text-sm font-semibold">New user</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium">Full name *</label>
                  <input required value={newFullName} onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="Jane Smith" className="w-full rounded-md border px-3 py-1.5 text-sm"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--page-plane)" }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Email *</label>
                  <input required type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="jane@cloudcounselage.com" className="w-full rounded-md border px-3 py-1.5 text-sm"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--page-plane)" }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Password * (min 8 chars)</label>
                  <input required type="password" minLength={8} value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-md border px-3 py-1.5 text-sm"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--page-plane)" }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Role *</label>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value as typeof newRole)}
                    className="w-full rounded-md border px-3 py-1.5 text-sm"
                    style={{ borderColor: "var(--border)", backgroundColor: "var(--page-plane)" }}>
                    <option value="bd_executive">BD Executive</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              {formError && <p className="mt-3 text-sm" style={{ color: "var(--status-critical)" }}>{formError}</p>}
              <button type="submit" disabled={isSubmitting}
                className="mt-4 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                style={{ backgroundColor: "var(--series-1)" }}>
                {isSubmitting ? "Creating…" : "Create user"}
              </button>
            </form>
          )}

          {errorMsg && <p className="mb-4 text-sm" style={{ color: "var(--status-critical)" }}>{errorMsg}</p>}

          {isLoading ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex items-center gap-4 rounded-md border px-4 py-3" style={{ borderColor: "var(--border)" }}>
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {(["admin", "manager", "bd_executive"] as const).map((roleKey) => (
                byRole[roleKey].length > 0 && (
                  <div key={roleKey} className="rounded-lg border overflow-hidden"
                    style={{ borderColor: "var(--border)" }}>
                    <div className="border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
                      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface-1)", color: ROLE_COLOR[roleKey] }}>
                      {ROLE_LABELS[roleKey]} ({byRole[roleKey].length})
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {byRole[roleKey].map((user) => (
                          <tr key={user.id} className="border-b last:border-0" style={{ borderColor: "var(--gridline)" }}>
                            <td className="px-4 py-3 font-medium">{user.full_name}</td>
                            <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{user.email}</td>
                            <td className="px-4 py-3">
                              <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                                style={{
                                  backgroundColor: "var(--gridline)",
                                  color: user.is_active ? "var(--status-good)" : "var(--status-critical)",
                                }}>
                                {user.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}

export default function AdminPage() {
  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AdminContent />
    </ProtectedRoute>
  );
}
