// ── RFP ──────────────────────────────────────────────────────────────────────
export interface RfpSummary {
  id: string;
  filename: string;
  status: "uploaded" | "parsed" | "analyzed";
  created_at: string;
  supplier_count?: number;
}

export interface RFPQuestion {
  question_id: string;
  category: string;
  question_text: string;
  question_type: "quantitative" | "qualitative";
  weight: number;
  scoring_guidance?: string;
}

export interface ParseResult {
  rfp_id: string;
  status: string;
  questions: RFPQuestion[];
  categories: string[];
  total_questions: number;
}

// ── Analysis ─────────────────────────────────────────────────────────────────
export interface QuestionScore {
  question_id: string;
  question_text: string;
  category: string;
  question_type: "quantitative" | "qualitative";
  weight: number;
  score: number;          // 0-10
  rationale: string;
  supplier_answer: string;
}

export interface CategoryScore {
  category: string;
  weighted_score: number; // 0-10
  question_count: number;
  questions: QuestionScore[];
}

export interface SupplierResult {
  supplier_id: string;
  supplier_name: string;
  overall_score: number;  // 0-10
  rank: number;
  category_scores: CategoryScore[];
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
}

export interface AnalysisResult {
  rfp_id: string;
  status: string;
  suppliers: SupplierResult[];
  top_recommendation: string;
  analysis_summary: string;
}

// ── Legacy (kept for compatibility) ──────────────────────────────────────────
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
