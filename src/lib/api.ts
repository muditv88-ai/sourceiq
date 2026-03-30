import type { AnalysisResult, ParseResult } from "./types";

const BASE_URL = "/api";

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

/** Poll /analysis/status/{job_id} every 5s until completed or failed. */
async function pollAnalysis(jobId: string): Promise<AnalysisResult> {
  const POLL_INTERVAL_MS = 5000;
  const MAX_WAIT_MS = 15 * 60 * 1000; // 15 minutes max
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    const status = await request<{
      job_id: string;
      status: string;
      result?: AnalysisResult;
      error?: string;
    }>(`/analysis/status/${jobId}`);

    if (status.status === "completed" && status.result) {
      return status.result;
    }
    if (status.status === "failed") {
      throw new Error(status.error || "Analysis job failed");
    }
    // still pending or running — wait and try again
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }
  throw new Error("Analysis timed out after 15 minutes");
}

export const api = {
  uploadRfp: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<{ rfp_id: string; filename: string; status: string }>("/rfp/upload", {
      method: "POST",
      body: formData,
    });
  },

  parseRfp: (rfp_id: string) =>
    request<ParseResult>(`/rfp/${rfp_id}/parse`, { method: "POST" }),

  uploadSupplier: (rfp_id: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<{ rfp_id: string; supplier_id: string; status: string }>(
      `/rfp/${rfp_id}/supplier`,
      { method: "POST", body: formData }
    );
  },

  /**
   * Start analysis job (returns immediately with job_id),
   * then poll until done. Safe against Vercel's 30s proxy timeout.
   */
  runAnalysis: async (rfp_id: string): Promise<AnalysisResult> => {
    const { job_id } = await request<{ job_id: string; status: string }>("/analysis/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfp_id }),
    });
    return pollAnalysis(job_id);
  },

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
};
