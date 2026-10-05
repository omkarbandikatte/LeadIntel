"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Plus, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ApiError, signupOrganization, type ServiceOfferingInput } from "@/lib/api-client";
import { BackButton } from "@/components/BackButton";
import { StarBorder } from "@/components/reactbits/StarBorder";

const INPUT_STYLE = {
  borderColor: "var(--border)",
  backgroundColor: "var(--surface-1)",
} as const;

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export default function SignupPage() {
  const [organizationName, setOrganizationName] = useState("");
  const [industry, setIndustry] = useState("");
  const [employeeCountBand, setEmployeeCountBand] = useState("");
  const [website, setWebsite] = useState("");

  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [offerings, setOfferings] = useState<{ label: string; description: string }[]>([
    { label: "", description: "" },
  ]);

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setSession } = useAuth();
  const router = useRouter();

  function updateOffering(index: number, field: "label" | "description", value: string) {
    setOfferings((prev) => prev.map((o, i) => (i === index ? { ...o, [field]: value } : o)));
  }

  function addOffering() {
    setOfferings((prev) => [...prev, { label: "", description: "" }]);
  }

  function removeOffering(index: number) {
    setOfferings((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const serviceOfferings: ServiceOfferingInput[] = offerings
      .filter((o) => o.label.trim())
      .map((o) => ({
        key: slugify(o.label),
        label: o.label.trim(),
        description: o.description.trim() || undefined,
      }));

    if (serviceOfferings.length === 0) {
      setError("Add at least one service or product your company offers.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await signupOrganization({
        organization_name: organizationName,
        industry: industry || undefined,
        employee_count_band: employeeCountBand || undefined,
        website: website || undefined,
        admin_full_name: adminFullName,
        admin_email: adminEmail,
        admin_password: adminPassword,
        service_offerings: serviceOfferings,
      });
      setSession(response.access_token, response.role);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create your workspace. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="lp-dark flex min-h-screen justify-center px-6 py-12" style={{ backgroundColor: "var(--page-plane)" }}>
      <div className="w-full max-w-xl">
        <div className="mb-8">
          <BackButton />
          <Link href="/" className="mb-4 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white"
              style={{ background: "linear-gradient(135deg, var(--series-1), var(--accent-l))" }}
            >
              <Sparkles size={16} />
            </span>
            LeadIntel
          </Link>
          <h1 className="font-display text-2xl font-bold tracking-tight">Set up your workspace</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Any company can use LeadIntel — tell us about your business and what you sell, and we&apos;ll start
            generating and scoring leads against your own ICP.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
              Your company
            </h2>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="org-name">
                Company name
              </label>
              <input
                id="org-name"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
                style={INPUT_STYLE}
                placeholder="Acme Robotics Pvt Ltd"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="org-industry">
                  Industry
                </label>
                <input
                  id="org-industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
                  style={INPUT_STYLE}
                  placeholder="SaaS, Manufacturing, Fintech…"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="org-size">
                  Company size
                </label>
                <select
                  id="org-size"
                  value={employeeCountBand}
                  onChange={(e) => setEmployeeCountBand(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
                  style={INPUT_STYLE}
                >
                  <option value="">Select…</option>
                  <option value="1-10">1-10</option>
                  <option value="11-50">11-50</option>
                  <option value="51-200">51-200</option>
                  <option value="201-1000">201-1000</option>
                  <option value="1000+">1000+</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="org-website">
                Website (optional)
              </label>
              <input
                id="org-website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
                style={INPUT_STYLE}
                placeholder="https://acme.example.com"
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                What do you sell?
              </h2>
              <button
                type="button"
                onClick={addOffering}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: "var(--surface-2)", color: "var(--series-1)" }}
              >
                <Plus size={12} /> Add service
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Leads will be scored and recommended against these — your own service catalog, not a fixed list.
            </p>
            {offerings.map((offering, index) => (
              <div key={index} className="flex gap-2 rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex-1 space-y-2">
                  <input
                    required
                    value={offering.label}
                    onChange={(e) => updateOffering(index, "label", e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                    style={INPUT_STYLE}
                    placeholder="e.g. Robotics Integration"
                  />
                  <input
                    value={offering.description}
                    onChange={(e) => updateOffering(index, "description", e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                    style={INPUT_STYLE}
                    placeholder="Short description for lead matching (optional)"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeOffering(index)}
                  disabled={offerings.length === 1}
                  className="shrink-0 self-start rounded-lg p-2 transition-colors disabled:opacity-30"
                  style={{ color: "var(--status-critical)" }}
                  aria-label="Remove service"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
              Your admin account
            </h2>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="admin-name">
                Full name
              </label>
              <input
                id="admin-name"
                required
                value={adminFullName}
                onChange={(e) => setAdminFullName(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="admin-email">
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2"
                style={INPUT_STYLE}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="admin-password">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2.5 pr-10 text-sm outline-none focus:ring-2"
                  style={INPUT_STYLE}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3"
                  style={{ color: "var(--text-muted)" }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </section>

          {error && (
            <p className="text-sm" style={{ color: "var(--status-critical)" }}>
              {error}
            </p>
          )}

          <StarBorder color="var(--series-1)" speed="4s" className="w-full">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold shadow-sm transition-transform hover:scale-[1.01] disabled:opacity-60"
              style={{ backgroundColor: "var(--series-1)", color: "var(--on-accent)" }}
            >
              {isSubmitting ? "Setting up your workspace…" : "Create workspace"}
            </button>
          </StarBorder>

          <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
            Already have an account?{" "}
            <Link href="/login" className="font-medium" style={{ color: "var(--series-1)" }}>
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
