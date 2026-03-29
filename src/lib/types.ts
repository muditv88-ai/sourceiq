export interface RfpSummary {
  id: string;
  filename: string;
  status: "uploaded" | "parsed" | "analyzed";
  created_at: string;
  supplier_count?: number;
}

export interface Requirement {
  id: string;
  category: string;
  description: string;
  weight: number;
}

export interface Supplier {
  name: string;
  overall_score: number;
  category_scores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  rank: number;
}

export interface AnalysisResult {
  rfp_id: string;
  suppliers: Supplier[];
  insights: string[];
  recommendation: string;
}

export interface ScenarioResult {
  suppliers: Array<{
    name: string;
    overall_score: number;
    category_scores: Record<string, number>;
    rank: number;
  }>;
  comparison_notes: string[];
}

export interface EmailDraft {
  subject: string;
  body: string;
  supplier_name: string;
}
