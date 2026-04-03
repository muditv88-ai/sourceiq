import { API_BASE_URL } from "./config";

// ── Generic request helper ────────────────────────────────────────────────────
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const token = localStorage.getItem("access_token");
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      errorMsg = body?.detail ?? body?.error ?? errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }
  return res.json() as Promise<T>;
}

// ── Polling helper ────────────────────────────────────────────────────────────
async function pollJob<T>(
  statusPath: string,
  timeoutMs = 10 * 60 * 1000,
  intervalMs = 3000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request<{ status: string; result?: T; error?: string }>(statusPath);
    if (res.status === "completed" && res.result) return res.result;
    if (res.status === "failed") throw new Error(res.error ?? "Job failed");
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Polling timed out");
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PricingResult {
  project_id?: string;
  rfp_id?: string;
  summary?: string;
  line_items?: Array<{
    item_id: string;
    description: string;
    quantity: number;
    unit: string;
    suppliers: Array<{
      name: string;
      unit_price: number;
      total_price: number;
      notes?: string;
      currency?: string;
    }>;
  }>;
  supplier_totals?: Record<string, number>;
  recommended_supplier?: string;
  recommendation_reason?: string;
  currencies?: Record<string, string>;
}

export interface WorkbookIngestResult {
  supplier_name: string;
  project_id: string;
  total_items: number;
  total_value: number;
  currency: string;
  line_items_preview: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  status: string;
}

// ── Technical Analysis types ──────────────────────────────────────────────────
export interface TechnicalWeightCategory {
  key: string;
  label: string;
  default_weight: number;
}

export interface TechnicalAnalysisResult {
  project_id: string;
  suppliers: Array<{
    supplier_id: string;
    supplier_name: string;
    rank: number;
    overall_score: number;
    disqualified: boolean;
    weak_count: number;
    strengths: string[];
    weaknesses: string[];
    recommendation: string;
    category_scores: Array<{
      category: string;
      weighted_score: number;
      questions: Array<{
        question_id: string;
        question_text: string;
        question_type: string;
        weight: number;
        score: number;
        supplier_answer: string;
        rationale: string;
        flagged: boolean;
      }>;
    }>;
  }>;
  disqualified: string[];
  analysis_summary: string;
  top_recommendation: string;
  confidence_score?: number;
}

export interface GapAnalysisResult {
  project_id: string;
  gaps: Record<string, {
    weak_questions: string[];
    weak_count: number;
    disqualified: boolean;
    disqualify_reasons: string[];
  }>;
  disqualified: string[];
}

// ── API surface ───────────────────────────────────────────────────────────────
export const api = {

  // ── Health ──────────────────────────────────────────────────────────────────
  health: () => request<{ status: string }>("/health"),

  // ── Projects ────────────────────────────────────────────────────────────────
  listProjects: () =>
    request<{ projects: Array<{ id: string; name: string; status?: string; created_at?: string }> }>("/projects"),

  createProject: (params: { name: string; description?: string; commodity?: string; deadline?: string }) =>
    request<{ id: string; name: string; status: string }>("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  getProject: (projectId: string) =>
    request<{ id: string; name: string; status: string; rfp_id?: string; created_at?: string; deadline?: string }>(`/projects/${projectId}`),

  updateProject: (projectId: string, params: Partial<{ name: string; status: string; deadline: string; description: string }>) =>
    request<{ updated: boolean }>(`/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  getProjectActivity: (projectId: string) =>
    request<{ activities: Array<{ timestamp: string; event: string; user?: string }> }>(`/projects/${projectId}/activity`),

  // ── RFP ─────────────────────────────────────────────────────────────────────
  listRfps: () =>
    request<{ rfps: Array<{ id: string; title?: string; project_id?: string; status?: string }> }>("/rfp/list"),

  uploadProjectRfp: (projectId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request<{ rfp_id: string; project_id: string; status: string }>(
      `/projects/${projectId}/rfp`,
      { method: "POST", body: fd }
    );
  },

  getRfp: (rfpId: string) =>
    request<{ rfp_id: string; title?: string; sections?: any[]; status?: string }>(`/rfp/${rfpId}`),

  getRfpCompleteness: (projectId: string) =>
    request<{ score: number; missing: string[]; present: string[] }>(`/rfp/${projectId}/completeness`),

  setRfpQuestionWeights: (rfpId: string, weights: Record<string, number>) =>
    request<{ updated: boolean }>(`/rfp/${rfpId}/questions/weights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(weights),
    }),

  generateRfp: (params: {
    project_id: string;
    commodity: string;
    description?: string;
    requirements?: string[];
    deadline?: string;
  }) =>
    request<{ rfp_id: string; status: string; job_id?: string }>("/rfp/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  getRfpStatus: (rfpId: string) =>
    request<{ rfp_id: string; status: string; sections?: any[] }>(`/rfp/status/${rfpId}`),

  // ── Suppliers ───────────────────────────────────────────────────────────────
  listSuppliers: () =>
    request<{ suppliers: Array<{ id: string; name: string; commodity?: string; status?: string; score?: number }> }>("/suppliers"),

  getSupplier: (id: string) =>
    request<{ id: string; name: string; commodity?: string; status?: string; score?: number; contacts?: any[] }>(`/suppliers/${id}`),

  addSupplier: (params: { name: string; commodity?: string; email?: string; contact?: string }) =>
    request<{ id: string; name: string }>("/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  getSupplierStatus: (id: string) =>
    request<{ status: string; completeness_pct: number; missing: string[] }>(`/suppliers/${id}/status`),

  getSupplierPerformance: (id: string) =>
    request<{ score: number; on_time_delivery?: number; quality_rating?: number; responsiveness?: number }>(`/suppliers/${id}/performance`),

  // ── Supplier Responses ──────────────────────────────────────────────────────
  listResponses: (rfpId?: string) =>
    request<{ responses: any[] }>(`/responses${rfpId ? `?rfp_id=${rfpId}` : ""}`),

  uploadResponse: (file: File, rfpId: string, supplierName: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("rfp_id", rfpId);
    fd.append("supplier_name", supplierName);
    return request<{ response_id: string; supplier_name: string; status: string }>(
      "/responses/upload",
      { method: "POST", body: fd }
    );
  },

  getResponseCompleteness: (responseId: string) =>
    request<{ completeness_pct: number; missing_sections: string[]; present_sections: string[]; score: number }>(
      `/responses/${responseId}/completeness`
    ),

  // ── Analysis (legacy path — kept for backward compat) ────────────────────────
  runAnalysis: (params: { rfp_id: string; project_id?: string }) =>
    request<{ job_id: string; status: string }>("/analysis/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  getAnalysisStatus: (jobId: string) =>
    request<{ job_id: string; status: string; result?: any; error?: string }>(`/analysis/status/${jobId}`),

  runAnalysisAndPoll: async (params: { rfp_id: string; project_id?: string }) => {
    const { job_id } = await request<{ job_id: string; status: string }>("/analysis/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return pollJob<any>(`/analysis/status/${job_id}`, 10 * 60 * 1000);
  },

  // ── Technical Analysis (new /technical-analysis/* endpoints) ─────────────────
  /**
   * Fire-and-poll: posts to /technical-analysis/run then polls status.
   * Called as api.analyzeProject(projectId) from AnalysisPage.
   */
  analyzeProject: async (projectId: string): Promise<TechnicalAnalysisResult> => {
    // Backend _do_analysis_job loads questions + supplier files from disk by project_id.
    // The /run endpoint accepts a full RunAnalysisRequest but we POST via the
    // project-level job launcher which calls _do_analysis_job directly via projects route.
    // We hit /technical-analysis/run with an empty questions/supplier_responses so
    // the backend falls through to the project-level auto-loader path.
    // Actually the project-based async path is triggered via the projects router.
    // We use the simpler direct /projects/{id}/analyze pattern if it exists,
    // otherwise call the job-based flow by posting a minimal run request.
    const { job_id } = await request<{ job_id: string; status: string }>(
      `/projects/${projectId}/analyze`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }
    ).catch(() =>
      // Fallback: trigger via technical-analysis run with empty payload (backend reads from disk)
      request<{ job_id: string; status: string }>("/technical-analysis/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          questions: [],
          supplier_responses: {},
        }),
      })
    );
    return pollJob<TechnicalAnalysisResult>(
      `/technical-analysis/status/${job_id}`,
      10 * 60 * 1000
    );
  },

  getTechnicalWeightDefaults: () =>
    request<{ categories: TechnicalWeightCategory[] }>("/technical-analysis/weights/defaults"),

  runTechnicalAnalysis: (params: {
    project_id: string;
    questions: any[];
    supplier_responses: Record<string, Record<string, string>>;
    weight_overrides?: Record<string, number>;
    min_score?: number;
    disqualify_threshold?: number;
    disqualify_max_weak?: number;
  }) =>
    request<TechnicalAnalysisResult>("/technical-analysis/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  runGapAnalysis: (params: {
    project_id: string;
    supplier_scores: Record<string, Record<string, any>>;
    questions: any[];
    min_score?: number;
    disqualify_threshold?: number;
    disqualify_max_weak?: number;
  }): Promise<GapAnalysisResult> =>
    request<GapAnalysisResult>("/technical-analysis/gap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  generateTechnicalReport: (params: {
    project_id: string;
    supplier_name: string;
    category_scores: any[];
    overall_score: number;
  }) =>
    request<{ project_id: string; report: any }>("/technical-analysis/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  getTechnicalAnalysisStatus: (jobId: string) =>
    request<{ job_id: string; status: string; result?: TechnicalAnalysisResult; error?: string }>(
      `/technical-analysis/status/${jobId}`
    ),

  // ── Scenarios ────────────────────────────────────────────────────────────────
  createScenario: (params: {
    project_id: string;
    weights: Record<string, number>;
    excluded_suppliers?: string[];
    name?: string;
  }) =>
    request<{
      scenario_id: string;
      ranked_suppliers: Array<{ name: string; overall_score: number; category_scores: Record<string, number>; rank: number }>;
      notes: string[];
    }>("/scenarios/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  listScenarios: (projectId: string) =>
    request<{ scenarios: Array<{ scenario_id: string; name?: string; created_at?: string; weights?: Record<string, number> }> }>(
      `/scenarios/list/${projectId}`
    ),

  analyzeDeadline: (params: { project_id: string; deadline: string }) =>
    request<{ risk: string; days_remaining: number; recommendation: string }>("/scenarios/analyze-deadline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  riskAssessment: (params: { project_id: string; scenario_id?: string }) =>
    request<{ risks: Array<{ supplier: string; risk_level: string; factors: string[] }> }>("/scenarios/risk-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  // ── Award ────────────────────────────────────────────────────────────────────
  getAwardStatus: (projectId: string) =>
    request<{
      status: string;
      recommended_supplier?: string;
      approved_by?: string;
      approved_at?: string;
      justification?: string;
      confidence?: number;
    }>(`/award/status/${projectId}`),

  scoreAward: (params: { project_id: string; weights?: Record<string, number> }) =>
    request<{ scores: Array<{ supplier: string; score: number }> }>("/award/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  recommendAward: (params: { project_id: string; justification?: string }) =>
    request<{ recommended_supplier: string; justification: string; confidence: number }>("/award/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  // ── Communications ───────────────────────────────────────────────────────────
  draftEmail: (params: {
    rfp_id: string;
    supplier_name: string;
    email_type?: string;
    clarification_points?: string[];
  }) =>
    request<{ subject: string; body: string; supplier_name: string }>("/communications/draft-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  sendEmail: (params: { rfp_id: string; supplier_name: string; subject: string; body: string }) =>
    request<{ sent: boolean; timestamp: string }>("/communications/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  listCommunications: (rfpId?: string) =>
    request<{ messages: any[] }>(`/communications${rfpId ? `?rfp_id=${rfpId}` : ""}`),

  // ── Chat / Copilot ───────────────────────────────────────────────────────────
  chat: (params: { message: string; session_id?: string; project_id?: string; context?: Record<string, unknown> }) =>
    request<{ response: string; session_id: string; sources?: string[] }>("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  getChatTools: () => request<{ tools: string[] }>("/chat/tools"),

  // ── Drawings ─────────────────────────────────────────────────────────────────
  uploadDrawing: (file: File, projectId?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    if (projectId) fd.append("project_id", projectId);
    return request<{ drawing_id: string; filename: string; url?: string; project_id?: string }>(
      "/drawings/upload",
      { method: "POST", body: fd }
    );
  },

  listDrawings: (projectId?: string) =>
    request<{ drawings: any[] }>(`/drawings/${projectId ?? ""}`),

  attachDrawing: (drawingId: string, lineItemId: string, projectId?: string) =>
    request<{ attached: boolean }>("/drawings/attach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drawing_id: drawingId, line_item_id: lineItemId, project_id: projectId }),
    }),

  // ── Pricing Analysis ─────────────────────────────────────────────────────────
  runPricingAnalysis: async (rfpId: string, projectId?: string): Promise<PricingResult> => {
    const { job_id } = await request<{ job_id: string; status: string }>("/pricing-analysis/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfp_id: rfpId, project_id: projectId ?? null }),
    });
    return pollJob<PricingResult>(`/pricing-analysis/status/${job_id}`, 10 * 60 * 1000);
  },

  analyzePricing: (rfpId: string, projectId?: string) =>
    request<{ job_id: string; status: string }>("/pricing-analysis/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfp_id: rfpId, project_id: projectId ?? null }),
    }),

  getPricingStatus: (jobId: string) =>
    request<{ job_id: string; status: string; result?: unknown; error?: string }>(`/pricing-analysis/status/${jobId}`),

  ingestPricingWorkbookSummary: (file: File, supplierName: string, projectId: string): Promise<WorkbookIngestResult> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("supplier_name", supplierName);
    fd.append("project_id", projectId);
    fd.append("source_type", "supplier_response");
    return request<WorkbookIngestResult>("/pricing-analysis/ingest-workbook", {
      method: "POST",
      body: fd,
    });
  },

  // ── Files ────────────────────────────────────────────────────────────────────
  listFiles: (projectId: string, category?: string) =>
    request<{ files: Array<{ id: string; display_name: string; filename: string; category: string; created_at?: string }> }>(
      `/files/${projectId}${category ? `?category=${category}` : ""}`
    ),

  uploadFile: (file: File, projectId: string, category: string, displayName: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("project_id", projectId);
    fd.append("category", category);
    fd.append("display_name", displayName);
    return request<{ id: string; display_name: string; filename: string }>("/files/upload", {
      method: "POST",
      body: fd,
    });
  },

  deleteFile: (projectId: string, fileId: string) =>
    request<{ deleted: boolean }>(`/files/${projectId}/${fileId}`, { method: "DELETE" }),
};
