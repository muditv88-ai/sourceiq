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
    request<{
      rfp_id: string;
      status: string;
      canonical_model: Record<string, any>;
    }>(`/rfp/${rfp_id}/parse`, { method: "POST" }),

  runAnalysis: (rfp_id: string) =>
    request<{
      rfp_id: string;
      ranked_suppliers: Array<{
        supplier_id: string;
        total_score: number;
        compliance: boolean;
      }>;
    }>("/analysis/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfp_id }),
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
