/**
 * AnalysisPage.tsx — Technical Analysis
 * UX mirrors PricingPage.tsx exactly: header bar, KPI strip, left panel,
 * right panel tabs, agent ticker at the bottom.
 * No analysisStore / AgentStreamingThought / ConfidenceBadge.
 *
 * Fix log (v2):
 *  - API prefix corrected to /technical-analysis (main.py mounts at that prefix)
 *  - Run endpoint uses POST /technical-analysis/run with full payload built
 *    from loaded supplier files + RFP questions fetched from backend
 *  - Status poll uses /technical-analysis/status/{job_id}
 *  - Agent ticker filters agent_id === "technical" (not "analysis")
 *  - Upload fetch omits Content-Type header (browser sets multipart boundary)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useNavigate } from "react-router-dom";
import {
  Trophy, TrendingUp, TrendingDown, BarChart3,
  ChevronDown, ChevronUp, FlaskConical, Ban,
  FileDown, AlertTriangle, CheckCircle2,
  XCircle, Minus, SlidersHorizontal, ClipboardList,
  Ruler, RefreshCw, ShieldAlert, Loader2, Upload,
  Info, PlusCircle,
} from "lucide-react";

// ── Auth & API constants (match Pricing exactly) ──────────────────────────────
const API = "/api";
const token = localStorage.getItem("access_token") ?? "";
const ah = { Authorization: `Bearer ${token}` };

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
    pass:    { icon: <CheckCircle2 className="h-3.5 w-3.5" />, cls: "text-emerald-700 bg-emerald-50 border-emerald-200", label: "Pass" },
    partial: { icon: <Minus className="h-3.5 w-3.5" />,       cls: "text-amber-700  bg-amber-50  border-amber-200",  label: "Partial" },
    fail:    { icon: <XCircle className="h-3.5 w-3.5" />,     cls: "text-rose-700   bg-rose-50   border-rose-200",   label: "Fail" },
    na:      { icon: <Minus className="h-3.5 w-3.5" />,       cls: "text-gray-500   bg-gray-50   border-gray-200",   label: "N/A" },
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
  const ws = reweightedScore(s, weights);
  if (ws < threshold) reasons.push(`Score ${ws.toFixed(1)} < threshold ${threshold}`);
  for (const rule of rules) {
    const cat = (s.category_scores ?? []).find(c => c.category === rule.field);
    if (!cat && rule.mandatory) { reasons.push(`Missing mandatory: ${rule.field}`); continue; }
    if (cat && cat.weighted_score < rule.threshold)
      reasons.push(`${rule.field} ${cat.weighted_score.toFixed(1)} < ${rule.threshold}${rule.mandatory ? " (mandatory)" : ""}`);
  }
  return { dq: reasons.length > 0, reasons };
}

function buildGaps(s: SupplierResult) {
  const weak: Array<{ q: string; score: number; category: string }> = [];
  for (const cat of s.category_scores ?? []) {
    for (const q of cat.questions ?? []) {
      if (q.score < 5) weak.push({ q: q.question_text, score: q.score, category: cat.category });
    }
  }
  return weak.sort((a, b) => a.score - b.score);
}

// ── Shape backend raw result → AnalysisResult ─────────────────────────────────
// The backend /technical-analysis/run endpoint returns {scores, gaps, reports, disqualified}
// We need to normalise it into the AnalysisResult shape the UI expects.
// If the backend already returns {suppliers: [...]} we pass it through.
function normaliseResult(data: Record<string, unknown>, projectId: string): AnalysisResult {
  // Already shaped (e.g. from _shape_analysis_result or a job poll result)
  if (Array.isArray((data as { suppliers?: unknown }).suppliers)) {
    return {
      project_id: (data.project_id as string) ?? projectId,
      analysis_summary: (data.analysis_summary as string) ?? "",
      top_recommendation: (data.top_recommendation as string) ?? "",
      confidence_score: (data.confidence_score as number) ?? 0,
      suppliers: (data.suppliers as SupplierResult[]),
    };
  }

  // Raw format from POST /technical-analysis/run:
  // { scores: {supplierName: {qId: {score, rationale, flagged}}}, gaps, reports, disqualified, project_id }
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

    // Group questions by category — derive from question IDs if no category info
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-read token at render time so it's always fresh
  const liveToken = () => localStorage.getItem("access_token") ?? "";
  const liveAh = () => ({ Authorization: `Bearer ${liveToken()}` });

  // ── Projects
  const [projects, setProjects]   = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");

  // ── Left panel — supplier files
  const [supplierFiles, setSupplierFiles] = useState<SupplierFile[]>([]);
  const [leftTab, setLeftTab]             = useState<"project" | "upload">("project");
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectLoadMsg, setProjectLoadMsg] = useState("");
  const [reloadKey, setReloadKey]           = useState(0);

  // ── Upload
  const [uploadFile, setUploadFile]         = useState<File | null>(null);
  const [uploadName, setUploadName]         = useState("");
  const [uploading, setUploading]           = useState(false);
  const [uploadMsg, setUploadMsg]           = useState("");

  // ── Analysis result
  const [result, setResult]     = useState<AnalysisResult | null>(null);
  const [running, setRunning]   = useState(false);
  const [runError, setRunError] = useState("");

  // ── Right panel
  const [activeTab, setActiveTab] = useState<Tab>("matrix");
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [exportingSupplier, setExportingSupplier] = useState<string | null>(null);

  // ── Weights
  const [weights, setWeights]             = useState<Record<string, number>>({});
  const [weightsEdited, setWeightsEdited] = useState(false);

  // ── Disqualification
  const [disqualThreshold, setDisqualThreshold] = useState(4.0);
  const [disqualRules, setDisqualRules]         = useState<DisqualRule[]>([]);
  const [newRuleField, setNewRuleField]         = useState("");
  const [newRuleThreshold, setNewRuleThreshold] = useState(4.0);
  const [newRuleMandatory, setNewRuleMandatory] = useState(false);

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

  // ── Agent ticker poll ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      fetch(`${API}/agent-logs?limit=10`, { headers: liveAh() })
        .then(r => r.json())
        // agent_id is "technical" in analysis.py push_log calls
        .then((logs: AgentLog[]) => setAgentLogs(logs.filter(l => l.agent_id === "technical")))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upload handler ─────────────────────────────────────────────────────────
  // NOTE: Do NOT include Content-Type header — browser sets multipart boundary automatically
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
      // Only Authorization header — no Content-Type (browser handles multipart boundary)
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
  // The backend POST /technical-analysis/run requires {questions, supplier_responses}.
  // We first fetch RFP questions for the project, then call run.
  // If questions aren't parseable yet, we still send an empty array and let
  // the backend return an informative error.
  const handleRun = useCallback(async () => {
    if (!projectId) return;
    setRunning(true);
    setRunError("");

    try {
      const hdrs = liveAh();

      // Step 1: Fetch RFP questions for this project
      // The backend stores them as questions.json metadata — we try the rfp route
      let questions: RFQQuestion[] = [];
      try {
        const qRes = await fetch(`${API}/rfp/${projectId}/questions`, { headers: hdrs });
        if (qRes.ok) {
          const qData = await qRes.json();
          questions = Array.isArray(qData) ? qData : (qData.questions ?? []);
        }
      } catch {
        // Questions not available via that route — proceed with empty array;
        // backend _do_analysis_job will load them from questions.json itself
      }

      // Step 2: Build supplier_responses map from loaded file names
      // Each supplier maps question_id → "" (backend re-parses docs from disk)
      const supplier_responses: Record<string, Record<string, string>> = {};
      for (const sf of supplierFiles) {
        supplier_responses[sf.supplierName] = {};
        for (const q of questions) {
          supplier_responses[sf.supplierName][q.question_id] = "";
        }
      }

      // Step 3: POST to the correct endpoint
      // Correct prefix per main.py: /technical-analysis (not /analysis)
      const res = await fetch(`${API}/technical-analysis/run`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          questions,
          supplier_responses,
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
  }, [projectId, supplierFiles]);

  // ── PDF export ─────────────────────────────────────────────────────────────
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

  // ── Suppress unused-import warning for module-level `ah` constant ─────────
  void ah;

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
          {/* Project picker */}
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
          {/* Refresh */}
          <button
            className="h-8 w-8 flex items-center justify-center rounded-md border bg-background hover:bg-muted transition-colors"
            onClick={() => setReloadKey(k => k + 1)}
            aria-label="Refresh files"
          >
            {projectLoading
              ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              : <RefreshCw className="h-4 w-4 text-muted-foreground" />}
          </button>
          {/* Pricing link */}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => navigate("/pricing")}>
            <BarChart3 className="h-3.5 w-3.5" /> Pricing Analysis →
          </Button>
        </div>
      </div>

      {/* ── 2. Main body ───────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 flex flex-col gap-6 overflow-auto">

        {/* ── 2a. KPI strip ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Suppliers Scored",   value: result?.suppliers.length ?? 0,                               cls: "border-primary/20 bg-primary/5 text-primary" },
            { label: "Disqualified",        value: kpi.dqCount,                                                  cls: "border-destructive/20 bg-destructive/5 text-destructive" },
            { label: "Top Score",           value: kpi.topScore != null ? `${kpi.topScore.toFixed(1)} / 10` : "—", cls: "border-success/20 bg-success/5 text-success" },
            { label: "Criteria Evaluated",  value: kpi.totalQuestions,                                           cls: "border-warning/20 bg-warning/5 text-warning" },
          ].map(k => (
            <Card key={k.label} className={`py-0 border ${k.cls}`}>
              <CardContent className="p-4">
                <p className="text-[11px] font-medium opacity-70 uppercase tracking-wide">{k.label}</p>
                <p className="text-2xl font-bold tabular-nums mt-0.5">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── 2b. Two-column body ─────────────────────────────────────────── */}
        <div className="flex gap-4 min-h-0 flex-nowrap">

          {/* ── LEFT PANEL ──────────────────────────────────────────────── */}
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
                  {running && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Running technical analysis…
                    </div>
                  )}
                  <Button
                    className="gap-2"
                    disabled={running || supplierFiles.length === 0 || !projectId}
                    onClick={handleRun}
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
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-bold text-emerald-600">{top._weighted.toFixed(1)}</p>
                        <p className="text-[10px] text-muted-foreground">Weighted score</p>
                        <Button
                          size="sm" variant="outline" className="mt-1.5 gap-1 text-xs h-7"
                          onClick={() => handleExportPDF(top.supplier_name)}
                        >
                          {exportingSupplier === top.supplier_name
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <FileDown className="h-3 w-3" />}
                          Export PDF
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
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
                    onClick={() => { setResult(null); setWeightsEdited(false); }}
                  >
                    <RefreshCw className="h-3 w-3" /> New Analysis
                  </Button>
                </div>

                {/* ── FM-6.1 Comparison Matrix ──────────────────────────── */}
                {activeTab === "matrix" && (
                  <div className="overflow-auto border-t border-border max-h-[520px] rounded-b-md">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted z-10">
                        <tr>
                          <th className="sticky left-0 bg-muted px-3 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap border-b border-border border-r min-w-[200px]">
                            Requirement
                          </th>
                          {enrichedSuppliers.map(s => (
                            <th key={s.supplier_id} className="px-3 py-2.5 text-center text-muted-foreground font-medium whitespace-nowrap border-b border-border min-w-[150px]">
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
                                className="sticky left-0 bg-muted/30 px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border"
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
                                          <span className="text-[10px] text-muted-foreground line-clamp-2 max-w-[120px] text-center">{sq.rationale}</span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            )),
                          ];
                        })}
                        {/* Totals row */}
                        <tr className="border-t-2 bg-muted/20">
                          <td className="sticky left-0 bg-muted/20 px-3 py-2.5 border-r text-xs font-semibold">Overall Weighted Score</td>
                          {enrichedSuppliers.map(s => (
                            <td key={s.supplier_id} className="px-3 py-2.5 text-center">
                              <span className={`text-sm font-bold tabular-nums ${scoreColor(s._weighted)}`}>
                                {s._weighted.toFixed(1)}
                              </span>
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ── FM-6.2 Score Details ──────────────────────────────── */}
                {activeTab === "scores" && (
                  <div className="space-y-3 overflow-auto">
                    {enrichedSuppliers.map(s => {
                      const isExp = expandedSupplier === s.supplier_id;
                      return (
                        <Card key={s.supplier_id} className={s._dq.dq ? "opacity-60 border-rose-200" : ""}>
                          <button className="w-full text-left" onClick={() => setExpandedSupplier(isExp ? null : s.supplier_id)}>
                            <CardHeader className="pb-3">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                    s._dq.dq ? "bg-rose-100 text-rose-600" : "bg-primary/10 text-primary"
                                  }`}>#{s.rank}</div>
                                  <div>
                                    <CardTitle className="text-sm">{s.supplier_name}</CardTitle>
                                    {s._dq.dq && (
                                      <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-0.5">
                                        <Ban className="h-3 w-3" /> Disqualified
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="text-right">
                                    <p className={`text-xl font-bold ${scoreColor(s._weighted)}`}>{s._weighted.toFixed(1)}</p>
                                    <p className="text-[10px] text-muted-foreground">/ 10</p>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1"
                                      onClick={e => { e.stopPropagation(); handleExportPDF(s.supplier_name); }}
                                    >
                                      {exportingSupplier === s.supplier_name
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <FileDown className="h-3 w-3" />} PDF
                                    </Button>
                                    {isExp ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 space-y-1.5">
                                {(s.category_scores ?? []).map(cat => (
                                  <div key={cat.category} className="grid grid-cols-[120px_1fr] gap-3 items-center">
                                    <span className="text-[11px] text-muted-foreground truncate">{cat.category}</span>
                                    <ScoreBar score={cat.weighted_score} />
                                  </div>
                                ))}
                              </div>
                            </CardHeader>
                          </button>
                          {isExp && (
                            <CardContent className="pt-0 border-t space-y-4">
                              <div className="grid grid-cols-2 gap-4 pt-4">
                                <div>
                                  <p className="text-xs font-semibold flex items-center gap-1.5 mb-2 text-emerald-600">
                                    <TrendingUp className="h-3.5 w-3.5" /> Strengths
                                  </p>
                                  <ul className="space-y-1">
                                    {(s.strengths ?? []).map((str, i) => (
                                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />{str}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold flex items-center gap-1.5 mb-2 text-rose-600">
                                    <TrendingDown className="h-3.5 w-3.5" /> Weaknesses
                                  </p>
                                  <ul className="space-y-1">
                                    {(s.weaknesses ?? []).map((w, i) => (
                                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                        <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />{w}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                              {(s.category_scores ?? []).map(cat => {
                                const key = `${s.supplier_id}-${cat.category}`;
                                const open = expandedCategory === key;
                                return (
                                  <div key={cat.category} className="rounded-lg border">
                                    <button
                                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors"
                                      onClick={() => setExpandedCategory(open ? null : key)}
                                    >
                                      <span className="text-xs font-semibold">{cat.category}</span>
                                      <div className="flex items-center gap-3">
                                        <StatusBadge score={cat.weighted_score} />
                                        <span className={`text-sm font-bold ${scoreColor(cat.weighted_score)}`}>{cat.weighted_score.toFixed(1)}/10</span>
                                        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                      </div>
                                    </button>
                                    {open && (
                                      <div className="border-t divide-y">
                                        {(cat.questions ?? []).map(q => (
                                          <div key={q.question_id} className="px-4 py-3 space-y-1.5">
                                            <div className="flex items-start justify-between gap-4">
                                              <div className="flex-1">
                                                <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                                  <span className="text-[10px] font-bold text-primary">{q.question_id}</span>
                                                  <span className={`text-[10px] px-1.5 py-0 rounded ${
                                                    q.question_type === "quantitative" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                                                  }`}>{q.question_type}</span>
                                                  <span className="text-[10px] text-muted-foreground">wt: {q.weight}%</span>
                                                  {q.flagged && (
                                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                                                      <AlertTriangle className="h-3 w-3" /> Flagged
                                                    </span>
                                                  )}
                                                </div>
                                                <p className="text-xs font-medium">{q.question_text}</p>
                                              </div>
                                              <span className={`text-sm font-bold shrink-0 ${scoreColor(q.score)}`}>{q.score.toFixed(1)}/10</span>
                                            </div>
                                            {q.supplier_answer && (
                                              <div className="rounded bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                                                <span className="font-semibold text-foreground">Answer: </span>{q.supplier_answer}
                                              </div>
                                            )}
                                            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />{q.rationale}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* ── FM-6.3 Gap Analysis ───────────────────────────────── */}
                {activeTab === "gaps" && (
                  <div className="space-y-3 overflow-auto">
                    <p className="text-xs text-muted-foreground">
                      Questions where the supplier scored below <strong>5.0</strong>, grouped by supplier.
                    </p>
                    {enrichedSuppliers.map(s => {
                      const gaps = buildGaps(s);
                      return (
                        <Card key={s.supplier_id} className={gaps.length === 0 ? "border-emerald-200" : "border-amber-200"}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm flex items-center gap-2">
                                {gaps.length === 0
                                  ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                  : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                                {s.supplier_name}
                              </CardTitle>
                              <div className="flex items-center gap-2">
                                {s._dq.dq && (
                                  <span className="text-[11px] text-rose-600 flex items-center gap-1">
                                    <Ban className="h-3 w-3" /> DQ
                                  </span>
                                )}
                                <Badge variant="outline" className="text-[10px]">
                                  {gaps.length === 0 ? "No gaps" : `${gaps.length} gap${gaps.length !== 1 ? "s" : ""}`}
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                          {gaps.length > 0 && (
                            <CardContent className="pt-0 space-y-1.5">
                              {gaps.map((g, i) => (
                                <div key={i} className="flex items-start gap-3 bg-muted/30 rounded-md px-3 py-2">
                                  <StatusBadge score={g.score} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium line-clamp-2">{g.q}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{g.category}</p>
                                  </div>
                                  <span className={`text-xs font-bold tabular-nums shrink-0 ${scoreColor(g.score)}`}>
                                    {g.score.toFixed(1)}
                                  </span>
                                </div>
                              ))}
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}

                {/* ── FM-6.6 Disqualification ───────────────────────────── */}
                {activeTab === "disqual" && (
                  <div className="space-y-4 overflow-auto">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 text-rose-500" /> Disqualification Rules
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Suppliers below the overall threshold or failing a mandatory category rule will be flagged.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-5">
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium">Overall Score Threshold</span>
                            <span className="tabular-nums text-muted-foreground">{disqualThreshold.toFixed(1)} / 10</span>
                          </div>
                          <Slider value={[disqualThreshold]} min={0} max={10} step={0.5}
                            onValueChange={([v]) => setDisqualThreshold(v)} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold mb-2">Category-Level Rules</p>
                          <div className="space-y-1.5 mb-3">
                            {disqualRules.map((rule, i) => (
                              <div key={i} className="flex items-center gap-2 p-2 rounded border text-xs bg-rose-50 border-rose-200 dark:bg-rose-950/20">
                                {rule.mandatory ? <Ban className="h-3 w-3 text-rose-500" /> : <AlertTriangle className="h-3 w-3 text-amber-500" />}
                                <span className="flex-1">{rule.field} &lt; <strong>{rule.threshold}</strong>
                                  {rule.mandatory && <span className="ml-1 text-[10px] text-rose-600">(mandatory)</span>}
                                </span>
                                <button className="text-rose-500 hover:opacity-70 text-[11px]"
                                  onClick={() => setDisqualRules(p => p.filter((_, j) => j !== i))}>
                                  Remove
                                </button>
                              </div>
                            ))}
                            {disqualRules.length === 0 && (
                              <p className="text-xs text-muted-foreground italic">No category rules. Add one below.</p>
                            )}
                          </div>
                          <div className="flex gap-2 items-center flex-wrap">
                            <select className="flex-1 border rounded px-2 py-1.5 text-xs bg-background min-w-[140px]"
                              value={newRuleField} onChange={e => setNewRuleField(e.target.value)}>
                              <option value="">— Select category —</option>
                              {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-muted-foreground">Threshold:</span>
                              <input type="number" min={0} max={10} step={0.5}
                                className="w-14 border rounded px-2 py-1.5 text-xs bg-background"
                                value={newRuleThreshold}
                                onChange={e => setNewRuleThreshold(Number(e.target.value))} />
                            </div>
                            <label className="flex items-center gap-1 text-xs cursor-pointer">
                              <input type="checkbox" checked={newRuleMandatory}
                                onChange={e => setNewRuleMandatory(e.target.checked)} className="rounded" />
                              Mandatory
                            </label>
                            <Button size="sm" variant="outline" className="text-xs h-7"
                              disabled={!newRuleField}
                              onClick={() => {
                                if (!newRuleField) return;
                                setDisqualRules(p => [...p, { field: newRuleField, threshold: newRuleThreshold, mandatory: newRuleMandatory }]);
                                setNewRuleField("");
                              }}>
                              <PlusCircle className="h-3 w-3 mr-1" /> Add Rule
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">Evaluation Results</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {enrichedSuppliers.map(s => (
                          <div key={s.supplier_id} className={`flex items-start gap-3 rounded-lg p-3 border ${
                            s._dq.dq
                              ? "bg-rose-50 border-rose-200 dark:bg-rose-950/20"
                              : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20"
                          }`}>
                            <div className="shrink-0 mt-0.5">
                              {s._dq.dq
                                ? <Ban className="h-4 w-4 text-rose-500" />
                                : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{s.supplier_name}</p>
                              {s._dq.dq
                                ? <ul className="mt-1 space-y-0.5">{s._dq.reasons.map((r, i) => <li key={i} className="text-xs text-rose-600">• {r}</li>)}</ul>
                                : <p className="text-xs text-emerald-600 mt-0.5">Meets all thresholds</p>}
                            </div>
                            <span className={`text-sm font-bold tabular-nums shrink-0 ${scoreColor(s._weighted)}`}>{s._weighted.toFixed(1)}</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* ── FM-6.2 Scoring Weights ────────────────────────────── */}
                {activeTab === "weights" && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4" /> Weighted Scoring Configurator
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Set each category's importance. Total must equal 100%. Rankings update instantly.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="space-y-4">
                        {allCategories.map(cat => (
                          <div key={cat} className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium">{cat}</span>
                              <span className="tabular-nums text-muted-foreground">{weights[cat] ?? 0}%</span>
                            </div>
                            <Slider
                              value={[weights[cat] ?? 0]} min={0} max={100} step={5}
                              onValueChange={([v]) => {
                                setWeights(p => ({ ...p, [cat]: v }));
                                setWeightsEdited(true);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
                        weightsValid
                          ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20"
                          : "border-rose-200 bg-rose-50 dark:bg-rose-950/20"
                      }`}>
                        <span className="font-medium">Total</span>
                        <span className={`font-bold tabular-nums ${weightsValid ? "text-emerald-600" : "text-rose-600"}`}>
                          {weightTotal}%{!weightsValid && " — must equal 100%"}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold mb-3">Re-scored Rankings</p>
                        <div className="space-y-2">
                          {[...enrichedSuppliers].sort((a, b) => b._weighted - a._weighted).map((s, i) => (
                            <div key={s.supplier_id} className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground w-5 text-right">#{i + 1}</span>
                              <span className="flex-1 text-sm truncate">{s.supplier_name}</span>
                              <div className="w-32"><ScoreBar score={s._weighted} /></div>
                              {s._dq.dq && <Ban className="h-3.5 w-3.5 text-rose-500 shrink-0" />}
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* ── FM-6.4 Drawing Conformance ────────────────────────── */}
                {activeTab === "drawings" && (() => {
                  const qMap = new Map<string, {
                    spec: string; category: string;
                    suppliers: Record<string, { answer: string; status: "match" | "mismatch" | "unverified" }>;
                  }>();
                  for (const s of result.suppliers) {
                    for (const cat of s.category_scores ?? []) {
                      for (const q of cat.questions ?? []) {
                        if (q.question_type !== "quantitative") continue;
                        if (!qMap.has(q.question_id))
                          qMap.set(q.question_id, { spec: q.question_text, category: cat.category, suppliers: {} });
                        const ans = q.supplier_answer ?? "";
                        qMap.get(q.question_id)!.suppliers[s.supplier_name] = {
                          answer: ans,
                          status: !ans || ans === "—" ? "unverified" : q.score >= 7.5 ? "match" : q.score >= 5 ? "unverified" : "mismatch",
                        };
                      }
                    }
                  }
                  const checks = [...qMap.values()];
                  const sStyle = (st: "match" | "mismatch" | "unverified") =>
                    st === "match" ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                    : st === "mismatch" ? "text-rose-600 bg-rose-50 border-rose-200"
                    : "text-amber-600 bg-amber-50 border-amber-200";
                  const sIcon = (st: "match" | "mismatch" | "unverified") =>
                    st === "match" ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : st === "mismatch" ? <XCircle className="h-3.5 w-3.5" />
                    : <Minus className="h-3.5 w-3.5" />;
                  if (!checks.length) return (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                        <Ruler className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">No quantitative spec questions in this analysis.</p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          Upload technical drawings and ensure the RFP includes quantitative requirements to enable conformance checking.
                        </p>
                      </CardContent>
                    </Card>
                  );
                  return (
                    <div className="overflow-auto border-t border-border max-h-[520px] rounded-b-md">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-muted z-10">
                          <tr>
                            <th className="px-3 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap border-b border-border min-w-[200px]">Spec / Requirement</th>
                            <th className="px-3 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap border-b border-border">Category</th>
                            {enrichedSuppliers.map(s => (
                              <th key={s.supplier_id} className="px-3 py-2.5 text-center text-muted-foreground font-medium whitespace-nowrap border-b border-border min-w-[130px]">
                                {s.supplier_name}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {checks.map((c, i) => (
                            <tr key={i} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                              <td className="px-3 py-2 font-medium line-clamp-2">{c.spec}</td>
                              <td className="px-3 py-2 text-muted-foreground">{c.category}</td>
                              {enrichedSuppliers.map(s => {
                                const e = c.suppliers[s.supplier_name];
                                if (!e) return <td key={s.supplier_id} className="px-3 py-2 text-center text-muted-foreground">—</td>;
                                return (
                                  <td key={s.supplier_id} className="px-3 py-2">
                                    <div className="flex flex-col items-center gap-1">
                                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium capitalize ${sStyle(e.status)}`}>
                                        {sIcon(e.status)}{e.status}
                                      </span>
                                      {e.answer && (
                                        <span className="text-[10px] text-muted-foreground line-clamp-2 text-center max-w-[120px]">{e.answer}</span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. Agent ticker ────────────────────────────────────────────────── */}
      <div className="border-t bg-card py-2 px-4 flex items-center gap-3 shrink-0">
        <div className={`h-2 w-2 rounded-full shrink-0 ${
          isTickerActive ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/40"
        }`} />
        <p className="text-[11px] text-muted-foreground truncate flex-1">{tickerText}</p>
        {agentLogs[0] && (
          <Badge variant="outline" className={`text-[10px] shrink-0 ${
            agentLogs[0].status === "complete" ? "border-emerald-200 text-emerald-600"
            : agentLogs[0].status === "running"  ? "border-primary/30 text-primary"
            : agentLogs[0].status === "error"    ? "border-rose-200 text-rose-600"
            : "border-border text-muted-foreground"
          }`}>
            {agentLogs[0].status}
          </Badge>
        )}
      </div>

      {/* Print stylesheet */}
      <style>{`
        @media print {
          nav, aside, [data-sidebar], .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>
    </div>
  );
}
