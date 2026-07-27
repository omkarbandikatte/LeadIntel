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

// ---- CRM sync ----

export function triggerCrmSync(token: string, direction: "push" | "pull") {
  return request("/api/crm/sync", { method: "POST", token, body: { direction } });
}

// ---- Scoring ----

export function runScoring(token: string, mode: "incremental" | "full") {
  return request("/api/scoring/run", { method: "POST", token, body: { mode } });
}
