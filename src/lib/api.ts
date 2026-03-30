import type { AnalysisResult, ParseResult } from "./types";

const BASE_URL = "/api";

// ── Generic helpers ───────────────────────────────────────────────────────────
async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "ngrok-skip-browser-warning": "true",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API Error: ${res.status}`);
  }
  return res.json();
}

async function downloadFile(path: string, filename: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Generic job poller — works for /rfp/parse-status and /analysis/status */
async function pollJob<T>(
  statusEndpoint: string,
  maxWaitMs = 10 * 60 * 1000,
  intervalMs = 4000
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await request<{
      job_id: string;
      status: string;
      result?: T;
      error?: string;
    }>(statusEndpoint);

    if (job.status === "completed" && job.result) return job.result;
    if (job.status === "failed") throw new Error(job.error || "Job failed");

    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Timed out waiting for job to complete");
}

// ── API surface ───────────────────────────────────────────────────────────────
export const api = {
  // ── RFP ──────────────────────────────────────────────────────────────────
  uploadRfp: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<{ rfp_id: string; filename: string; status: string }>("/rfp/upload", {
      method: "POST",
      body: formData,
    });
  },

  parseRfp: async (rfp_id: string): Promise<ParseResult> => {
    const { job_id } = await request<{ job_id: string; status: string }>(
      `/rfp/${rfp_id}/parse`,
      { method: "POST" }
    );
    return pollJob<ParseResult>(`/rfp/parse-status/${job_id}`, 10 * 60 * 1000);
  },

  uploadSupplier: (rfp_id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<{ rfp_id: string; supplier_id: string; status: string }>(
      `/rfp/${rfp_id}/supplier`,
      { method: "POST", body: formData }
    );
  },

  // ── Analysis ─────────────────────────────────────────────────────────────
  runAnalysis: async (rfp_id: string): Promise<AnalysisResult> => {
    const { job_id } = await request<{ job_id: string; status: string }>("/analysis/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfp_id }),
    });
    return pollJob<AnalysisResult>(`/analysis/status/${job_id}`, 15 * 60 * 1000);
  },

  exportAnalysis(rfpId: string, format: string) {
    return downloadFile(`/analysis/export/${rfpId}?format=${format}`, `analysis_${rfpId}.${format}`);
  },

  // ── Chat ─────────────────────────────────────────────────────────────────
  chat: (
    messages: Array<{ role: string; content: string }>,
    rfp_id?: string,
    analysis_context?: unknown
  ) =>
    request<{ message: string; action: Record<string, unknown> | null }>("/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, rfp_id, analysis_context }),
    }),

  // ── Scenarios ────────────────────────────────────────────────────────────
  runScenario: (params: {
    rfp_id: string;
    weights: Record<string, number>;
    excluded_suppliers: string[];
  }) =>
    request<{
      suppliers: Array<{
        name: string;
        overall_score: number;
        category_scores: Record<string, number>;
        rank: number;
      }>;
      comparison_notes: string[];
    }>("/scenarios/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),

  // ── Communications ───────────────────────────────────────────────────────
  draftEmail: (params: {
    rfp_id: string;
    supplier_name: string;
    clarification_points: string[];
  }) =>
    request<{ subject: string; body: string; supplier_name: string }>(
      "/communications/clarification-email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }
    ),

  // ── Pricing ──────────────────────────────────────────────────────────────
  analyzePricing: (rfpId: string) =>
    request<{ job_id: string; status: string }>("/pricing/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfp_id: rfpId }),
    }),

  getPricingStatus: (jobId: string) =>
    request<{ job_id: string; status: string; result?: unknown; error?: string }>(`/pricing/status/${jobId}`),

  getPricingResult: (rfpId: string) =>
    request<unknown>(`/pricing/result/${rfpId}`),

  correctPricing: (rfpId: string, supplierName: string, corrections: unknown[]) =>
    request<unknown>("/pricing/correct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfp_id: rfpId, supplier_name: supplierName, corrections }),
    }),

  exportPricing(rfpId: string, format: "xlsx" | "csv") {
    return downloadFile(`/pricing/export/${rfpId}?format=${format}`, `pricing_${rfpId}.${format}`);
  },
};
