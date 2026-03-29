const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "https://nonecliptical-catabolically-stephenie.ngrok-free.dev";

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      // Bypasses ngrok's browser interstitial warning page
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

export const api = {
  uploadRfp: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<{ id: string; filename: string; status: string }>("/rfp/upload", {
      method: "POST",
      body: formData,
    });
  },

  parseRfp: (id: string) =>
    request<{
      id: string;
      requirements: Array<{ id: string; category: string; description: string; weight: number }>;
      metadata: Record<string, string>;
    }>(`/rfp/${id}/parse`, { method: "POST" }),

  runAnalysis: (rfpId: string, supplierFiles?: File[]) => {
    const formData = new FormData();
    formData.append("rfp_id", rfpId);
    if (supplierFiles) {
      supplierFiles.forEach((f) => formData.append("files", f));
    }
    return request<{
      rfp_id: string;
      suppliers: Array<{
        name: string;
        overall_score: number;
        category_scores: Record<string, number>;
        strengths: string[];
        weaknesses: string[];
        rank: number;
      }>;
      insights: string[];
      recommendation: string;
    }>("/analysis/run", { method: "POST", body: formData });
  },

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
    request<{
      subject: string;
      body: string;
      supplier_name: string;
    }>("/communications/clarification-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    }),
};
