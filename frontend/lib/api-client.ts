// Typed client matching 03_API_SPECIFICATION.md exactly — the frontend never
// calls a third-party API directly (01_TECHNICAL_ARCHITECTURE.md §2.6).

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; token?: string | null; body?: unknown; query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const { method = "GET", token, body, query } = options;

  const url = new URL(`${API_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let code = "UNKNOWN_ERROR";
    let message = response.statusText;
    try {
      const payload = await response.json();
      code = payload?.error?.code ?? code;
      message = payload?.error?.message ?? message;
    } catch {
      // response had no JSON body
    }
    throw new ApiError(response.status, code, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// ---- Auth ----

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: "bd_executive" | "manager" | "admin";
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/api/auth/login", { method: "POST", body: { email, password } });
}

// ---- Companies ----

export interface Company {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  employee_count_band: string | null;
  revenue_band: string | null;
  location_city: string | null;
  location_state: string | null;
  location_country: string | null;
  incorporation_date: string | null;
  source: string | null;
  enrichment_status: "pending" | "enriched" | "failed";
  created_at: string;
  updated_at: string;
}

export interface NLPFeatureSummary {
  predicted_need_category: string | null;
  confidence: number | null;
  processed_at: string;
}

export interface CompanyDetail extends Company {
  latest_nlp_features: NLPFeatureSummary[];
}

export interface RawDocument {
  id: string;
  doc_type: string;
  source_url: string | null;
  raw_text: string | null;
  scraped_at: string;
}

export function createCompany(
  token: string,
  payload: { name: string; website?: string; industry?: string }
): Promise<Company> {
  return request<Company>("/api/companies", { method: "POST", token, body: payload });
}

export function getCompany(token: string, companyId: string): Promise<CompanyDetail> {
  return request<CompanyDetail>(`/api/companies/${companyId}`, { token });
}

export function triggerEnrichment(
  token: string,
  companyId: string
): Promise<{ company_id: string; enrichment_status: string; message: string }> {
  return request(`/api/companies/${companyId}/enrich`, { method: "POST", token });
}

export function getCompanyDocuments(token: string, companyId: string): Promise<RawDocument[]> {
  return request<RawDocument[]>(`/api/companies/${companyId}/documents`, { token });
}

// ---- Leads ----

export interface LeadListItem {
  company_id: string;
  company_name: string;
  conversion_probability: number;
  recommended_service: string | null;
  recommendation_confidence: number | null;
  industry: string | null;
  location: string | null;
  last_scored_at: string;
}

export interface LeadListResponse {
  total: number;
  page: number;
  page_size: number;
  results: LeadListItem[];
}

export interface LeadFilters {
  sort?: "score_desc" | "score_asc" | "recent";
  min_score?: number;
  max_score?: number;
  industry?: string;
  region?: string;
  recommended_service?: string;
  page?: number;
  page_size?: number;
}

export function listLeads(token: string, filters: LeadFilters = {}): Promise<LeadListResponse> {
  return request<LeadListResponse>("/api/leads", { token, query: filters as Record<string, string | number | undefined> });
}

export interface TopFactor {
  factor: string;
  weight: number;
}

export interface LeadExplanation {
  company_id: string;
  fit_score: number | null;
  intent_score: number | null;
  conversion_probability: number;
  top_factors: TopFactor[];
  recommended_service: string | null;
  recommendation_confidence: number | null;
  service_probabilities: Record<string, number> | null;
  model_version: string | null;
}

export function getLeadExplanation(token: string, companyId: string): Promise<LeadExplanation> {
  return request<LeadExplanation>(`/api/leads/${companyId}/explanation`, { token });
}

export function submitLeadFeedback(
  token: string,
  companyId: string,
  payload: { is_accurate: boolean; comment?: string }
) {
  return request(`/api/leads/${companyId}/feedback`, { method: "POST", token, body: payload });
}

// ---- Analytics ----

export interface ScoreBandPerformance {
  band: string;
  count: number;
  closed_won_rate: number;
}

export interface ModelAccuracyPoint {
  period: string;
  top1_recommendation_accuracy: number;
}

export interface TeamAnalytics {
  total_leads_scored: number;
  score_band_performance: ScoreBandPerformance[];
  model_accuracy_trend: ModelAccuracyPoint[];
}

export function getTeamAnalytics(token: string): Promise<TeamAnalytics> {
  return request<TeamAnalytics>("/api/analytics/team", { token });
}

// ---- Extended Analytics ----

export interface ExtendedAnalytics {
  total_leads_scored: number;
  avg_conversion_probability: number;
  enrichment_breakdown: { pending: number; enriched: number; failed: number };
  service_performance: {
    service: string;
    recommended_count: number;
    won_count: number;
    lost_count: number;
  }[];
  industry_performance: { industry: string; count: number; win_rate: number }[];
  deal_pipeline: { open: number; won: number; lost: number; total_deal_value: number };
  score_distribution: { bucket: string; count: number }[];
  feedback_summary: { accurate: number; inaccurate: number };
  scoring_activity_14d: { date: string; count: number }[];
  score_band_performance: ScoreBandPerformance[];
  model_accuracy_trend: ModelAccuracyPoint[];
}

export function getExtendedAnalytics(token: string): Promise<ExtendedAnalytics> {
  return request<ExtendedAnalytics>("/api/analytics/extended", { token });
}

// ---- CRM sync ----

export interface CrmSyncResponse {
  direction: "push" | "pull";
  record_count: number;
  status: string;
  error_detail: string | null;
}

export function triggerCrmSync(token: string, direction: "push" | "pull"): Promise<CrmSyncResponse> {
  return request<CrmSyncResponse>("/api/crm/sync", { method: "POST", token, body: { direction } });
}

// ---- Bulk upload ----

export interface BulkUploadRowError {
  row: number;
  reason: string;
}

export interface BulkUploadResponse {
  accepted: number;
  rejected: number;
  errors: BulkUploadRowError[];
}

export async function bulkUploadCompanies(token: string, file: File): Promise<BulkUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/companies/bulk-upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    let code = "UNKNOWN_ERROR";
    let message = response.statusText;
    try {
      const payload = await response.json();
      code = payload?.error?.code ?? code;
      message = payload?.error?.message ?? message;
    } catch { /* no-op */ }
    throw new ApiError(response.status, code, message);
  }

  return response.json() as Promise<BulkUploadResponse>;
}

// ---- Companies list ----

export interface CompanyListResponse {
  total: number;
  page: number;
  page_size: number;
  results: Company[];
}

export function listCompanies(
  token: string,
  params: { page?: number; page_size?: number; search?: string } = {}
): Promise<CompanyListResponse> {
  return request<CompanyListResponse>("/api/companies", {
    token,
    query: params as Record<string, string | number | undefined>,
  });
}

// ---- Users (admin) ----

export interface UserItem {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export interface UserListResponse {
  total: number;
  results: UserItem[];
}

export function listUsers(token: string): Promise<UserListResponse> {
  return request<UserListResponse>("/api/auth/users", { token });
}

export function createUser(
  token: string,
  payload: { email: string; full_name: string; password: string; role: string }
): Promise<UserItem> {
  return request<UserItem>("/api/auth/register", { method: "POST", token, body: payload });
}

// ---- Scoring (admin) ----

export interface ScoringRunResponse {
  mode: string;
  task_id: string;
  model_version: string;
  queued_at: string;
}

export function triggerScoring(token: string, mode: "full" | "incremental"): Promise<ScoringRunResponse> {
  return request<ScoringRunResponse>("/api/scoring/run", { method: "POST", token, body: { mode } });
}

// ---- Scoring ----

export function runScoring(token: string, mode: "incremental" | "full") {
  return request("/api/scoring/run", { method: "POST", token, body: { mode } });
}
