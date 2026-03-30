const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// ── Generic helpers ───────────────────────────────────────────────────────────
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  if (!res.ok) throw new Error(await res.text());
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

// ── API surface ───────────────────────────────────────────────────────────────
export const api = {
  // Analysis
  exportAnalysis(rfpId: string, format: string) {
    return downloadFile(`/analysis/export/${rfpId}?format=${format}`, `analysis_${rfpId}.${format}`);
  },

  // Pricing
  analyzePricing(rfpId: string) {
    return post<{ job_id: string; status: string }>("/pricing/analyze", { rfp_id: rfpId });
  },
  getPricingStatus(jobId: string) {
    return get<{ job_id: string; status: string; result?: unknown; error?: string }>(`/pricing/status/${jobId}`);
  },
  getPricingResult(rfpId: string) {
    return get<unknown>(`/pricing/result/${rfpId}`);
  },
  correctPricing(rfpId: string, supplierName: string, corrections: unknown[]) {
    return post<unknown>("/pricing/correct", {
      rfp_id:        rfpId,
      supplier_name: supplierName,
      corrections,
    });
  },
  exportPricing(rfpId: string, format: "xlsx" | "csv") {
    return downloadFile(`/pricing/export/${rfpId}?format=${format}`, `pricing_${rfpId}.${format}`);
  },
};
