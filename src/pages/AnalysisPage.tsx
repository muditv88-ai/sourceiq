/**
 * AnalysisPage.tsx — Technical Analysis  (FM-6.1 – FM-6.6)
 * UX mirrors PricingPage.tsx: header bar, KPI strip, left panel, right panel tabs, agent ticker.
 *
 * FM-6.1  Comparison matrix   — suppliers as columns, requirements as rows, pass/partial/fail cells
 * FM-6.2  Weighted scoring     — per-category sliders, live total, validation banner
 * FM-6.3  Gap analysis         — per-supplier weak/missing criteria sorted by severity
 * FM-6.4  Drawing conformance  — per-supplier spec check, empty-state when no drawings
 * FM-6.5  PDF export           — per-supplier print-based export
 * FM-6.6  Disqualification     — threshold + per-category mandatory rules, live DQ badges
 *
 * Fix log (v3):
 *  - Weight validation banner shown before run when total ≠ 100
 *  - Re-run button always visible once result is loaded
 *  - Run error shown inside tab area on re-run failure (not only in empty state)
 *  - Drawing conformance tab has informative empty state when no drawings uploaded
 *  - Score Details tab uses expandable category accordion with full rationale
 *  - Disqualification threshold shown live in KPI strip
 *  - agent_id filter === "technical" (matches analysis.py push_log calls)
 *  - All async loops use currentProjectId capture + continue guard
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Trophy, TrendingUp, TrendingDown, BarChart3,
  ChevronDown, ChevronUp, FlaskConical, Ban,
  FileDown, AlertTriangle, CheckCircle2,
  XCircle, Minus, SlidersHorizontal, ClipboardList,
  Ruler, RefreshCw, ShieldAlert, Loader2, Upload,
  PlusCircle, Info, AlertCircle, Download, Trash2,
} from "lucide-react";

// ── Auth & API constants ───────────────────────────────────────────────────────
const API = "/api";
// token is re-read at call time via liveAh() — do not cache at module level
const _token_unused = "";
void _token_unused;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Project { id: string; name: string; project_id?: string; }

interface RawFile {
  id: string;
  filename: string;
  display_name: string;
  size_bytes: number;
}

interface SupplierFile {
  id: string;
  filename: string;
  display_name: string;
  supplierName: string;
}

interface AgentLog { id: string; agent_id: string; status: string; message: string; }

interface RFQQuestion {
  question_id: string;
  question_text: string;
  question_type: "qualitative" | "quantitative";
  category: string;
  weight: number;
}

interface AnalysisResult {
  project_id: string;
  analysis_summary: string;
  top_recommendation: string;
  confidence_score: number;
  suppliers: SupplierResult[];
}
interface SupplierResult {
  supplier_id: string;
  supplier_name: string;
  rank: number;
  overall_score: number;
  recommendation_summary?: string;
  recommendation?: string;
  strengths: string[];
  weaknesses: string[];
  category_scores: CategoryScore[];
  disqualified?: boolean;
}
interface CategoryScore {
  category: string;
  weighted_score: number;
  questions: QuestionScore[];
}
interface QuestionScore {
  question_id: string;
  question_text: string;
  question_type: "qualitative" | "quantitative";
  weight: number;
  score: number;
  rationale: string;
  supplier_answer?: string;
  flagged?: boolean;
}
interface DisqualRule { field: string; threshold: number; mandatory: boolean; }

// ── Question upload types (FM-6.2 enhancement) ─────────────────────────────
interface ParsedQuestion {
  question_id: string;
  question_text: string;
  category: string;
  supplier_name: string;
  response: string;
  comments: string;
}

interface ParsedSheet {
  sheet_name: string;
  row_count: number;
  columns_detected: string[];
  questions: ParsedQuestion[];
}

interface ParseQuestionsResponse {
  sheets: ParsedSheet[];
  total_questions: number;
  suppliers_detected: string[];
}

interface WeightConfig {
  [category: string]: number; // 0.0–1.0, sum must = 1.0
}

type Tab = "matrix" | "scores" | "gaps" | "disqual" | "weights" | "drawings";
type CellStatus = "pass" | "partial" | "fail" | "na";

// ── Constants ─────────────────────────────────────────────────────────────────
const SUPPLIER_COLORS = [
  "bg-primary/10 text-primary border-primary/30",
  "bg-accent/10 text-accent border-accent/30",
  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "bg-rose-500/10 text-rose-400 border-rose-500/30",
  "bg-violet-500/10 text-violet-400 border-violet-500/30",
  "bg-sky-500/10 text-sky-400 border-sky-500/30",
];

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "matrix",   label: "Comparison Matrix",  icon: <ClipboardList className="h-3.5 w-3.5" /> },
  { id: "scores",   label: "Score Details",       icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: "gaps",     label: "Gap Analysis",        icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { id: "disqual",  label: "Disqualification",    icon: <ShieldAlert className="h-3.5 w-3.5" /> },
  { id: "weights",  label: "Scoring Weights",     icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
  { id: "drawings", label: "Drawing Conformance", icon: <Ruler className="h-3.5 w-3.5" /> },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreToStatus(score: number): CellStatus {
  if (score >= 7.5) return "pass";
  if (score >= 5.0) return "partial";
  if (score > 0)   return "fail";
  return "na";
}

function StatusBadge({ score }: { score: number }) {
  const s = scoreToStatus(score);
  const map: Record<CellStatus, { icon: React.ReactNode; cls: string; label: string }> = {
    pass:    { icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800", label: "Pass" },
    partial: { icon: <Minus className="h-3.5 w-3.5" />,        cls: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800",           label: "Partial" },
    fail:    { icon: <XCircle className="h-3.5 w-3.5" />,      cls: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-800",                  label: "Fail" },
    na:      { icon: <Minus className="h-3.5 w-3.5" />,        cls: "text-gray-500 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900/40 dark:border-gray-700",                  label: "N/A" },
  };
  const { icon, cls, label } = map[s];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium ${cls}`}>
      {icon}{label}
    </span>
  );
}

function ScoreBar({ score, max = 10 }: { score: number; max?: number }) {
  const pct = Math.min(100, (score / max) * 100);
  const color = score >= 7.5 ? "bg-emerald-500" : score >= 5 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums font-semibold w-8 text-right">{score.toFixed(1)}</span>
    </div>
  );
}

const scoreColor = (score: number) =>
  score >= 7.5 ? "text-emerald-600 dark:text-emerald-400 font-semibold"
  : score >= 5  ? "text-amber-600 dark:text-amber-400 font-semibold"
  : "text-rose-600 dark:text-rose-400 font-semibold";

function reweightedScore(s: SupplierResult, weights: Record<string, number>): number {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total === 0) return s.overall_score;
  let sum = 0;
  for (const cat of s.category_scores ?? []) {
    const w = weights[cat.category] ?? 0;
    sum += (cat.weighted_score / 10) * (w / total) * 10;
  }
  return sum;
}

function isDisqualified(
  s: SupplierResult,
  threshold: number,
  rules: DisqualRule[],
  weights: Record<string, number>
): { dq: boolean; reasons: string[] } {
  const reasons: string[] = [];
  // Backend may already mark it
  if (s.disqualified) reasons.push("Flagged by backend scoring engine");
  const ws = reweightedScore(s, weights);
  if (ws < threshold) reasons.push(`Weighted score ${ws.toFixed(1)} < threshold ${threshold}`);
  for (const rule of rules) {
    const cat = (s.category_scores ?? []).find(c => c.category === rule.field);
    if (!cat && rule.mandatory) { reasons.push(`Missing mandatory category: ${rule.field}`); continue; }
    if (cat && cat.weighted_score < rule.threshold)
      reasons.push(`${rule.field} ${cat.weighted_score.toFixed(1)} < ${rule.threshold}${rule.mandatory ? " (mandatory)" : ""}`);
  }
  return { dq: reasons.length > 0, reasons };
}

function buildGaps(s: SupplierResult) {
  const weak: Array<{ q: string; score: number; category: string; rationale: string }> = [];
  for (const cat of s.category_scores ?? []) {
    for (const q of cat.questions ?? []) {
      if (q.score < 5) weak.push({ q: q.question_text, score: q.score, category: cat.category, rationale: q.rationale });
    }
  }
  return weak.sort((a, b) => a.score - b.score);
}

// ── Shape backend raw result → AnalysisResult ─────────────────────────────────
function normaliseResult(data: Record<string, unknown>, projectId: string): AnalysisResult {
  if (Array.isArray((data as { suppliers?: unknown }).suppliers)) {
    return {
      project_id: (data.project_id as string) ?? projectId,
      analysis_summary: (data.analysis_summary as string) ?? "",
      top_recommendation: (data.top_recommendation as string) ?? "",
      confidence_score: (data.confidence_score as number) ?? 0,
      suppliers: (data.suppliers as SupplierResult[]),
    };
  }

  const scores = (data.scores ?? {}) as Record<string, Record<string, { score?: number; rationale?: string; flagged?: boolean }>>;
  const reports = (data.reports ?? {}) as Record<string, { strengths?: string[]; weaknesses?: string[]; recommendation?: string }>;
  const disqualified: string[] = Array.isArray(data.disqualified) ? (data.disqualified as string[]) : [];

  const supplierNames = Object.keys(scores);
  const overall = (supplierScores: Record<string, { score?: number }>) => {
    const vals = Object.values(supplierScores).map(v => typeof v === "object" && v !== null ? (v.score ?? 0) : 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  const sorted = [...supplierNames].sort((a, b) => overall(scores[b]) - overall(scores[a]));

  const suppliers: SupplierResult[] = sorted.map((name, idx) => {
    const supplierScores = scores[name] ?? {};
    const report = reports[name] ?? {};
    const ov = overall(supplierScores);

    const catMap: Record<string, QuestionScore[]> = {};
    for (const [qid, s] of Object.entries(supplierScores)) {
      const cat = qid.split("_")[0] ?? "General";
      if (!catMap[cat]) catMap[cat] = [];
      catMap[cat].push({
        question_id: qid,
        question_text: qid,
        question_type: "qualitative",
        weight: 10,
        score: typeof s === "object" && s !== null ? (s.score ?? 0) : 0,
        rationale: typeof s === "object" && s !== null ? (s.rationale ?? "") : "",
        flagged: typeof s === "object" && s !== null ? (s.flagged ?? false) : false,
      });
    }

    const category_scores: CategoryScore[] = Object.entries(catMap).map(([cat, qs]) => ({
      category: cat,
      weighted_score: qs.reduce((a, q) => a + q.score, 0) / Math.max(qs.length, 1),
      questions: qs,
    }));

    return {
      supplier_id: name,
      supplier_name: name,
      rank: idx + 1,
      overall_score: parseFloat(ov.toFixed(2)),
      strengths: report.strengths ?? [],
      weaknesses: report.weaknesses ?? [],
      recommendation: report.recommendation ?? "",
      category_scores,
      disqualified: disqualified.includes(name),
    };
  });

  const top = suppliers[0];
  return {
    project_id: (data.project_id as string) ?? projectId,
    analysis_summary: `Evaluated ${suppliers.length} supplier(s).`,
    top_recommendation: top
      ? `${top.supplier_name} is the recommended supplier with a score of ${top.overall_score.toFixed(1)}/10.`
      : "No suppliers evaluated.",
    confidence_score: 0,
    suppliers,
  };
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qFileInputRef = useRef<HTMLInputElement>(null);

  const liveToken = () => localStorage.getItem("access_token") ?? "";
  const liveAh = () => ({ Authorization: `Bearer ${liveToken()}` });

  // ── Projects
  const [projects, setProjects]   = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");

  // ── Left panel
  const [supplierFiles, setSupplierFiles]       = useState<SupplierFile[]>([]);
  const [leftTab, setLeftTab]                   = useState<"project" | "upload">("project");
  const [projectLoading, setProjectLoading]     = useState(false);
  const [projectLoadMsg, setProjectLoadMsg]     = useState("");
  const [reloadKey, setReloadKey]               = useState(0);

  // ── Upload
  const [uploadFile, setUploadFile]   = useState<File | null>(null);
  const [uploadName, setUploadName]   = useState("");
  const [uploading, setUploading]     = useState(false);
  const [uploadMsg, setUploadMsg]     = useState("");

  // ── Analysis result
  const [result, setResult]     = useState<AnalysisResult | null>(null);
  const [running, setRunning]   = useState(false);
  const [runError, setRunError] = useState("");

  // ── Right panel
  const [activeTab, setActiveTab]               = useState<Tab>("matrix");
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [exportingSupplier, setExportingSupplier] = useState<string | null>(null);

  // ── Weights
  const [weights, setWeights]             = useState<Record<string, number>>({});
  const [weightsEdited, setWeightsEdited] = useState(false);
  const [weightSaving, setWeightSaving]   = useState(false);
  const [weightSavedMsg, setWeightSavedMsg] = useState("");

  // ── Question upload (FM-6.2 enhancement)
  const [questionFile, setQuestionFile]   = useState<File | null>(null);
  const [questionParsing, setQuestionParsing] = useState(false);
  const [questionParseError, setQuestionParseError] = useState("");
  const [questionParseResult, setQuestionParseResult] = useState<ParseQuestionsResponse | null>(null);
  const [activeSheet, setActiveSheet]     = useState<string | null>(null);
  const [questionConfirming, setQuestionConfirming] = useState(false);
  const [qRepoFiles, setQRepoFiles]       = useState<RawFile[]>([]);
  const [qRepoReloadKey, setQRepoReloadKey] = useState(0);

  // ── Disqualification
  const [disqualThreshold, setDisqualThreshold] = useState(4.0);
  const [disqualMaxWeak, setDisqualMaxWeak]     = useState(1);
  const [disqualRules, setDisqualRules]         = useState<DisqualRule[]>([]);
  const [newRuleField, setNewRuleField]         = useState("");
  const [newRuleThreshold, setNewRuleThreshold] = useState(4.0);
  const [newRuleMandatory, setNewRuleMandatory] = useState(false);

  // ── Scoring Pattern section
  const [scoringPatternOpen, setScoringPatternOpen] = useState(false);

  // ── Agent ticker
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);

  // ── Load projects ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/projects`, { headers: liveAh() })
      .then(r => r.json())
      .then(d => {
        const l: Project[] = Array.isArray(d) ? d : (d.projects ?? d.items ?? []);
        setProjects(l);
        if (l.length) setProjectId(prev => prev || (l[0].project_id ?? l[0].id));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load supplier files when project changes ───────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    setSupplierFiles([]);
    setResult(null);
    setRunError("");
    setProjectLoading(true);
    setProjectLoadMsg("Loading project files…");
    const currentProjectId = projectId;

    fetch(`${API}/files/${projectId}?category=supplier_responses`, { headers: liveAh() })
      .then(r => r.ok ? r.json() : [])
      .then((files: RawFile[]) => {
        if (currentProjectId !== projectId) return;
        if (!files.length) {
          setProjectLoadMsg("No supplier response files found for this project.");
          setProjectLoading(false);
          return;
        }
        const mapped: SupplierFile[] = files.map(f => ({
          id: f.id,
          filename: f.filename,
          display_name: f.display_name,
          supplierName: (f.display_name ?? f.filename).replace(/\.[^.]+$/, "").trim(),
        }));
        setSupplierFiles(mapped);
        setProjectLoadMsg(`Found ${files.length} supplier file${files.length > 1 ? "s" : ""}. Ready to analyse.`);
        setProjectLoading(false);
      })
      .catch(() => {
        setProjectLoadMsg("Could not load project files.");
        setProjectLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, reloadKey]);

  // ── Auto-derive weights from result categories ─────────────────────────────
  useEffect(() => {
    if (!result || weightsEdited) return;
    const cats = Array.from(
      new Set(result.suppliers.flatMap(s => (s.category_scores ?? []).map(c => c.category)))
    );
    if (!cats.length) return;
    const share = Math.floor(100 / cats.length);
    const base = Object.fromEntries(cats.map(c => [c, share]));
    const rem = 100 - share * cats.length;
    if (cats[0]) base[cats[0]] += rem;
    setWeights(base);
  }, [result, weightsEdited]);

  // ── Load weights when project changes (FM-6.2 enhancement) ────────────────
  useEffect(() => {
    if (!projectId) return;
    handleLoadWeights(projectId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ── Load question repository files when project changes ───────────────────
  useEffect(() => {
    if (!projectId) {
      setQRepoFiles([]);
      return;
    }
    const currentProjectId = projectId;
    fetch(`${API}/files/${projectId}?category=tech_questions`, { headers: liveAh() })
      .then(r => r.ok ? r.json() : [])
      .then((files: RawFile[]) => {
        if (currentProjectId === projectId) setQRepoFiles(files);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, qRepoReloadKey]);

  // ── Agent ticker poll ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      fetch(`${API}/agent-logs?limit=10`, { headers: liveAh() })
        .then(r => r.json())
        .then((logs: AgentLog[]) => setAgentLogs(logs.filter(l => l.agent_id === "technical")))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upload handler ─────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!uploadFile || !projectId) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("project_id", projectId);
      fd.append("category", "supplier_responses");
      fd.append("display_name", uploadName || uploadFile.name.replace(/\.[^.]+$/, ""));
      const res = await fetch(`${API}/files/upload`, {
        method: "POST",
        headers: liveAh(),
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      setUploadMsg("File uploaded successfully.");
      setUploadFile(null);
      setUploadName("");
      setReloadKey(k => k + 1);
    } catch (e: unknown) {
      setUploadMsg(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setUploading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadFile, uploadName, projectId]);

  // ── Run analysis ───────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (!projectId) return;
    setRunning(true);
    setRunError("");

    try {
      const hdrs = liveAh();

      // Step 1: Fetch RFP questions
      let questions: RFQQuestion[] = [];
      try {
        const qRes = await fetch(`${API}/rfp/${projectId}/questions`, { headers: hdrs });
        if (qRes.ok) {
          const qData = await qRes.json();
          questions = Array.isArray(qData) ? qData : (qData.questions ?? []);
        }
      } catch {
        // backend _do_analysis_job will load from questions.json itself
      }

      // Step 2: Build supplier_responses map
      const supplier_responses: Record<string, Record<string, string>> = {};
      for (const sf of supplierFiles) {
        supplier_responses[sf.supplierName] = {};
        for (const q of questions) {
          supplier_responses[sf.supplierName][q.question_id] = "";
        }
      }

      // Step 3: POST to /technical-analysis/run with weight overrides + DQ config
      const weight_overrides: Record<string, number> = {};
      const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
      if (totalW > 0 && weightsEdited) {
        for (const [k, v] of Object.entries(weights)) {
          weight_overrides[k] = v / 100;
        }
      }

      const res = await fetch(`${API}/technical-analysis/run`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          questions,
          supplier_responses,
          weight_overrides: Object.keys(weight_overrides).length ? weight_overrides : undefined,
          min_score: 5.0,
          disqualify_threshold: disqualThreshold,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let errMsg = errText;
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.detail ?? errJson.message ?? errText;
        } catch { /* leave as text */ }
        throw new Error(errMsg);
      }

      const data = await res.json();

      // Step 4: Handle job_id poll or immediate result
      if (data.job_id && data.status === "running") {
        const jobId = data.job_id as string;
        await new Promise<void>((resolve, reject) => {
          const iv = setInterval(async () => {
            try {
              const poll = await fetch(`${API}/technical-analysis/status/${jobId}`, { headers: liveAh() });
              const pd = await poll.json();
              if (pd.status === "complete") {
                clearInterval(iv);
                setResult(normaliseResult(pd.result ?? pd, projectId));
                resolve();
              } else if (pd.status === "error") {
                clearInterval(iv);
                reject(new Error(pd.error ?? pd.message ?? "Analysis failed"));
              }
            } catch (err) {
              clearInterval(iv);
              reject(err);
            }
          }, 2000);
        });
      } else {
        setResult(normaliseResult(data, projectId));
      }
    } catch (e: unknown) {
      setRunError(e instanceof Error ? e.message : "Analysis failed. Please try again.");
    }

    setRunning(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, supplierFiles, weights, weightsEdited, disqualThreshold]);

  // ── Question upload handlers (FM-6.2 enhancement) ──────────────────────────
  const handleParseQuestions = useCallback(async (file: File) => {
    if (!projectId) return;
    setQuestionParsing(true);
    setQuestionParseError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("project_id", projectId);
      const res = await fetch(`${API}/technical-analysis/parse-questions`, {
        method: "POST",
        headers: liveAh(),
        body: fd,
      });
      if (!res.ok) throw new Error(`Parse failed: ${res.status}`);
      const data: ParseQuestionsResponse = await res.json();
      setQuestionParseResult(data);
      if (data.sheets?.length) setActiveSheet(data.sheets[0].sheet_name);
    } catch (e: unknown) {
      setQuestionParseError(e instanceof Error ? e.message : "Parse failed");
    }
    setQuestionParsing(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleConfirmQuestions = useCallback(async () => {
    if (!questionParseResult || !projectId || !activeSheet) return;
    const currentProjectId = projectId;
    setQuestionConfirming(true);
    try {
      const sheet = questionParseResult.sheets.find(s => s.sheet_name === activeSheet);
      if (!sheet) throw new Error("Selected sheet not found");
      const qs = sheet.questions;

      // Step 1: Confirm questions to backend
      const res1 = await fetch(`${API}/technical-analysis/confirm-questions`, {
        method: "POST",
        headers: { ...liveAh(), "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          questions: qs,
          file_display_name: `${activeSheet}-questions`,
        }),
      });
      if (!res1.ok) throw new Error("Confirm failed");

      // Step 2: Upload file to repository
      if (questionFile && currentProjectId === projectId) {
        const fd = new FormData();
        fd.append("file", questionFile);
        fd.append("project_id", projectId);
        fd.append("category", "tech_questions");
        fd.append("display_name", `${activeSheet}-questions`);
        const res2 = await fetch(`${API}/files/upload`, {
          method: "POST",
          headers: liveAh(),
          body: fd,
        });
        if (!res2.ok) throw new Error("Upload failed");
      }

      // Step 3: Refresh repo files
      const res3 = await fetch(`${API}/files/${projectId}?category=tech_questions`, { headers: liveAh() });
      if (res3.ok) setQRepoFiles(await res3.json());

      // Step 4: Clear parse state
      setQuestionFile(null);
      setQuestionParseResult(null);
      setActiveSheet(null);

      // Step 5: Show success
      toast({
        title: "Questions saved",
        description: `Added ${qs.length} questions from ${activeSheet} to repository.`,
      });
    } catch (e: unknown) {
      setQuestionParseError(e instanceof Error ? e.message : "Confirm failed");
    }
    setQuestionConfirming(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionParseResult, projectId, activeSheet, questionFile, toast]);

  const handleLoadWeights = useCallback(async (pid: string) => {
    try {
      const res = await fetch(`${API}/technical-analysis/weights/${pid}`, { headers: liveAh() });
      if (res.ok) {
        const w = await res.json();
        setWeights(w);
        setWeightsEdited(false);
        return;
      }
    } catch { /* fall through to defaults */ }

    // Fallback to defaults
    try {
      const res = await fetch(`${API}/technical-analysis/weights/defaults`, { headers: liveAh() });
      if (res.ok) {
        const w = await res.json();
        setWeights(w);
        setWeightsEdited(false);
      }
    } catch { /* use defaults from state init */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveWeights = useCallback(async () => {
    if (!projectId || !weightsEdited) return;
    setWeightSaving(true);
    try {
      const res = await fetch(`${API}/technical-analysis/save-weights`, {
        method: "POST",
        headers: { ...liveAh(), "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          weights,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setWeightsEdited(false);
      setWeightSavedMsg("Weights saved ✓");
      setTimeout(() => setWeightSavedMsg(""), 3000);
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to save weights",
        variant: "destructive",
      });
    }
    setWeightSaving(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, weights, weightsEdited, toast]);

  const handleDeleteQFile = useCallback(async (fileId: string) => {
    if (!projectId) return;
    const currentProjectId = projectId;
    try {
      const res = await fetch(`${API}/files/${projectId}/${fileId}`, {
        method: "DELETE",
        headers: liveAh(),
      });
      if (!res.ok) throw new Error("Delete failed");
      if (currentProjectId === projectId) {
        setQRepoFiles(prev => prev.filter(f => f.id !== fileId));
      }
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete file",
        variant: "destructive",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, toast]);

  // ── PDF export (FM-6.5) ────────────────────────────────────────────────────
  const handleExportPDF = useCallback((supplierName: string) => {
    setExportingSupplier(supplierName);
    setTimeout(() => { window.print(); setExportingSupplier(null); }, 300);
  }, []);

  // ── Derived data ──────────────────────────────────────────────────────────
  const allCategories = useMemo(() =>
    Array.isArray(result?.suppliers)
      ? Array.from(new Set(result!.suppliers.flatMap(s => (s.category_scores ?? []).map(c => c.category))))
      : [],
    [result]
  );

  const weightTotal  = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0), [weights]);
  const weightsValid = Math.abs(weightTotal - 100) < 1;

  const enrichedSuppliers = useMemo(() =>
    (result?.suppliers ?? []).map(s => ({
      ...s,
      _weighted: reweightedScore(s, weights),
      _dq: isDisqualified(s, disqualThreshold, disqualRules, weights),
    })).sort((a, b) => a.rank - b.rank),
    [result, weights, disqualThreshold, disqualRules]
  );

  const top = enrichedSuppliers.find(s => !s._dq.dq) ?? enrichedSuppliers[0];

  const kpi = useMemo(() => {
    const dqCount        = enrichedSuppliers.filter(s => s._dq.dq).length;
    const topScore       = top?._weighted ?? null;
    const totalQuestions = (result?.suppliers[0]?.category_scores ?? [])
      .reduce((a, c) => a + (c.questions?.length ?? 0), 0);
    return { dqCount, topScore, totalQuestions };
  }, [enrichedSuppliers, top, result]);

  const tickerText = agentLogs.length > 0
    ? agentLogs.slice(0, 4).map(l => `[${l.agent_id.toUpperCase()}] ${l.message}`).join("   ·   ")
    : "Technical analysis agent idle — select a project and run analysis to begin";

  const isTickerActive = agentLogs.some(l => l.status === "running");

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-screen bg-background text-foreground">

      {/* ── 1. Header bar ──────────────────────────────────────────────────── */}
      <div className="border-b bg-card px-6 py-4 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-lg font-bold leading-tight">Technical Analysis</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Score suppliers · identify gaps · rank by weighted criteria
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="w-52 h-8 border rounded-md px-2 text-sm bg-background"
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
          >
            <option value="" disabled>— Select project —</option>
            {projects.map(p => (
              <option key={p.project_id ?? p.id} value={p.project_id ?? p.id}>{p.name}</option>
            ))}
          </select>
          <button
            className="h-8 w-8 flex items-center justify-center rounded-md border bg-background hover:bg-muted transition-colors"
            onClick={() => setReloadKey(k => k + 1)}
            aria-label="Refresh files"
          >
            {projectLoading
              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : <RefreshCw className="h-4 w-4 text-muted-foreground" />}
          </button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => navigate("/pricing")}>
            <BarChart3 className="h-3.5 w-3.5" /> Pricing Analysis →
          </Button>
        </div>
      </div>

      {/* ── 2. Main body ───────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 flex flex-col gap-6 overflow-auto">

        {/* ── 2a. Weight validation warning (FM-6.2) ─────────────────────── */}
        {result && weightsEdited && !weightsValid && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Weights currently total <strong>{weightTotal}%</strong> — they must add up to exactly 100% for scores to be recalculated correctly.
              Go to the <button className="underline font-medium" onClick={() => setActiveTab("weights")}>Scoring Weights</button> tab to fix this.
            </span>
          </div>
        )}

        {/* ── 2b. KPI strip ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Suppliers Scored",   value: result?.suppliers.length ?? 0,                                cls: "border-primary/20 bg-primary/5 text-primary" },
            { label: "Disqualified",        value: kpi.dqCount,                                                  cls: "border-destructive/20 bg-destructive/5 text-destructive" },
            { label: "Top Score",           value: kpi.topScore != null ? `${kpi.topScore.toFixed(1)} / 10` : "—", cls: "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400" },
            { label: "Criteria Evaluated",  value: kpi.totalQuestions,                                           cls: "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400" },
          ].map(k => (
            <Card key={k.label} className={`py-0 border ${k.cls}`}>
              <CardContent className="p-4">
                <p className="text-[11px] font-medium opacity-70 uppercase tracking-wide">{k.label}</p>
                <p className="text-2xl font-bold tabular-nums mt-0.5">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── 2c. Two-column body ─────────────────────────────────────────── */}
        <div className="flex gap-4 min-h-0 flex-nowrap">

          {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-3">

            {/* Ingest tabs */}
            <div className="flex border-b">
              {(["project", "upload"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setLeftTab(t)}
                  className={`flex-1 py-1.5 text-xs font-medium transition-colors capitalize ${
                    leftTab === t
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "project" ? "Project Files" : "Upload File"}
                </button>
              ))}
            </div>

            {/* Project files tab */}
            {leftTab === "project" && (
              <Card className="flex-1 min-h-0 overflow-auto">
                <CardHeader className="pb-2 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Supplier Files
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-2">
                  {projectLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {projectLoadMsg}
                    </div>
                  ) : supplierFiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2">
                      {projectId ? projectLoadMsg || "No supplier response files found." : "Select a project above."}
                    </p>
                  ) : (
                    <>
                      <p className="text-[10px] text-muted-foreground">{projectLoadMsg}</p>
                      {supplierFiles.map((f, i) => (
                        <div key={f.id} className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded border text-[11px] font-medium ${
                            SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]
                          }`}>
                            {f.supplierName}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate">loaded</span>
                        </div>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Upload tab */}
            {leftTab === "upload" && (
              <Card>
                <CardContent className="px-3 pb-3 pt-3 space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.pdf,.docx"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null;
                      setUploadFile(f);
                      if (f) setUploadName(f.name.replace(/\.[^.]+$/, ""));
                    }}
                  />
                  <button
                    className="w-full border-2 border-dashed rounded-lg p-4 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors text-center"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadFile ? (
                      <span className="text-foreground font-medium">{uploadFile.name}</span>
                    ) : (
                      <><Upload className="h-4 w-4 mx-auto mb-1" />Click to select file<br/><span className="text-[10px]">xlsx / csv / pdf / docx</span></>
                    )}
                  </button>
                  {uploadFile && (
                    <>
                      <input
                        className="w-full border rounded px-2 py-1.5 text-xs bg-background"
                        placeholder="Supplier name (display)"
                        value={uploadName}
                        onChange={e => setUploadName(e.target.value)}
                      />
                      <Button
                        size="sm" className="w-full text-xs gap-1.5"
                        disabled={uploading || !projectId}
                        onClick={handleUpload}
                      >
                        {uploading ? <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</> : <><Upload className="h-3 w-3" /> Save & Add</>}
                      </Button>
                    </>
                  )}
                  {uploadMsg && (
                    <p className={`text-[11px] ${uploadMsg.startsWith("Upload failed") ? "text-destructive" : "text-emerald-600"}`}>
                      {uploadMsg}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* In Comparison card */}
            {supplierFiles.length > 0 && (
              <Card>
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    In Comparison
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3">
                  <div className="flex flex-wrap gap-1.5">
                    {supplierFiles.map((f, i) => (
                      <Badge key={f.id} variant="outline" className={`text-[11px] ${SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]}`}>
                        {f.supplierName}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* DQ config quick summary (FM-6.6) */}
            {result && (
              <Card className="border-rose-200 dark:border-rose-900">
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5" /> DQ Rules
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Min threshold</span>
                    <span className="text-[11px] font-semibold tabular-nums">{disqualThreshold.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Custom rules</span>
                    <span className="text-[11px] font-semibold tabular-nums">{disqualRules.length}</span>
                  </div>
                  <button
                    className="text-[11px] text-primary underline"
                    onClick={() => setActiveTab("disqual")}
                  >
                    Configure →
                  </button>
                </CardContent>
              </Card>
            )}

            {/* Question Repository (FM-6.2 enhancement) */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Question Repository
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-3">
                {!questionParseResult ? (
                  <>
                    <input
                      ref={qFileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.pdf,.docx"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0] ?? null;
                        if (f) {
                          setQuestionFile(f);
                          handleParseQuestions(f);
                        }
                      }}
                    />
                    <button
                      className="w-full border-2 border-dashed rounded-lg p-3 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors text-center"
                      onClick={() => qFileInputRef.current?.click()}
                      disabled={questionParsing}
                    >
                      {questionParsing ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Parsing sheets…
                        </div>
                      ) : (
                        <><Upload className="h-3.5 w-3.5 mx-auto mb-0.5" />Click to upload<br/><span className="text-[10px]">xlsx / pdf / docx</span></>
                      )}
                    </button>
                    {questionParseError && (
                      <p className="text-[10px] text-destructive bg-destructive/10 rounded px-2 py-1.5">{questionParseError}</p>
                    )}
                  </>
                ) : (
                  <>
                    {/* Sheet selector */}
                    <div className="flex flex-wrap gap-1.5">
                      {questionParseResult.sheets.map(sheet => (
                        <button
                          key={sheet.sheet_name}
                          onClick={() => setActiveSheet(sheet.sheet_name)}
                          className={`px-2 py-1 rounded border text-[10px] font-medium transition-colors ${
                            activeSheet === sheet.sheet_name
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted border-border hover:border-primary/40"
                          }`}
                        >
                          {sheet.sheet_name} ({sheet.questions.length})
                        </button>
                      ))}
                    </div>

                    {/* Question preview table */}
                    {activeSheet && (() => {
                      const sheet = questionParseResult.sheets.find(s => s.sheet_name === activeSheet);
                      if (!sheet) return null;
                      const suppliers = [...new Set(sheet.questions.map(q => q.supplier_name))];
                      return (
                        <>
                          <div className="text-xs font-medium text-muted-foreground mb-1">
                            Question Preview — {activeSheet}
                          </div>
                          <div className="overflow-y-auto border rounded max-h-[280px] bg-muted/30">
                            <table className="w-full text-[10px]">
                              <thead className="sticky top-0 bg-muted">
                                <tr className="border-b">
                                  <th className="px-2 py-1.5 text-left font-medium">#</th>
                                  <th className="px-2 py-1.5 text-left font-medium">Question</th>
                                  <th className="px-2 py-1.5 text-left font-medium">Supplier</th>
                                  <th className="px-2 py-1.5 text-left font-medium">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sheet.questions.slice(0, 50).map((q, i) => {
                                  const status = q.response ? (q.response.length > 20 ? "pass" : "partial") : "fail";
                                  const statusStyle = status === "pass" ? "text-emerald-600" : status === "partial" ? "text-amber-600" : "text-rose-600";
                                  const sIdx = suppliers.indexOf(q.supplier_name);
                                  return (
                                    <tr key={i} className={`border-b ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                                      <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                                      <td className="px-2 py-1 max-w-[120px] truncate">{q.question_text}</td>
                                      <td className="px-2 py-1">
                                        <span className={`px-1 py-0.5 rounded text-[9px] font-medium border ${SUPPLIER_COLORS[sIdx % SUPPLIER_COLORS.length]}`}>
                                          {q.supplier_name}
                                        </span>
                                      </td>
                                      <td className={`px-2 py-1 font-medium ${statusStyle}`}>
                                        {status === "pass" ? "✓ Pass" : status === "partial" ? "~ Partial" : "✗ Fail"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          <div className="text-[10px] text-muted-foreground">
                            Detected {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}: {suppliers.join(", ")}
                          </div>

                          <Button
                            size="sm"
                            className="w-full text-xs"
                            disabled={questionConfirming || !activeSheet}
                            onClick={handleConfirmQuestions}
                          >
                            {questionConfirming ? (
                              <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Confirming…</>
                            ) : (
                              <>Confirm & Save to Repository</>
                            )}
                          </Button>
                        </>
                      );
                    })()}
                  </>
                )}

                {/* Confirmed files list */}
                {qRepoFiles.length > 0 && (
                  <>
                    <div className="border-t pt-2.5 mt-2.5">
                      <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Confirmed Files</p>
                      <div className="space-y-1">
                        {qRepoFiles.map(f => (
                          <div key={f.id} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1.5 text-[10px]">
                            <span className="truncate flex-1">{f.display_name}</span>
                            <button
                              onClick={() => handleDeleteQFile(f.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Delete file"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── RIGHT PANEL ─────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">

            {/* No result: run prompt */}
            {!result && (
              <Card className="flex-1">
                <CardContent className="flex flex-col items-center justify-center h-full min-h-[360px] gap-4 text-center">
                  <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <FlaskConical className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-base font-semibold">Run Technical Analysis</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      {supplierFiles.length > 0
                        ? `${supplierFiles.length} supplier file${supplierFiles.length > 1 ? "s" : ""} ready. Click below to score, compare, and rank suppliers.`
                        : "Select a project and ensure supplier response files are uploaded before running."}
                    </p>
                  </div>
                  {runError && (
                    <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 max-w-sm whitespace-pre-wrap">{runError}</p>
                  )}
                  {!weightsValid && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2 max-w-sm dark:text-amber-300">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Weights must total 100% ({weightTotal}%) to run analysis
                    </div>
                  )}
                  {running && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Running technical analysis…
                    </div>
                  )}
                  <Button
                    className="gap-2"
                    disabled={running || supplierFiles.length === 0 || !projectId || !weightsValid}
                    onClick={handleRun}
                    title={!weightsValid ? "Weights must total 100%" : ""}
                  >
                    {running
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</>
                      : <><FlaskConical className="h-4 w-4" /> Run Technical Analysis</>}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Result: recommendation banner + tabs */}
            {result && (
              <>
                {/* Recommendation banner */}
                {top && (
                  <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 shrink-0">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="h-11 w-11 rounded-xl bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center shrink-0">
                        <Trophy className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">Recommended Supplier</p>
                        <p className="text-base font-bold">{top.supplier_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {top.recommendation_summary ?? top.recommendation ?? ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                        <p className="text-2xl font-bold text-emerald-600">{top._weighted.toFixed(1)}</p>
                        <p className="text-[10px] text-muted-foreground">Weighted score</p>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm" variant="outline" className="gap-1 text-xs h-7"
                            onClick={() => handleExportPDF(top.supplier_name)}
                          >
                            {exportingSupplier === top.supplier_name
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <FileDown className="h-3 w-3" />}
                            Export PDF
                          </Button>
                          {/* Re-run button always visible once result is loaded */}
                          <Button
                            size="sm" variant="ghost" className="gap-1 text-xs h-7"
                            disabled={running}
                            onClick={handleRun}
                          >
                            {running
                              ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
                              : <><RefreshCw className="h-3 w-3" /> Re-run</>}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Run error shown inside tab area on re-run failure */}
                {runError && (
                  <div className="flex items-start gap-2 px-4 py-2.5 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="whitespace-pre-wrap">{runError}</span>
                  </div>
                )}

                {/* Tab bar */}
                <div className="flex gap-1 flex-wrap border-b pb-0 shrink-0">
                  {TABS.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md border border-b-0 transition-colors ${
                        activeTab === tab.id
                          ? "bg-background border-border text-foreground -mb-px"
                          : "bg-muted/50 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {tab.icon}{tab.label}
                    </button>
                  ))}
                  <Button
                    size="sm" variant="ghost" className="ml-auto text-xs h-7 gap-1"
                    onClick={() => { setResult(null); setWeightsEdited(false); setRunError(""); }}
                  >
                    <RefreshCw className="h-3 w-3" /> New Analysis
                  </Button>
                </div>

                {/* ── FM-6.1 Comparison Matrix ──────────────────────────── */}
                {activeTab === "matrix" && (
                  <div className="overflow-auto border rounded-md max-h-[520px]">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted z-10">
                        <tr>
                          <th className="sticky left-0 bg-muted px-3 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap border-b border-r min-w-[200px]">
                            Requirement
                          </th>
                          {enrichedSuppliers.map(s => (
                            <th key={s.supplier_id} className="px-3 py-2.5 text-center text-muted-foreground font-medium whitespace-nowrap border-b min-w-[150px]">
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={s._dq.dq ? "line-through text-muted-foreground/60" : ""}>{s.supplier_name}</span>
                                {s._dq.dq && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-500">
                                    <Ban className="h-3 w-3" /> DQ
                                  </span>
                                )}
                                <span className={`text-[11px] font-bold ${scoreColor(s._weighted)}`}>
                                  {s._weighted.toFixed(1)}/10
                                </span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allCategories.flatMap(cat => {
                          const allQs = result.suppliers[0]?.category_scores
                            ?.find(c => c.category === cat)?.questions ?? [];
                          return [
                            <tr key={`cat-${cat}`} className="bg-muted/30">
                              <td
                                colSpan={enrichedSuppliers.length + 1}
                                className="sticky left-0 bg-muted/30 px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b"
                              >
                                {cat}
                              </td>
                            </tr>,
                            ...allQs.map(q => (
                              <tr key={q.question_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                                <td className="sticky left-0 bg-background px-3 py-2 border-r border-border/50 max-w-[200px]">
                                  <p className="line-clamp-2 font-medium">{q.question_text}</p>
                                  <span className="text-[10px] text-muted-foreground">wt: {q.weight}%</span>
                                </td>
                                {enrichedSuppliers.map(s => {
                                  const sq = s.category_scores
                                    ?.find(c => c.category === cat)
                                    ?.questions?.find(qq => qq.question_id === q.question_id);
                                  const sc = sq?.score ?? 0;
                                  return (
                                    <td key={s.supplier_id} className="px-3 py-2 text-center">
                                      <div className="flex flex-col items-center gap-1">
                                        <StatusBadge score={sc} />
                                        <span className={`text-[11px] tabular-nums font-bold ${scoreColor(sc)}`}>{sc.toFixed(1)}</span>
                                        {sq?.rationale && (
                                          <span className="text-[10px] text-muted-foreground line-clamp-2 max-w-[120px] text-left">{sq.rationale}</span>
                                        )}
                                        {sq?.flagged && (
                                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500">
                                            <AlertTriangle className="h-3 w-3" /> Flagged
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            )),
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── FM-6.2 Score Details ──────────────────────────────── */}
                {activeTab === "scores" && (
                  <div className="space-y-3 overflow-auto max-h-[520px] pr-1">
                    {enrichedSuppliers.map((s, i) => (
                      <Card key={s.supplier_id} className={s._dq.dq ? "opacity-60 border-rose-200 dark:border-rose-900" : ""}>
                        <CardHeader className="pb-2 pt-3 px-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]}`}>
                                #{s.rank} {s.supplier_name}
                              </span>
                              {s._dq.dq && <Badge variant="destructive" className="text-[10px] h-4 px-1.5"><Ban className="h-2.5 w-2.5 mr-0.5" />DQ</Badge>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-lg font-bold tabular-nums ${scoreColor(s._weighted)}`}>{s._weighted.toFixed(1)}/10</span>
                              <Button size="sm" variant="outline" className="h-6 gap-1 text-[11px] px-2"
                                onClick={() => handleExportPDF(s.supplier_name)}>
                                {exportingSupplier === s.supplier_name ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                                PDF
                              </Button>
                              <button
                                className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors"
                                onClick={() => setExpandedSupplier(expandedSupplier === s.supplier_id ? null : s.supplier_id)}
                                aria-label="Expand supplier details"
                              >
                                {expandedSupplier === s.supplier_id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                          <ScoreBar score={s._weighted} />
                        </CardHeader>
                        {expandedSupplier === s.supplier_id && (
                          <CardContent className="px-4 pb-4 space-y-3">
                            {/* Strengths / Weaknesses */}
                            {(s.strengths.length > 0 || s.weaknesses.length > 0) && (
                              <div className="grid grid-cols-2 gap-3">
                                {s.strengths.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                                      <TrendingUp className="h-3 w-3" /> Strengths
                                    </p>
                                    <ul className="space-y-0.5">
                                      {s.strengths.map((st, idx) => (
                                        <li key={idx} className="text-[11px] text-muted-foreground flex items-start gap-1">
                                          <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />{st}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {s.weaknesses.length > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-rose-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                                      <TrendingDown className="h-3 w-3" /> Weaknesses
                                    </p>
                                    <ul className="space-y-0.5">
                                      {s.weaknesses.map((w, idx) => (
                                        <li key={idx} className="text-[11px] text-muted-foreground flex items-start gap-1">
                                          <XCircle className="h-3 w-3 text-rose-500 mt-0.5 shrink-0" />{w}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Category accordion */}
                            {(s.category_scores ?? []).map(cat => (
                              <div key={cat.category} className="border rounded-md overflow-hidden">
                                <button
                                  className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/70 transition-colors text-left"
                                  onClick={() => setExpandedCategory(expandedCategory === `${s.supplier_id}-${cat.category}` ? null : `${s.supplier_id}-${cat.category}`)}
                                >
                                  <span className="text-xs font-semibold">{cat.category}</span>
                                  <div className="flex items-center gap-2">
                                    <ScoreBar score={cat.weighted_score} />
                                    {expandedCategory === `${s.supplier_id}-${cat.category}` ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                  </div>
                                </button>
                                {expandedCategory === `${s.supplier_id}-${cat.category}` && (
                                  <div className="divide-y">
                                    {(cat.questions ?? []).map(q => (
                                      <div key={q.question_id} className="px-3 py-2.5 flex items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[11px] font-medium line-clamp-2">{q.question_text}</p>
                                          {q.rationale && <p className="text-[10px] text-muted-foreground mt-0.5">{q.rationale}</p>}
                                          {q.supplier_answer && (
                                            <p className="text-[10px] text-muted-foreground mt-1 italic line-clamp-2">"{q.supplier_answer}"</p>
                                          )}
                                        </div>
                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                          <StatusBadge score={q.score} />
                                          <span className={`text-xs tabular-nums font-bold ${scoreColor(q.score)}`}>{q.score.toFixed(1)}</span>
                                          {q.flagged && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </CardContent>
                        )}
                      </Card>
                    ))}
                  </div>
                )}

                {/* ── FM-6.3 Gap Analysis ───────────────────────────────── */}
                {activeTab === "gaps" && (
                  <div className="space-y-3 overflow-auto max-h-[520px] pr-1">
                    {enrichedSuppliers.map((s, i) => {
                      const gaps = buildGaps(s);
                      return (
                        <Card key={s.supplier_id}>
                          <CardHeader className="pb-2 pt-3 px-4">
                            <div className="flex items-center justify-between">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]}`}>
                                {s.supplier_name}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {gaps.length} gap{gaps.length !== 1 ? "s" : ""} identified
                              </span>
                            </div>
                          </CardHeader>
                          <CardContent className="px-4 pb-4">
                            {gaps.length === 0 ? (
                              <div className="flex items-center gap-2 text-xs text-emerald-600 py-2">
                                <CheckCircle2 className="h-4 w-4" /> No critical gaps — all criteria scored ≥ 5.0
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {gaps.map((g, idx) => (
                                  <div key={idx} className="flex items-start gap-2 p-2 rounded-md bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900">
                                    <XCircle className="h-3.5 w-3.5 text-rose-500 mt-0.5 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[11px] font-medium line-clamp-2">{g.q}</p>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">{g.category}</p>
                                      {g.rationale && <p className="text-[10px] text-muted-foreground mt-0.5 italic">{g.rationale}</p>}
                                    </div>
                                    <span className={`text-xs font-bold tabular-nums shrink-0 ${scoreColor(g.score)}`}>{g.score.toFixed(1)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* ── FM-6.6 Disqualification ───────────────────────────── */}
                {activeTab === "disqual" && (
                  <div className="space-y-4 overflow-auto max-h-[520px] pr-1">
                    {/* Threshold config */}
                    <Card>
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
                          <ShieldAlert className="h-3.5 w-3.5 text-rose-500" /> Disqualification Rules
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-4">
                        {/* Global threshold */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-medium">Minimum overall score threshold</label>
                            <span className="text-sm font-bold tabular-nums">{disqualThreshold.toFixed(1)}</span>
                          </div>
                          <Slider
                            min={0} max={10} step={0.5}
                            value={[disqualThreshold]}
                            onValueChange={([v]) => setDisqualThreshold(v)}
                            className="w-full"
                          />
                          <p className="text-[10px] text-muted-foreground">Suppliers scoring below this threshold are automatically disqualified.</p>
                        </div>

                        {/* Custom rules */}
                        <div>
                          <p className="text-xs font-semibold mb-2">Category-level rules</p>
                          {disqualRules.length === 0 && (
                            <p className="text-[11px] text-muted-foreground italic mb-2">No custom rules — add one below.</p>
                          )}
                          {disqualRules.map((r, idx) => (
                            <div key={idx} className="flex items-center gap-2 mb-1.5 p-2 rounded-md bg-muted/30 border">
                              <span className="flex-1 text-[11px] font-medium">{r.field}</span>
                              <span className="text-[11px] tabular-nums text-muted-foreground">min {r.threshold}</span>
                              {r.mandatory && <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-rose-300 text-rose-600">Mandatory</Badge>}
                              <button
                                className="text-[11px] text-destructive hover:underline"
                                onClick={() => setDisqualRules(rules => rules.filter((_, i) => i !== idx))}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          {/* Add rule */}
                          <div className="flex items-end gap-2 mt-2">
                            <div className="flex-1">
                              <label className="text-[10px] text-muted-foreground mb-0.5 block">Category</label>
                              <select
                                className="w-full h-7 border rounded px-2 text-xs bg-background"
                                value={newRuleField}
                                onChange={e => setNewRuleField(e.target.value)}
                              >
                                <option value="">— Select —</option>
                                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div className="w-20">
                              <label className="text-[10px] text-muted-foreground mb-0.5 block">Min score</label>
                              <input
                                type="number" min={0} max={10} step={0.5}
                                className="w-full h-7 border rounded px-2 text-xs bg-background"
                                value={newRuleThreshold}
                                onChange={e => setNewRuleThreshold(parseFloat(e.target.value))}
                              />
                            </div>
                            <div className="flex items-center gap-1">
                              <input
                                id="mandatory-toggle"
                                type="checkbox"
                                checked={newRuleMandatory}
                                onChange={e => setNewRuleMandatory(e.target.checked)}
                                className="h-3.5 w-3.5"
                              />
                              <label htmlFor="mandatory-toggle" className="text-[10px] text-muted-foreground">Mandatory</label>
                            </div>
                            <Button
                              size="sm" variant="outline" className="h-7 text-xs gap-1"
                              disabled={!newRuleField}
                              onClick={() => {
                                if (!newRuleField) return;
                                setDisqualRules(r => [...r, { field: newRuleField, threshold: newRuleThreshold, mandatory: newRuleMandatory }]);
                                setNewRuleField("");
                              }}
                            >
                              <PlusCircle className="h-3 w-3" /> Add
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Disqualification results */}
                    {enrichedSuppliers.map((s, i) => (
                      <Card key={s.supplier_id} className={s._dq.dq ? "border-rose-200 dark:border-rose-900" : "border-emerald-200 dark:border-emerald-900"}>
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${s._dq.dq ? "bg-rose-100 dark:bg-rose-900" : "bg-emerald-100 dark:bg-emerald-900"}`}>
                            {s._dq.dq ? <Ban className="h-4 w-4 text-rose-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-sm font-semibold ${SUPPLIER_COLORS[i % SUPPLIER_COLORS.length].split(" ")[1]}`}>{s.supplier_name}</span>
                              <span className={`text-[11px] tabular-nums font-bold ${scoreColor(s._weighted)}`}>{s._weighted.toFixed(1)}/10</span>
                              {s._dq.dq
                                ? <Badge variant="destructive" className="text-[10px] h-4 px-1.5">Disqualified</Badge>
                                : <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-300 text-emerald-700 dark:text-emerald-400">Qualified</Badge>}
                            </div>
                            {s._dq.dq && s._dq.reasons.length > 0 && (
                              <ul className="space-y-0.5">
                                {s._dq.reasons.map((r, ri) => (
                                  <li key={ri} className="text-[11px] text-rose-600 dark:text-rose-400 flex items-start gap-1">
                                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{r}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* ── FM-6.2 Scoring Weights ────────────────────────────── */}
                {activeTab === "weights" && (
                  <div className="space-y-4 overflow-auto max-h-[520px] pr-1">
                    <Card>
                      <CardHeader className="pb-2 pt-3 px-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5">
                            <SlidersHorizontal className="h-3.5 w-3.5" /> Category Weights
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold tabular-nums ${weightsValid ? "text-emerald-600" : "text-amber-600"}`}>
                              {weightTotal}% {weightsValid ? "✓" : "⚠ must total 100"}
                            </span>
                            <Button
                              size="sm" variant="ghost" className="h-6 text-xs"
                              onClick={() => { setWeightsEdited(false); }}
                            >
                              Reset
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-4">
                        <p className="text-[11px] text-muted-foreground">
                          Adjust how each category contributes to the overall score. Weights must total 100%.
                          Changes are applied immediately to all scores and DQ checks.
                        </p>
                        {allCategories.map(cat => (
                          <div key={cat} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-medium">{cat}</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number" min={0} max={100} step={1}
                                  className="w-14 h-6 border rounded px-2 text-xs text-right bg-background"
                                  value={weights[cat] ?? 0}
                                  onChange={e => {
                                    setWeightsEdited(true);
                                    setWeights(w => ({ ...w, [cat]: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }));
                                  }}
                                />
                                <span className="text-xs text-muted-foreground w-3">%</span>
                              </div>
                            </div>
                            <Slider
                              min={0} max={100} step={1}
                              value={[weights[cat] ?? 0]}
                              onValueChange={([v]) => {
                                setWeightsEdited(true);
                                setWeights(w => ({ ...w, [cat]: v }));
                              }}
                            />
                          </div>
                        ))}
                        {!weightsValid && (
                          <div className="flex items-center gap-2 text-xs text-amber-600 p-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            Weights total {weightTotal}%. Please adjust to reach exactly 100% before re-running.
                          </div>
                        )}
                        {weightsValid && weightsEdited && (
                          <Button className="w-full gap-2 text-xs" size="sm" onClick={handleRun} disabled={running}>
                            {running ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…</> : <><FlaskConical className="h-3.5 w-3.5" /> Re-run with new weights</>}
                          </Button>
                        )}
                      </CardContent>
                    </Card>

                    {/* Live weighted scores preview */}
                    <Card>
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-xs font-semibold uppercase tracking-wide">Live Weighted Scores</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 space-y-2">
                        {enrichedSuppliers.map((s, i) => (
                          <div key={s.supplier_id} className="flex items-center gap-3">
                            <span className={`text-[11px] font-medium w-36 truncate ${SUPPLIER_COLORS[i % SUPPLIER_COLORS.length].split(" ")[1]}`}>
                              {s.supplier_name}
                            </span>
                            <div className="flex-1">
                              <ScoreBar score={s._weighted} />
                            </div>
                            {s._dq.dq && <Ban className="h-3.5 w-3.5 text-rose-500 shrink-0" />}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* ── FM-6.4 Drawing Conformance ────────────────────────── */}
                {activeTab === "drawings" && (
                  <div className="space-y-3 overflow-auto max-h-[520px] pr-1">
                    <Card className="border-dashed">
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Ruler className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">Drawing / Spec Conformance</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-md">
                              Upload technical drawings (PDF/DWG/DXF) for this project via the Drawings module.
                              Once drawings are parsed, the agent will compare each supplier's stated specifications
                              against the drawing dimensions and flag mismatches, missing evidence, and tolerances exceeded.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Per-supplier drawing status */}
                    {enrichedSuppliers.map((s, i) => {
                      // Drawing conformance data comes from backend drawings module
                      // For now we show a per-supplier placeholder until drawings are linked
                      const hasFlaggedItems = s.category_scores?.some(c =>
                        c.questions?.some(q => q.flagged)
                      );
                      return (
                        <Card key={s.supplier_id}>
                          <CardContent className="p-4 flex items-start gap-3">
                            <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${hasFlaggedItems ? "bg-amber-100 dark:bg-amber-900" : "bg-muted"}`}>
                              {hasFlaggedItems
                                ? <AlertTriangle className="h-4 w-4 text-amber-500" />
                                : <Info className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-sm font-semibold ${SUPPLIER_COLORS[i % SUPPLIER_COLORS.length].split(" ")[1]}`}>{s.supplier_name}</span>
                                {hasFlaggedItems
                                  ? <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-300 text-amber-700 dark:text-amber-400">Flagged Items</Badge>
                                  : <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">Awaiting drawings</Badge>}
                              </div>
                              {hasFlaggedItems ? (
                                <ul className="space-y-0.5">
                                  {s.category_scores?.flatMap(c =>
                                    c.questions?.filter(q => q.flagged).map(q => (
                                      <li key={q.question_id} className="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1">
                                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{q.question_text}
                                      </li>
                                    )) ?? []
                                  )}
                                </ul>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">
                                  No technical drawings have been uploaded for this project yet. Upload drawings in the Drawings module to enable spec conformance checking.
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* ── FM-6.2 Scoring Pattern Section ─────────────────────── */}
                <Card>
                  <CardHeader className="pb-2 pt-3 px-4 cursor-pointer" onClick={() => setScoringPatternOpen(!scoringPatternOpen)}>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-xs font-semibold uppercase tracking-wide">Scoring Pattern</CardTitle>
                      <button className="text-muted-foreground hover:text-foreground transition-colors">
                        {scoringPatternOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </CardHeader>
                  {scoringPatternOpen && (
                    <CardContent className="px-4 pb-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Left: Weight bars */}
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-medium text-muted-foreground">Weight Distribution</p>
                          {allCategories.map(cat => {
                            const w = weights[cat] ?? 0;
                            const pct = w;
                            return (
                              <div key={cat} className="space-y-0.5">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="font-medium">{cat}</span>
                                  <span className="text-muted-foreground">{pct}%</span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Right: Rules table */}
                        <div className="space-y-2.5">
                          <p className="text-[11px] font-medium text-muted-foreground">Scoring Rules</p>
                          <div className="overflow-auto border rounded text-[10px]">
                            <table className="w-full">
                              <thead className="bg-muted sticky top-0">
                                <tr className="border-b">
                                  <th className="px-2 py-1 text-left font-medium">Category</th>
                                  <th className="px-2 py-1 text-center font-medium">Weight</th>
                                  <th className="px-2 py-1 text-center font-medium">Min</th>
                                </tr>
                              </thead>
                              <tbody>
                                {allCategories.map((cat, i) => (
                                  <tr key={cat} className={`border-b text-[10px] ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                                    <td className="px-2 py-1.5 font-medium">{cat}</td>
                                    <td className="px-2 py-1.5 text-center tabular-nums">{weights[cat] ?? 0}%</td>
                                    <td className="px-2 py-1.5 text-center text-muted-foreground">4.0</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="text-[10px] text-muted-foreground p-2 bg-muted/30 rounded">
                            Supplier scores below {disqualThreshold.toFixed(1)}/10 on {disqualMaxWeak} criteria will be auto-disqualified
                          </div>
                        </div>
                      </div>

                      {/* Save button */}
                      {weightsEdited && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="flex-1 text-xs gap-1.5"
                            onClick={handleSaveWeights}
                            disabled={weightSaving || !weightsValid}
                          >
                            {weightSaving ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                            ) : (
                              <>Save Weights</>
                            )}
                          </Button>
                          {weightSavedMsg && (
                            <span className="text-[10px] text-emerald-600 font-medium">{weightSavedMsg}</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  )}
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. Agent ticker ────────────────────────────────────────────────── */}
      <div className={`shrink-0 border-t px-6 py-2 flex items-center gap-3 overflow-hidden ${isTickerActive ? "bg-primary/5 border-primary/20" : "bg-muted/30"}`}>
        <div className={`h-2 w-2 rounded-full shrink-0 ${isTickerActive ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
        <p className="text-[11px] text-muted-foreground truncate font-mono">{tickerText}</p>
      </div>
    </div>
  );
}

