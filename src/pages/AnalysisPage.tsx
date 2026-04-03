import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { analysisStore } from "@/lib/analysisStore";
import { api } from "@/lib/api";
import type { AnalysisResult, SupplierResult, CategoryScore } from "@/lib/types";
import {
  Trophy, TrendingUp, TrendingDown, ArrowUpDown,
  ChevronDown, ChevronUp, PlusCircle, Info,
  Loader2, FlaskConical, FolderOpen, Ban,
  Settings2, FileDown, AlertTriangle, CheckCircle2,
  XCircle, Minus, SlidersHorizontal, ClipboardList,
  Ruler, RefreshCw, ShieldAlert,
} from "lucide-react";
import { useAgents } from "@/contexts/AgentContext";
import AgentStreamingThought from "@/components/AgentStreamingThought";
import ConfidenceBadge from "@/components/ConfidenceBadge";

// ── Constants ─────────────────────────────────────────────────────────────────
const ANALYSIS_THOUGHTS = [
  "Loading supplier response documents…",
  "Extracting technical requirements from RFP…",
  "Mapping supplier claims to RFP criteria…",
  "Scoring compliance across all categories…",
  "Applying weighted scoring model…",
  "Running gap analysis per supplier…",
  "Applying disqualification rules…",
  "Checking drawing/spec conformance…",
  "Ranking suppliers by weighted score…",
  "Generating recommendation summary…",
];

const DEFAULT_WEIGHTS: Record<string, number> = {
  Technical: 35,
  Quality: 25,
  "Delivery & Lead Time": 20,
  Commercial: 10,
  Support: 10,
};

type CellStatus = "pass" | "partial" | "fail" | "na";

interface DisqualRule { field: string; threshold: number; mandatory: boolean; }

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

// ── Component ─────────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const navigate = useNavigate();
  const { pushActivity } = useAgents();
  const printRef = useRef<HTMLDivElement>(null);

  // ── Stored result
  const [result, setResult] = useState<AnalysisResult | null>(() => analysisStore.getResult());

  // ── Project picker
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");

  // ── View tabs
  type Tab = "matrix" | "scores" | "gaps" | "disqual" | "weights" | "drawings";
  const [activeTab, setActiveTab] = useState<Tab>("matrix");

  // ── FM-6.2 Weighted scoring
  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS);
  const [weightsEdited, setWeightsEdited] = useState(false);

  // ── FM-6.6 Disqualification rules
  const [disqualRules, setDisqualRules] = useState<DisqualRule[]>([]);
  const [disqualThreshold, setDisqualThreshold] = useState(4.0);
  const [mandatoryCategories, setMandatoryCategories] = useState<string[]>([]);
  const [newRuleField, setNewRuleField] = useState("");
  const [newRuleThreshold, setNewRuleThreshold] = useState(4.0);
  const [newRuleMandatory, setNewRuleMandatory] = useState(false);

  // ── Drill-down state
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"rank" | "score">("rank");

  // ── Export
  const [exportingSupplier, setExportingSupplier] = useState<string | null>(null);

  // ── Load projects
  useEffect(() => {
    if (!result) {
      setLoadingProjects(true);
      api.listProjects()
        .then(res => setProjects((res.projects ?? []).map((p: any) => ({ id: p.id, name: p.name }))))
        .catch(() => setProjects([]))
        .finally(() => setLoadingProjects(false));
    }
  }, [result]);

  // ── Auto-derive weights from result categories
  useEffect(() => {
    if (!result || weightsEdited) return;
    const cats = Array.from(
      new Set(result.suppliers.flatMap(s => (s.category_scores ?? []).map(c => c.category)))
    );
    if (cats.length === 0) return;
    const share = Math.floor(100 / cats.length);
    const base = Object.fromEntries(cats.map(c => [c, share]));
    const rem = 100 - share * cats.length;
    if (cats[0]) base[cats[0]] += rem;
    setWeights(base);
  }, [result]);

  // ── Run analysis
  async function handleRunAnalysis() {
    if (!selectedProject) return;
    setRunning(true);
    setRunError("");
    const start = Date.now();
    pushActivity({ agentId: "analysis", status: "running", message: `Analysing project ${selectedProject}` });
    try {
      const res = await api.analyzeProject(selectedProject);
      analysisStore.setResult(res);
      setResult(res);
      pushActivity({
        agentId: "analysis",
        status: "complete",
        message: `Scored ${res.suppliers?.length ?? 0} suppliers`,
        durationMs: Date.now() - start,
        confidence: (res as any).confidence_score ?? 88,
      });
    } catch (err: any) {
      setRunError(err?.message ?? "Analysis failed. Please try again.");
      pushActivity({ agentId: "analysis", status: "error", message: "Analysis failed" });
    } finally {
      setRunning(false);
    }
  }

  // ── FM-6.5 PDF export via browser print
  function handleExportPDF(supplierName: string) {
    setExportingSupplier(supplierName);
    setTimeout(() => {
      window.print();
      setExportingSupplier(null);
    }, 300);
  }

  // ── Disqualification logic
  function isDisqualified(s: SupplierResult): { dq: boolean; reasons: string[] } {
    const reasons: string[] = [];
    // Overall threshold
    if (s.overall_score < disqualThreshold) {
      reasons.push(`Overall score ${s.overall_score.toFixed(1)} < threshold ${disqualThreshold}`);
    }
    // Category-level rules
    for (const rule of disqualRules) {
      const cat = (s.category_scores ?? []).find(c => c.category === rule.field);
      if (!cat) {
        if (rule.mandatory) reasons.push(`Missing mandatory category: ${rule.field}`);
        continue;
      }
      if (cat.weighted_score < rule.threshold) {
        reasons.push(`${rule.field} score ${cat.weighted_score.toFixed(1)} < ${rule.threshold}${rule.mandatory ? " (mandatory)" : ""}`);
      }
    }
    // Mandatory categories with zero score
    for (const mc of mandatoryCategories) {
      const cat = (s.category_scores ?? []).find(c => c.category === mc);
      if (!cat || cat.weighted_score < 1) {
        reasons.push(`Missing mandatory category: ${mc}`);
      }
    }
    return { dq: reasons.length > 0, reasons };
  }

  // ── Gap analysis derived from result
  function buildGaps(s: SupplierResult) {
    const weak: Array<{ q: string; score: number; category: string }> = [];
    for (const cat of s.category_scores ?? []) {
      for (const q of cat.questions ?? []) {
        if (q.score < 5) weak.push({ q: q.question_text, score: q.score, category: cat.category });
      }
    }
    return weak.sort((a, b) => a.score - b.score);
  }

  // ── Weighted score re-calculation using buyer weights
  function reweightedScore(s: SupplierResult): number {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    if (total === 0) return s.overall_score;
    let sum = 0;
    for (const cat of s.category_scores ?? []) {
      const w = weights[cat.category] ?? 0;
      sum += (cat.weighted_score / 10) * (w / total) * 10;
    }
    return sum;
  }

  // ── Empty state — project picker ──────────────────────────────────────────────
  if (!result) {
    return (
      <div className="max-w-xl mx-auto mt-16 space-y-6">
        <div className="text-center space-y-1">
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <FlaskConical className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold">Technical Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Select a project to run technical scoring, gap analysis, and supplier comparison.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4" /> Select Project
            </CardTitle>
            <CardDescription>
              The analysis will use the RFP and all supplier response files already uploaded to this project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingProjects ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading projects…
              </div>
            ) : projects.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No projects found.
                <Button variant="link" className="px-1" onClick={() => navigate("/projects")}>
                  Create one first.
                </Button>
              </div>
            ) : (
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={selectedProject}
                onChange={e => { setSelectedProject(e.target.value); setRunError(""); }}
              >
                <option value="" disabled>— Choose a project —</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            {runError && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {runError}
              </p>
            )}

            <AgentStreamingThought
              thoughts={ANALYSIS_THOUGHTS}
              isRunning={running}
              agentName="Technical Analysis"
            />

            <div className="flex gap-2">
              <Button
                className="flex-1 gap-2"
                disabled={!selectedProject || running || loadingProjects}
                onClick={handleRunAnalysis}
              >
                {running
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Running analysis…</>
                  : <><FlaskConical className="h-4 w-4" /> Run Technical Analysis</>}
              </Button>
              <Button variant="outline" onClick={() => navigate("/supplier-responses")}>
                Upload Responses
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Results view ──────────────────────────────────────────────────────────────
  const allCategories = Array.from(
    new Set(result.suppliers.flatMap(s => (s.category_scores ?? []).map(c => c.category)))
  );

  const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0);
  const weightsValid = Math.abs(weightTotal - 100) < 1;

  const suppliers = [...result.suppliers].map(s => ({
    ...s,
    _weighted: reweightedScore(s),
    _dq: isDisqualified(s),
  })).sort((a, b) => sortBy === "rank" ? a.rank - b.rank : b._weighted - a._weighted);

  const top = suppliers.find(s => !s._dq.dq) ?? suppliers[0];

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "matrix",   label: "Comparison Matrix",  icon: <ClipboardList className="h-3.5 w-3.5" /> },
    { id: "scores",   label: "Score Details",       icon: <TrendingUp className="h-3.5 w-3.5" /> },
    { id: "gaps",     label: "Gap Analysis",        icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    { id: "disqual",  label: "Disqualification",    icon: <ShieldAlert className="h-3.5 w-3.5" /> },
    { id: "weights",  label: "Scoring Weights",     icon: <SlidersHorizontal className="h-3.5 w-3.5" /> },
    { id: "drawings", label: "Drawing Conformance", icon: <Ruler className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6" ref={printRef}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold leading-tight">Technical Analysis</h1>
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{result.analysis_summary}</p>
          <ConfidenceBadge
            agentId="analysis"
            confidence={(result as any).confidence_score ?? 88}
            basis="Based on RFP completeness, supplier document coverage, and question match rate."
            className="mt-2"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline" size="sm" className="gap-1.5 text-xs"
            onClick={() => setSortBy(sortBy === "rank" ? "score" : "rank")}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            Sort: {sortBy === "rank" ? "Rank" : "Score"}
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1.5 text-xs"
            onClick={() => { analysisStore.clear?.(); setResult(null); setWeightsEdited(false); }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> New Analysis
          </Button>
        </div>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Suppliers Evaluated", value: suppliers.length, icon: <FlaskConical className="h-4 w-4 text-primary" /> },
          { label: "Disqualified",        value: suppliers.filter(s => s._dq.dq).length, icon: <Ban className="h-4 w-4 text-rose-500" /> },
          { label: "Top Score",           value: `${(top?._weighted ?? 0).toFixed(1)} / 10`, icon: <Trophy className="h-4 w-4 text-amber-500" /> },
          { label: "Criteria Scored",     value: (result.suppliers[0]?.category_scores ?? []).reduce((a, c) => a + (c.questions?.length ?? 0), 0), icon: <ClipboardList className="h-4 w-4 text-indigo-500" /> },
        ].map(k => (
          <Card key={k.label} className="py-0">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">{k.icon}</div>
              <div>
                <p className="text-[11px] text-muted-foreground leading-none">{k.label}</p>
                <p className="text-lg font-bold leading-tight mt-0.5 tabular-nums">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recommendation banner */}
      {top && (
        <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center shrink-0">
              <Trophy className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide">Recommended Supplier</p>
              <p className="text-lg font-bold mt-0.5">{top.supplier_name}</p>
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{top.recommendation_summary ?? top.recommendation}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-3xl font-bold text-emerald-600">{(top._weighted).toFixed(1)}</p>
              <p className="text-[11px] text-muted-foreground">Weighted score</p>
              <Button size="sm" variant="outline" className="mt-2 gap-1 text-xs" onClick={() => handleExportPDF(top.supplier_name)}>
                {exportingSupplier === top.supplier_name ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
                Export PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 flex-wrap border-b pb-0">
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
      </div>

      {/* ── FM-6.1 Comparison Matrix tab ───────────────────────────────────────── */}
      {activeTab === "matrix" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Side-by-Side Technical Comparison</CardTitle>
            <CardDescription className="text-xs">
              All suppliers as columns · All requirements as rows · Pass / Partial / Fail per cell
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="sticky left-0 bg-muted/60 text-left px-4 py-3 font-semibold min-w-[220px] border-b border-r">Requirement</th>
                    <th className="text-center px-3 py-3 font-semibold border-b text-muted-foreground min-w-[80px]">Category</th>
                    {result.suppliers.map(s => {
                      const dq = isDisqualified(s);
                      return (
                        <th key={s.supplier_id} className="text-center px-4 py-3 font-semibold border-b min-w-[140px]">
                          <div className="flex flex-col items-center gap-1">
                            <span className={dq.dq ? "line-through text-muted-foreground" : ""}>{s.supplier_name}</span>
                            {dq.dq && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-600 font-normal">
                                <Ban className="h-3 w-3" /> DQ
                              </span>
                            )}
                            <span className={`text-[11px] font-bold ${scoreColor(reweightedScore(s))}`}>
                              {reweightedScore(s).toFixed(1)}/10
                            </span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {allCategories.flatMap(cat => {
                    const allQs = result.suppliers[0]?.category_scores
                      ?.find(c => c.category === cat)?.questions ?? [];
                    return [
                      // Category header row
                      <tr key={`cat-${cat}`} className="bg-muted/30">
                        <td colSpan={result.suppliers.length + 2} className="sticky left-0 px-4 py-2 font-semibold text-muted-foreground border-b border-r text-[11px] uppercase tracking-wide bg-muted/30">
                          {cat}
                        </td>
                      </tr>,
                      // Question rows
                      ...allQs.map(q => (
                        <tr key={q.question_id} className="border-b hover:bg-muted/10 transition-colors">
                          <td className="sticky left-0 bg-background px-4 py-2.5 border-r max-w-[220px]">
                            <p className="line-clamp-2 text-[12px] font-medium">{q.question_text}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">Weight: {q.weight}%</span>
                              <span className={`text-[10px] px-1 py-0 rounded ${
                                q.question_type === "quantitative"
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-purple-50 text-purple-600"
                              }`}>{q.question_type}</span>
                            </div>
                          </td>
                          <td className="text-center px-3 py-2.5 text-[10px] text-muted-foreground border-r">{cat}</td>
                          {result.suppliers.map(s => {
                            const sq = s.category_scores
                              ?.find(c => c.category === cat)
                              ?.questions?.find(qq => qq.question_id === q.question_id);
                            const score = sq?.score ?? 0;
                            return (
                              <td key={s.supplier_id} className="text-center px-3 py-2.5">
                                <div className="flex flex-col items-center gap-1">
                                  <StatusBadge score={score} />
                                  <span className={`text-[11px] font-bold ${scoreColor(score)}`}>{score.toFixed(1)}</span>
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
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td className="sticky left-0 bg-muted/20 px-4 py-3 border-r text-sm">Overall Weighted Score</td>
                    <td className="border-r" />
                    {result.suppliers.map(s => (
                      <td key={s.supplier_id} className="text-center px-4 py-3">
                        <span className={`text-base font-bold ${scoreColor(reweightedScore(s))}`}>
                          {reweightedScore(s).toFixed(1)}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Score Details tab ─────────────────────────────────────────────────── */}
      {activeTab === "scores" && (
        <div className="space-y-3">
          {suppliers.map(s => {
            const isExpanded = expandedSupplier === s.supplier_id;
            return (
              <Card key={s.supplier_id} className={s._dq.dq ? "opacity-60 border-rose-200" : ""}>
                <button
                  className="w-full text-left"
                  onClick={() => setExpandedSupplier(isExpanded ? null : s.supplier_id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          s._dq.dq ? "bg-rose-100 text-rose-600" : "bg-primary/10 text-primary"
                        }`}>
                          #{s.rank}
                        </div>
                        <div>
                          <CardTitle className="text-sm">{s.supplier_name}</CardTitle>
                          {s._dq.dq && (
                            <p className="text-[11px] text-rose-600 flex items-center gap-1 mt-0.5">
                              <Ban className="h-3 w-3" /> Disqualified
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className={`text-xl font-bold ${scoreColor(s._weighted)}`}>{s._weighted.toFixed(1)}</p>
                          <p className="text-[10px] text-muted-foreground">/ 10</p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm" variant="outline"
                            className="text-xs h-7 gap-1"
                            onClick={e => { e.stopPropagation(); handleExportPDF(s.supplier_name); }}
                          >
                            {exportingSupplier === s.supplier_name
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <FileDown className="h-3 w-3" />}
                            PDF
                          </Button>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
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

                {isExpanded && (
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

                    {/* Question-level accordion */}
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
                              <span className={`text-sm font-bold ${scoreColor(cat.weighted_score)}`}>
                                {cat.weighted_score.toFixed(1)}/10
                              </span>
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
                                          q.question_type === "quantitative"
                                            ? "bg-blue-50 text-blue-700"
                                            : "bg-purple-50 text-purple-700"
                                        }`}>{q.question_type}</span>
                                        <span className="text-[10px] text-muted-foreground">wt: {q.weight}%</span>
                                        {(q as any).flagged && (
                                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                                            <AlertTriangle className="h-3 w-3" /> Flagged
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs font-medium">{q.question_text}</p>
                                    </div>
                                    <span className={`text-sm font-bold shrink-0 ${scoreColor(q.score)}`}>
                                      {q.score.toFixed(1)}/10
                                    </span>
                                  </div>
                                  <div className="rounded bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                                    <span className="font-semibold text-foreground">Answer: </span>
                                    {(q as any).supplier_answer ?? "—"}
                                  </div>
                                  <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                                    {(q as any).rationale}
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

      {/* ── FM-6.3 Gap Analysis tab ────────────────────────────────────────────── */}
      {activeTab === "gaps" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Questions where the supplier scored below <strong>5.0</strong>, grouped by supplier. These represent gaps vs. RFP requirements.
          </p>
          {suppliers.map(s => {
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
                      <span className="text-xs text-muted-foreground">
                        {gaps.length === 0 ? "No gaps" : `${gaps.length} gap${gaps.length !== 1 ? "s" : ""}`}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {gaps.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="space-y-1.5">
                      {gaps.map((g, i) => (
                        <div key={i} className="flex items-start gap-3 rounded-md bg-muted/30 px-3 py-2">
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
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── FM-6.6 Disqualification tab ────────────────────────────────────────── */}
      {activeTab === "disqual" && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-rose-500" /> Disqualification Rules
              </CardTitle>
              <CardDescription className="text-xs">
                Suppliers below the overall threshold or failing a mandatory category rule will be flagged as disqualified.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Overall threshold */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">Overall Score Threshold (auto-DQ if below)</span>
                  <span className="tabular-nums text-muted-foreground">{disqualThreshold.toFixed(1)} / 10</span>
                </div>
                <Slider
                  value={[disqualThreshold]}
                  min={0} max={10} step={0.5}
                  onValueChange={([v]) => setDisqualThreshold(v)}
                />
              </div>

              {/* Category rules */}
              <div>
                <p className="text-xs font-semibold mb-2">Category-Level Rules</p>
                <div className="space-y-1.5 mb-3">
                  {disqualRules.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded border text-xs bg-rose-50 border-rose-200 dark:bg-rose-950/20">
                      {rule.mandatory ? <Ban className="h-3 w-3 text-rose-500" /> : <AlertTriangle className="h-3 w-3 text-amber-500" />}
                      <span className="flex-1">
                        {rule.field} &lt; <strong>{rule.threshold}</strong>
                        {rule.mandatory && <span className="ml-1 text-[10px] text-rose-600">(mandatory)</span>}
                      </span>
                      <button
                        className="text-rose-500 hover:opacity-70 text-[11px]"
                        onClick={() => setDisqualRules(prev => prev.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {disqualRules.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No category rules defined. Add one below.</p>
                  )}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <select
                    className="flex-1 border rounded px-2 py-1.5 text-xs bg-background min-w-[140px]"
                    value={newRuleField}
                    onChange={e => setNewRuleField(e.target.value)}
                  >
                    <option value="">— Select category —</option>
                    {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground">Threshold:</span>
                    <input
                      type="number" min={0} max={10} step={0.5}
                      className="w-14 border rounded px-2 py-1.5 text-xs"
                      value={newRuleThreshold}
                      onChange={e => setNewRuleThreshold(Number(e.target.value))}
                    />
                  </div>
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="checkbox" checked={newRuleMandatory}
                      onChange={e => setNewRuleMandatory(e.target.checked)}
                      className="rounded"
                    />
                    Mandatory
                  </label>
                  <Button
                    size="sm" variant="outline" className="text-xs h-7"
                    disabled={!newRuleField}
                    onClick={() => {
                      if (!newRuleField) return;
                      setDisqualRules(p => [...p, { field: newRuleField, threshold: newRuleThreshold, mandatory: newRuleMandatory }]);
                      setNewRuleField("");
                    }}
                  >
                    Add Rule
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Evaluation Results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {suppliers.map(s => (
                <div key={s.supplier_id} className={`flex items-start gap-3 rounded-lg p-3 border ${
                  s._dq.dq ? "bg-rose-50 border-rose-200 dark:bg-rose-950/20" : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20"
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
                      : <p className="text-xs text-emerald-600 mt-0.5">Meets all disqualification thresholds</p>}
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${scoreColor(s._weighted)}`}>{s._weighted.toFixed(1)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── FM-6.2 Weights tab ─────────────────────────────────────────────────── */}
      {activeTab === "weights" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Weighted Scoring Configurator
            </CardTitle>
            <CardDescription className="text-xs">
              Adjust the importance of each evaluation category. Scores will recalculate instantly. Total must equal 100%.
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
                    value={[weights[cat] ?? 0]}
                    min={0} max={100} step={5}
                    onValueChange={([v]) => {
                      setWeights(prev => ({ ...prev, [cat]: v }));
                      setWeightsEdited(true);
                    }}
                  />
                </div>
              ))}
            </div>

            <div className={`flex items-center justify-between p-3 rounded-lg border text-sm ${
              weightsValid ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20" : "border-rose-200 bg-rose-50 dark:bg-rose-950/20"
            }`}>
              <span className="font-medium">Total</span>
              <span className={`font-bold tabular-nums ${weightsValid ? "text-emerald-600" : "text-rose-600"}`}>
                {weightTotal}%
                {!weightsValid && " — must equal 100%"}
              </span>
            </div>

            <div className="pt-1">
              <p className="text-xs font-semibold mb-3">Re-scored Rankings</p>
              <div className="space-y-2">
                {[...suppliers].sort((a, b) => b._weighted - a._weighted).map((s, i) => (
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

      {/* ── FM-6.4 Drawing Conformance tab ─────────────────────────────────────── */}
      {activeTab === "drawings" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Ruler className="h-4 w-4" /> Drawing / Spec Conformance
            </CardTitle>
            <CardDescription className="text-xs">
              If technical drawings were uploaded to this project, the agent checks each supplier's stated specs against drawing dimensions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Derive drawing checks from quantitative questions with numeric answers */}
            {(() => {
              const drawingChecks: Array<{
                spec: string;
                category: string;
                suppliers: Record<string, { answer: string; status: "match" | "mismatch" | "unverified" }>;
              }> = [];

              const qGroups = new Map<string, typeof drawingChecks[0]>();
              for (const s of result.suppliers) {
                for (const cat of s.category_scores ?? []) {
                  for (const q of cat.questions ?? []) {
                    if (q.question_type !== "quantitative") continue;
                    if (!qGroups.has(q.question_id)) {
                      qGroups.set(q.question_id, { spec: q.question_text, category: cat.category, suppliers: {} });
                    }
                    const ans = (q as any).supplier_answer ?? "";
                    const score = q.score;
                    qGroups.get(q.question_id)!.suppliers[s.supplier_name] = {
                      answer: ans,
                      status: !ans || ans === "—" ? "unverified" : score >= 7.5 ? "match" : score >= 5 ? "unverified" : "mismatch",
                    };
                  }
                }
              }
              drawingChecks.push(...qGroups.values());

              if (drawingChecks.length === 0) {
                return (
                  <div className="text-center py-12 space-y-2">
                    <Ruler className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      No quantitative spec questions found in this analysis.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Upload technical drawings and ensure the RFP includes quantitative requirements to enable conformance checking.
                    </p>
                  </div>
                );
              }

              const statusStyle = (st: "match" | "mismatch" | "unverified") =>
                st === "match"      ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                : st === "mismatch" ? "text-rose-600 bg-rose-50 border-rose-200"
                : "text-amber-600 bg-amber-50 border-amber-200";

              const statusIcon = (st: "match" | "mismatch" | "unverified") =>
                st === "match"      ? <CheckCircle2 className="h-3.5 w-3.5" />
                : st === "mismatch" ? <XCircle className="h-3.5 w-3.5" />
                : <Minus className="h-3.5 w-3.5" />;

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-3 py-2.5 font-semibold border-b min-w-[200px]">Spec / Requirement</th>
                        <th className="text-left px-3 py-2.5 font-semibold border-b text-muted-foreground">Category</th>
                        {result.suppliers.map(s => (
                          <th key={s.supplier_id} className="text-center px-3 py-2.5 font-semibold border-b min-w-[130px]">{s.supplier_name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {drawingChecks.map((check, i) => (
                        <tr key={i} className="border-b hover:bg-muted/10">
                          <td className="px-3 py-2.5 font-medium line-clamp-2 max-w-[200px]">{check.spec}</td>
                          <td className="px-3 py-2.5 text-muted-foreground">{check.category}</td>
                          {result.suppliers.map(s => {
                            const entry = check.suppliers[s.supplier_name];
                            if (!entry) return <td key={s.supplier_id} className="px-3 py-2.5 text-center text-muted-foreground">—</td>;
                            return (
                              <td key={s.supplier_id} className="px-3 py-2.5">
                                <div className="flex flex-col items-center gap-1">
                                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium capitalize ${statusStyle(entry.status)}`}>
                                    {statusIcon(entry.status)}{entry.status}
                                  </span>
                                  {entry.answer && (
                                    <span className="text-[10px] text-muted-foreground line-clamp-2 text-center max-w-[120px]">{entry.answer}</span>
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
          </CardContent>
        </Card>
      )}

      {/* Final recommendation */}
      {result.top_recommendation && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1.5">Final Recommendation</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{result.top_recommendation}</p>
          </CardContent>
        </Card>
      )}

      {/* Print stylesheet for FM-6.5 PDF export */}
      <style>{`
        @media print {
          nav, aside, [data-sidebar], .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .print\\:break-before { page-break-before: always; }
        }
      `}</style>
    </div>
  );
}
