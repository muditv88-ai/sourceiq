// ── Shared ────────────────────────────────────────────────────────────────────────────
export interface RFPQuestion {
  question_id:      string;
  category:         string;
  question_text:    string;
  question_type:    "quantitative" | "qualitative";
  weight:           number;
  scoring_guidance?: string;
}

// ── Project ──────────────────────────────────────────────────────────────────────────
export type ProjectStatus =
  | "created"
  | "rfp_uploaded"
  | "suppliers_uploaded"
  | "parsed"
  | "analyzed";

export type ModuleStateValue = "pending" | "active" | "complete" | "error";

export interface ModuleStates {
  rfp_state:        ModuleStateValue;
  technical_state:  ModuleStateValue;
  pricing_state:    ModuleStateValue;
}

export interface ProjectMeta {
  category?:     string;
  description?:  string;
  stakeholders?: string[];   // fix: was string, backend expects List[str]
  timeline?:     string;
  budget?:       number | null;
  currency?:     string;
}

export interface FeatureFlags {
  rfp_structured_view:   boolean;
  technical_analysis:    boolean;
  pricing_scenarios:     boolean;
  chatbot_actions:       boolean;
  audit_logging:         boolean;
}

export interface AuditLogEntry {
  timestamp: string;
  actor:     string;
  action:    string;
  detail?:   Record<string, unknown>;
}

export interface SupplierInfoField {
  label:    string;
  value:    string;
  editable: boolean;
}

export interface TechnicalQuestionField {
  question_id: string;
  category:    string;
  question_text: string;
  question_type: string;
  weight:      number;
}

export interface PricingField {
  description: string;
  category:    string;
  quantity:    number;
}

export interface RFPStructuredView {
  supplier_info:        SupplierInfoField[];
  technical_questions:  TechnicalQuestionField[];
  pricing_fields:       PricingField[];
  parse_warnings:       string[];
}

export interface ProjectSupplier {
  path: string;
  name: string;
}

export interface Project {
  project_id:     string;
  name:           string;
  created_at:     string;
  status:         ProjectStatus;
  rfp_filename:   string | null;
  supplier_count: number;
  suppliers?:     ProjectSupplier[];
  // v2 additions — all optional so old records still deserialise
  module_states?: ModuleStates;
  meta?:          ProjectMeta;
}

// ── Analysis ──────────────────────────────────────────────────────────────────────────
export interface QuestionScore {
  question_id:     string;
  question_text:   string;
  category:        string;
  question_type:   string;
  weight:          number;
  score:           number;
  rationale:       string;
  supplier_answer: string;
  insight?:        string;
}

export interface CategoryScore {
  category:       string;
  weighted_score: number;
  question_count: number;
  questions:      QuestionScore[];
  insight?:       string;
}

export interface SupplierResult {
  supplier_id:            string;
  supplier_name:          string;
  overall_score:          number;
  rank:                   number;
  category_scores:        CategoryScore[];
  strengths:              string[];
  weaknesses:             string[];
  recommendation_summary: string;
  summary_insight?:       string;
}

export interface RecommendationDetail {
  supplier_name:  string;
  score:          number;
  why_selected:   string[];
  tradeoffs:      string[];
  risk_flags:     string[];
  critical_wins:  string[];
}

/** Simple price row embedded in the technical analysis result */
export interface PriceComparisonRow {
  line_item:  string;
  suppliers:  Record<string, string>;
  unit?:      string;
}

export interface AnalysisResult {
  rfp_id:                 string;
  status:                 string;
  suppliers:              SupplierResult[];
  top_recommendation:     string;
  analysis_summary:       string;
  recommendation_detail?: RecommendationDetail;
  available_exports?:     string[];
  /** Lightweight price table surfaced by the technical analysis run */
  price_comparison?:      PriceComparisonRow[];
}

// ── Parse ─────────────────────────────────────────────────────────────────────────────
export interface ParseResult {
  rfp_id?:         string;
  project_id?:     string;
  status:          string;
  questions:       RFPQuestion[];
  categories:      string[];
  total_questions: number;
}

// ── Dashboard / legacy ───────────────────────────────────────────────────────────────
export interface RfpSummary {
  id:             string;
  filename:       string;
  status:         "uploaded" | "parsed" | "analyzed";
  created_at:     string;
  supplier_count?: number;
}

// ── Pricing ────────────────────────────────────────────────────────────────────────────
export interface PricingLineItem {
  description: string;
  quantity:    number;
  unit_price:  number;
  total:       number;
  category:    string;
  notes:       string;
}

export interface SupplierPricingEntry {
  unit_price: number;
  quantity:   number;
  total:      number;
  category:   string;
  notes:      string;
}

export interface PricingMatrix {
  descriptions: string[];
  suppliers:    string[];
  matrix:       Record<string, Record<string, SupplierPricingEntry | null>>;
}

export interface TotalCostResult {
  supplier_name:    string;
  total_cost:       number;
  by_category:      Record<string, number>;
  line_item_count:  number;
  rank:             number;
}

export interface BestOfBestBreakdown {
  description:     string;
  best_supplier:   string;
  best_total:      number;
  best_unit_price: number;
  savings_vs_worst: number;
  quantity:        number;
  category:        string;
  all_prices:      Record<string, number | null>;
}

export interface BestOfBest {
  scenario:          string;
  total_cost:        number;
  breakdown:         BestOfBestBreakdown[];
  wins_by_supplier:  Record<string, number>;
}

export interface OverallBest {
  scenario:      string;
  supplier_name: string;
  total_cost:    number;
  by_category:   Record<string, number>;
  vs_others:     Array<{supplier_name: string; their_total: number; saving: number; saving_pct: number}>;
}

export interface MarketBasketCombo {
  suppliers:       string[];
  total_cost:      number;
  allocation:      Record<string, string>;
  category_detail: Record<string, {awarded_to: string; cost: number; all_costs: Record<string, number>}>;
}

export interface MarketBasket {
  scenario:     string;
  combinations: MarketBasketCombo[];
  best:         MarketBasketCombo | null;
}

export interface AwardStrategy {
  strategy:             string;
  total:                number;
  complexity:           string;
  risk:                 string;
  suppliers_involved:   number;
  suppliers?:           string[];
  allocation?:          Record<string, string>;
  saving_vs_worst:      number;
  saving_vs_worst_pct:  number;
}

export interface AwardRecommendation {
  recommended_strategy: string;
  recommended_total:    number;
  rationale:            string[];
  all_strategies:       AwardStrategy[];
  savings_opportunity:  number;
}

export interface PricingResult {
  rfp_id:               string;
  suppliers:            string[];
  cost_model:           PricingMatrix;
  total_costs:          TotalCostResult[];
  best_of_best:         BestOfBest;
  overall_best:         OverallBest;
  market_basket_2:      MarketBasket;
  market_basket_3:      MarketBasket;
  award_recommendation: AwardRecommendation;
}
// ── Pricing Sheet Ingestion (new pipeline) ────────────────────────────────────

export interface PricingCostComponents {
  api_cost?:  number | null;
  rm_cost?:   number | null;
  pkg_cost?:  number | null;
  mfg_cost?:  number | null;
  overhead?:  number | null;
  margin?:    number | null;
}

export interface PricingLineItemCanonical {
  item_id:               string;
  description:           string;
  strength?:             string;
  dosage_form?:          string;
  pack_size?:            string;
  pack_type?:            string;
  site?:                 string;
  market?:               string;
  annual_volume?:        number;
  moq?:                  number | null;
  cost_components:       PricingCostComponents;
  unit_price?:           number | null;
  total_unit_cost?:      number | null;
  annual_contract_value?:number | null;
  lead_time_weeks?:      number | null;
  shelf_life_months?:    number | null;
  storage_condition?:    string;
  payment_terms?:        string;
  validity?:             string;
  supplier_comments?:    string;
  is_buyer_prefilled:    boolean;
  is_supplier_filled:    boolean;
  missing_fields:        string[];
  extra_fields?:         Record<string, unknown>;
  confidence:            number;
}

export interface PricingSheetSummary {
  total_line_items:   number;
  filled_by_supplier: number;
  missing_totals:     number;
  has_cost_breakdown: boolean;
  detected_currency:  string;
  grand_total?:       number | null;
}

export interface PricingCanonicalSchema {
  workbook_type:  "rfp_template" | "supplier_response" | "unknown";
  source_sheet:   string;
  currency:       string;
  line_items:     PricingLineItemCanonical[];
  summary:        PricingSheetSummary;
  raw_column_map: Record<string, string>;
}

export type PricingConfidenceTier = "HIGH" | "MEDIUM" | "LOW";

export interface PricingValidationFlag {
  severity: "error" | "warning" | "info";
  code:     string;
  message:  string;
  item_id?: string;
}

export interface WorkbookIngestResult {
  supplier:               string;
  source_sheet?:          string;
  confidence_tier:        PricingConfidenceTier;
  auto_ingest:            boolean;
  review_needed:          boolean;
  total_line_items:       number;
  missing_totals:         number;
  has_cost_breakdown:     boolean;
  error?:                 string;
  validation_flags:       PricingValidationFlag[];
  schema?:                PricingCanonicalSchema;
  sheet_classifications?: Record<string, { is_pricing: boolean; confidence: number }>;
}
