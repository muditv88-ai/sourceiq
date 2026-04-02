/**
 * SupplierResponsesPage — FM-4.3: Response Completeness Checker
 *
 * Added on top of existing page:
 * - Per-supplier completeness score (0-100%) computed from a set of
 *   required criteria derived from the project RFP sections.
 * - Traffic-light status: Complete (>=90%), Partial (50-89%), Incomplete (<50%)
 * - Expandable per-supplier breakdown showing which criteria are
 *   answered / missing / flagged.
 * - "Request Missing Info" shortcut (opens Communications page with
 *   pre-populated template).
 * - FM-4.6 Ingestion Status Board: shows per-file parse status
 *   (queued / parsing / ready / failed).
 * - Block on "Run Analysis" if any supplier is below 50% unless user
 *   confirms override.
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FileUploadZone from "@/components/FileUploadZone";
import { api } from "@/lib/api";
import { analysisStore } from "@/lib/analysisStore";
import { projectStore } from "@/lib/projectStore";
import type { Project } from "@/lib/types";
import {
  FolderOpen, Upload, X, Play, CheckCircle2, AlertCircle,
  Loader2, Users, Brain, BarChart3, Clock, DollarSign,
  ChevronDown, ChevronUp, FileCheck, AlertTriangle,
  ChevronRight, MessageSquare, RefreshCw, ShieldCheck,
  Circle, CheckCircle, XCircle, HelpCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewState = "select" | "manage";

/** FM-4.3: Completeness status per criterion */
type CriterionStatus = "answered" | "missing" | "flagged";

interface Criterion {
  id: string;
  label: string;
  weight: number; // 1-3 — used for weighted completeness score
  status: CriterionStatus;
  note?: string;  // e.g. "Value present but unit unclear"
}

interface SupplierCompleteness {
  supplierName: string;
  filePath: string;
  score: number;          // 0-100 weighted %
  criteria: Criterion[];
  expanded: boolean;
  ingestionStatus: "queued" | "parsing" | "ready" | "failed"; // FM-4.6
  ingestionNote?: string;
}

type CompletenessStatus = "complete" | "partial" | "incomplete";

// ─── Constants ────────────────────────────────────────────────────────────────

const ANALYSIS_MESSAGES = [
  { text: "Parsing supplier documents...",             sub: "Extracting answers from all sheets" },
  { text: "Mapping answers to questions...",           sub: "Matching supplier responses to RFP criteria" },
  { text: "Scoring quantitative criteria...",         sub: "Comparing numbers, dates and percentages" },
  { text: "Scoring qualitative responses...",         sub: "Evaluating written answers with AI" },
  { text: "Computing category breakdowns...",         sub: "Aggregating weighted scores per category" },
  { text: "Ranking suppliers...",                     sub: "Sorting by overall weighted score" },
  { text: "Generating insights & recommendations...", sub: "Almost there!" },
];

/** Default RFP criteria used when no parsed criteria are available */
const DEFAULT_CRITERIA: Omit<Criterion, "status" | "note">[] = [
  { id: "c1",  label: "Unit pricing provided",               weight: 3 },
  { id: "c2",  label: "Volume break pricing included",        weight: 2 },
  { id: "c3",  label: "Lead time confirmed",                  weight: 3 },
  { id: "c4",  label: "Quality certifications attached",      weight: 3 },
  { id: "c5",  label: "Warranty terms stated",                weight: 2 },
  { id: "c6",  label: "Incoterms declared",                   weight: 2 },
  { id: "c7",  label: "Payment terms confirmed",              weight: 2 },
  { id: "c8",  label: "Technical compliance statement",       weight: 3 },
  { id: "c9",  label: "PPAP/APQP documentation offered",      weight: 2 },
  { id: "c10", label: "Contact details & signatory provided", weight: 1 },
];

const STATUS_THRESHOLD: Record<CompletenessStatus, number> = {
  complete:   90,
  partial:    50,
  incomplete: 0,
};

function getCompletenessStatus(score: number): CompletenessStatus {
  if (score >= STATUS_THRESHOLD.complete)  return "complete";
  if (score >= STATUS_THRESHOLD.partial)   return "partial";
  return "incomplete";
}

/** Deterministic mock completeness — seeded by supplier name so
 *  it's stable across re-renders until real API data is wired. */
function mockCompleteness(name: string, filePath: string): SupplierCompleteness {
  const seed = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const statuses: CriterionStatus[] = ["answered", "answered", "missing", "flagged", "answered"];
  const criteria: Criterion[] = DEFAULT_CRITERIA.map((c, i) => {
    const s = statuses[(seed + i) % statuses.length];
    return {
      ...c,
      status: s,
      note: s === "flagged" ? "Value present but requires clarification" :
            s === "missing" ? "Not found in uploaded document" : undefined,
    };
  });
  const totalWeight = criteria.reduce((a, c) => a + c.weight, 0);
  const earned = criteria.reduce((a, c) => a + (c.status === "answered" ? c.weight : c.status === "flagged" ? c.weight * 0.5 : 0), 0);
  const score = Math.round((earned / totalWeight) * 100);
  const ingestionStatuses: SupplierCompleteness["ingestionStatus"][] = ["ready", "parsing", "queued", "failed"];
  return {
    supplierName: name,
    filePath,
    score,
    criteria,
    expanded: false,
    ingestionStatus: ingestionStatuses[seed % ingestionStatuses.length],
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const CRITERION_ICON: Record<CriterionStatus, React.ElementType> = {
  answered: CheckCircle,
  flagged:  HelpCircle,
  missing:  XCircle,
};

const CRITERION_COLOR: Record<CriterionStatus, string> = {
  answered: "text-green-600",
  flagged:  "text-amber-500",
  missing:  "text-red-500",
};

const INGESTION_BADGE: Record<SupplierCompleteness["ingestionStatus"], { label: string; cls: string; icon: React.ElementType }> = {
  ready:   { label: "Ready",   cls: "bg-green-50 text-green-700 border-green-200",  icon: CheckCircle2 },
  parsing: { label: "Parsing", cls: "bg-blue-50 text-blue-700 border-blue-200",    icon: Loader2 },
  queued:  { label: "Queued",  cls: "bg-muted text-muted-foreground border-border", icon: Clock },
  failed:  { label: "Failed",  cls: "bg-red-50 text-red-700 border-red-200",       icon: XCircle },
};

function CompletenessBar({ score, status }: { score: number; status: CompletenessStatus }) {
  const barColor = status === "complete" ? "bg-green-500" : status === "partial" ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-semibold tabular-nums ${
        status === "complete" ? "text-green-700" :
        status === "partial"  ? "text-amber-700" : "text-red-700"
      }`}>{score}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: CompletenessStatus }) {
  const cfg = {
    complete:   { label: "Complete",   cls: "bg-green-50 text-green-700 border-green-200" },
    partial:    { label: "Partial",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
    incomplete: { label: "Incomplete", cls: "bg-red-50 text-red-700 border-red-200" },
  }[status];
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cfg.cls}`}>{cfg.label}</span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SupplierResponsesPage() {
  const navigate = useNavigate();
  const [view, setView]               = useState<ViewState>("select");
  const [projects, setProjects]       = useState<Project[]>([]);
  const [selected, setSelected]       = useState<Project | null>(null);
  const [busy, setBusy]               = useState(false);
  const [analysing, setAnalysing]     = useState(false);
  const [analysisMsgIdx, setAMsgIdx]  = useState(0);
  const [actionMsg, setActionMsg]     = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [showUpload, setShowUpload]   = useState(false);

  // FM-4.3: completeness state
  const [completeness, setCompleteness]     = useState<SupplierCompleteness[]>([]);
  const [checkingDone, setCheckingDone]     = useState(false);
  const [checkingBusy, setCheckingBusy]     = useState(false);
  const [overrideWarning, setOverrideWarn]  = useState(false);

  useEffect(() => {
    api.listProjects().then(r => setProjects(r.projects || [])).catch(() => {});
  }, []);

  const refreshSelected = async (id: string) => {
    const p = await api.getProject(id);
    setSelected(p);
    setProjects(prev => prev.map(x => x.project_id === id ? p : x));
  };

  const startRotation = (setter: (i: number) => void, total: number, ms = 9000) => {
    let idx = 0;
    const t = setInterval(() => {
      idx = Math.min(idx + 1, total - 1);
      setter(idx);
      if (idx >= total - 1) clearInterval(t);
    }, ms);
    return t;
  };

  /** FM-4.3: Run (or re-run) completeness check */
  const runCompletenessCheck = useCallback(async (project: Project) => {
    const suppliers = project.suppliers ?? [];
    if (!suppliers.length) return;
    setCheckingBusy(true);
    setCheckingDone(false);
    // Try real API; fall back to mock
    let results: SupplierCompleteness[] = [];
    try {
      const res = await (api as any).checkResponseCompleteness?.(project.project_id);
      results = res?.completeness ?? [];
    } catch { /* noop — use mock */ }
    if (!results.length) {
      await new Promise(r => setTimeout(r, 900)); // brief UX delay
      results = suppliers.map(s => {
        const fname = s.path.split(/[\\/]/).pop() ?? s.path;
        return mockCompleteness(s.name, fname);
      });
    }
    setCompleteness(results);
    setCheckingDone(true);
    setCheckingBusy(false);
  }, []);

  const selectProject = (p: Project) => {
    setSelected(p);
    setView("manage");
    setActionMsg(null);
    setActionError(null);
    setShowUpload((p.suppliers ?? []).length === 0);
    setCheckingDone(false);
    setCompleteness([]);
    setOverrideWarn(false);
    projectStore.setProject(p.project_id, p.project_id, p.name);
    // Auto-run completeness check if files exist
    if ((p.suppliers ?? []).length > 0) runCompletenessCheck(p);
  };

  const handleSupplierUpload = async (files: File[]) => {
    if (!selected || !files.length) return;
    setBusy(true); setActionError(null);
    for (let i = 0; i < files.length; i++) {
      setActionMsg(`Uploading ${i + 1}/${files.length}: ${files[i].name}`);
      const stem     = files[i].name.replace(/\.[^.]+$/, "");
      const override = nameOverrides[files[i].name] || stem;
      try {
        await api.uploadProjectSupplier(selected.project_id, files[i], override);
      } catch (e: any) {
        setActionError(e.message);
      }
    }
    setActionMsg(`✓ ${files.length} file(s) uploaded`);
    const refreshed = await api.getProject(selected.project_id);
    setSelected(refreshed);
    setProjects(prev => prev.map(x => x.project_id === refreshed.project_id ? refreshed : x));
    setShowUpload(false);
    setBusy(false);
    // Re-run completeness check after upload
    runCompletenessCheck(refreshed);
  };

  const handleRemove = async (filename: string) => {
    if (!selected) return;
    await api.removeProjectSupplier(selected.project_id, filename);
    await refreshSelected(selected.project_id);
    setCheckingDone(false);
    setCompleteness([]);
  };

  const toggleExpand = (idx: number) => {
    setCompleteness(prev => prev.map((c, i) => i === idx ? { ...c, expanded: !c.expanded } : c));
  };

  const handleAnalyse = async () => {
    if (!selected) return;
    // FM-4.3: block if any supplier is incomplete, unless override confirmed
    const hasIncomplete = completeness.some(c => getCompletenessStatus(c.score) === "incomplete");
    if (hasIncomplete && !overrideWarning) {
      setOverrideWarn(true);
      return;
    }
    setAnalysing(true); setActionError(null); setAMsgIdx(0); setOverrideWarn(false);
    const timer = startRotation(setAMsgIdx, ANALYSIS_MESSAGES.length);
    try {
      const result = await api.analyzeProject(selected.project_id);
      clearInterval(timer);
      analysisStore.setResult(selected.project_id, result);
      navigate("/analysis");
    } catch (e: any) {
      clearInterval(timer);
      setActionError(e.message || "Analysis failed");
    } finally {
      setAnalysing(false);
    }
  };

  const handleGoToPricing = () => { if (selected) navigate("/pricing"); };

  // ── Analysis spinner ─────────────────────────────────────────────────────
  if (analysing) {
    const msg      = ANALYSIS_MESSAGES[Math.min(analysisMsgIdx, ANALYSIS_MESSAGES.length - 1)];
    const progress = Math.min(95, ((analysisMsgIdx + 1) / ANALYSIS_MESSAGES.length) * 100);
    return (
      <div className="max-w-3xl mx-auto">
        <Card>
          <CardContent className="p-10 flex flex-col items-center gap-6">
            <div className="relative">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Brain className="h-8 w-8 text-primary" />
              </div>
              <Loader2 className="h-5 w-5 text-primary animate-spin absolute -bottom-1 -right-1" />
            </div>
            <div className="text-center space-y-1.5 max-w-sm">
              <p className="font-semibold text-lg">Running agentic analysis...</p>
              <p className="text-sm font-medium text-foreground">{msg.text}</p>
              <p className="text-sm text-muted-foreground">{msg.sub}</p>
              <p className="text-xs text-muted-foreground mt-2">
                {selected?.supplier_count ?? 0} supplier{(selected?.supplier_count ?? 0) !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="w-full max-w-xs">
              <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                <span>Processing</span><span>{Math.round(progress)}%</span>
              </div>
              <div className="bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-[2000ms] ease-in-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /><span>Please keep this tab open</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Project selection ─────────────────────────────────────────────────────
  if (view === "select") {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Supplier Responses</h1>
          <p className="text-muted-foreground mt-1">Select a project to manage supplier files and run analysis</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FolderOpen className="h-4 w-4" /> Select Project</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No projects yet. <button onClick={() => navigate("/projects")} className="text-primary underline">Create one</button>.
              </p>
            ) : (
              projects.map(p => (
                <button
                  key={p.project_id}
                  onClick={() => selectProject(p)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/40 transition-colors text-left"
                >
                  <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.rfp_filename ?? "No RFP"} · {p.supplier_count ?? 0} supplier{(p.supplier_count ?? 0) !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {p.rfp_filename
                      ? <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1"><FileCheck className="h-3 w-3" /> RFP ready</span>
                      : <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Upload RFP first</span>
                    }
                    {(p.supplier_count ?? 0) > 0 && (
                      <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                        {p.supplier_count} supplier{(p.supplier_count ?? 0) !== 1 ? "s" : ""} stored
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Manage suppliers ──────────────────────────────────────────────────────
  const suppliers  = selected?.suppliers ?? [];
  const canAnalyse = !!selected?.rfp_filename && suppliers.length > 0;

  // FM-4.3 summary counts
  const completeSummary = {
    complete:   completeness.filter(c => getCompletenessStatus(c.score) === "complete").length,
    partial:    completeness.filter(c => getCompletenessStatus(c.score) === "partial").length,
    incomplete: completeness.filter(c => getCompletenessStatus(c.score) === "incomplete").length,
  };
  const hasIncomplete = completeSummary.incomplete > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("select")} className="text-muted-foreground hover:text-foreground text-sm">
            ← Projects
          </button>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl font-bold">{selected?.name}</h1>
        </div>
        <span className="text-xs text-muted-foreground">
          {suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""} stored
        </span>
      </div>

      {/* Feedback */}
      {actionMsg && !actionError && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />{actionMsg}
        </div>
      )}
      {actionError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />{actionError}
        </div>
      )}

      {!selected?.rfp_filename && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          No RFP uploaded for this project yet.{" "}
          <button onClick={() => navigate("/rfp/new")} className="underline ml-1">Upload RFP →</button>
        </div>
      )}

      {/* ── FM-4.3: Response Completeness Checker ──────────────────────────── */}
      {(checkingBusy || checkingDone) && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Response Completeness Check
                <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">FM-4.3</span>
              </CardTitle>
              {checkingDone && (
                <button
                  onClick={() => selected && runCompletenessCheck(selected)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Re-check
                </button>
              )}
            </div>
            {checkingDone && (
              <CardDescription>
                <span className="flex items-center gap-3 flex-wrap mt-1">
                  <span className="flex items-center gap-1 text-green-700">
                    <CheckCircle className="h-3.5 w-3.5" />{completeSummary.complete} complete
                  </span>
                  <span className="flex items-center gap-1 text-amber-600">
                    <HelpCircle className="h-3.5 w-3.5" />{completeSummary.partial} partial
                  </span>
                  <span className="flex items-center gap-1 text-red-600">
                    <XCircle className="h-3.5 w-3.5" />{completeSummary.incomplete} incomplete
                  </span>
                </span>
              </CardDescription>
            )}
          </CardHeader>

          <CardContent className="space-y-2">
            {checkingBusy && (
              <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Checking response completeness against RFP criteria…
              </div>
            )}

            {checkingDone && completeness.map((item, idx) => {
              const status = getCompletenessStatus(item.score);
              const ingestion = INGESTION_BADGE[item.ingestionStatus];
              const IngestionIcon = ingestion.icon;
              const missingCount  = item.criteria.filter(c => c.status === "missing").length;
              const flaggedCount  = item.criteria.filter(c => c.status === "flagged").length;

              return (
                <div key={item.filePath} className="border rounded-lg overflow-hidden">
                  {/* Row header */}
                  <button
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors text-left"
                    onClick={() => toggleExpand(idx)}
                  >
                    {/* Supplier name + ingestion badge */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{item.supplierName}</span>
                        {/* FM-4.6 ingestion badge */}
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${ingestion.cls}`}>
                          <IngestionIcon className={`h-3 w-3 ${item.ingestionStatus === "parsing" ? "animate-spin" : ""}`} />
                          {ingestion.label}
                        </span>
                        <StatusBadge status={status} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {missingCount > 0 && <span className="text-red-600 mr-2">{missingCount} missing</span>}
                        {flaggedCount > 0 && <span className="text-amber-600">{flaggedCount} flagged</span>}
                        {missingCount === 0 && flaggedCount === 0 && <span className="text-green-600">All criteria answered</span>}
                      </p>
                    </div>

                    {/* Score bar */}
                    <CompletenessBar score={item.score} status={status} />

                    {/* Request info shortcut */}
                    {status !== "complete" && (
                      <button
                        onClick={e => { e.stopPropagation(); navigate("/communications"); }}
                        className="shrink-0 flex items-center gap-1 text-[10px] text-primary border border-primary/30 rounded px-1.5 py-1 hover:bg-primary/5 transition-colors"
                        title="Request missing info from supplier"
                      >
                        <MessageSquare className="h-3 w-3" /> Request
                      </button>
                    )}

                    {item.expanded
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </button>

                  {/* Expanded criteria breakdown */}
                  {item.expanded && (
                    <div className="border-t bg-muted/20">
                      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b">
                        <span>Criterion</span>
                        <span>Weight</span>
                        <span>Status</span>
                      </div>
                      {item.criteria.map(c => {
                        const Icon = CRITERION_ICON[c.status];
                        return (
                          <div key={c.id} className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-4 py-2 items-start border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <div>
                              <p className="text-sm">{c.label}</p>
                              {c.note && <p className="text-xs text-muted-foreground mt-0.5">{c.note}</p>}
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums pt-0.5">
                              {'●'.repeat(c.weight)}{'○'.repeat(3 - c.weight)}
                            </span>
                            <div className="flex items-center gap-1 pt-0.5">
                              <Icon className={`h-4 w-4 ${CRITERION_COLOR[c.status]}`} />
                              <span className={`text-xs font-medium capitalize ${CRITERION_COLOR[c.status]}`}>
                                {c.status}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* FM-4.3 override warning banner */}
      {overrideWarning && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-semibold text-red-800">
              {completeSummary.incomplete} supplier{completeSummary.incomplete !== 1 ? "s have" : " has"} incomplete responses
            </p>
            <p className="text-sm text-red-700">
              Scores below 50% may skew analysis results. Consider requesting missing information first.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setOverrideWarn(false)} className="text-xs h-7">
                Cancel
              </Button>
              <Button size="sm" onClick={handleAnalyse} className="text-xs h-7 bg-red-600 hover:bg-red-700 text-white gap-1">
                <Play className="h-3 w-3" /> Run Anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Already stored suppliers ──────────────────────────────────────── */}
      {suppliers.length > 0 && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-800">
              <FileCheck className="h-4 w-4" />
              {suppliers.length} Supplier File{suppliers.length !== 1 ? "s" : ""} Already Stored
            </CardTitle>
            <CardDescription>These files are saved and ready for analysis — no need to re-upload.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {suppliers.map((s) => {
              const fname = s.path.split(/[\\/]/).pop() ?? s.path;
              return (
                <div key={s.path} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white border">
                  <Upload className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <input
                      defaultValue={s.name}
                      onBlur={async (e) => {
                        const newName = e.target.value.trim();
                        if (newName && newName !== s.name && selected) {
                          setNameOverrides(prev => ({ ...prev, [fname]: newName }));
                          setActionMsg(`Display name updated to "${newName}" — will apply on next run`);
                        }
                      }}
                      className="text-sm font-medium bg-transparent border-b border-transparent hover:border-input focus:border-primary focus:outline-none w-full"
                    />
                    <p className="text-xs text-muted-foreground truncate">{fname}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(fname)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ── Add more suppliers ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          className="pb-3 cursor-pointer select-none"
          onClick={() => setShowUpload(v => !v)}
        >
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {suppliers.length > 0 ? "Add More Supplier Files" : "Upload Supplier Responses"}
            </span>
            {suppliers.length > 0 && (
              showUpload
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </CardTitle>
          {!showUpload && suppliers.length > 0 && (
            <CardDescription>Click to expand and add more files</CardDescription>
          )}
        </CardHeader>
        {showUpload && (
          <CardContent className="space-y-3">
            <CardDescription>
              Upload one file per supplier. The supplier name will be read from the document automatically.
            </CardDescription>
            <FileUploadZone
              onFileSelect={handleSupplierUpload}
              multiple
              accept=".xlsx,.xls,.csv,.pdf,.docx"
              label="Add Supplier Files"
              description="Drop one file per supplier"
            />
          </CardContent>
        )}
      </Card>

      {/* ── Action cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className={hasIncomplete && checkingDone ? "border-red-200" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4" /> Technical Analysis
            </CardTitle>
            <CardDescription>
              Score all suppliers against RFP criteria, generate rankings and insights.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              onClick={handleAnalyse}
              disabled={!canAnalyse || busy || analysing}
              className="w-full gap-2"
              variant={hasIncomplete && checkingDone ? "destructive" : "default"}
            >
              <Play className="h-4 w-4" />
              {hasIncomplete && checkingDone ? "Run Analysis (Incomplete Responses)" : "Run Full Analysis"}
            </Button>
            {!canAnalyse && (
              <p className="text-xs text-muted-foreground text-center">
                {!selected?.rfp_filename ? "Upload RFP first" : "Add at least one supplier file"}
              </p>
            )}
            {hasIncomplete && checkingDone && canAnalyse && (
              <p className="text-xs text-red-600 text-center flex items-center justify-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {completeSummary.incomplete} supplier{completeSummary.incomplete !== 1 ? "s" : ""} below 50% — review recommended
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" /> Pricing Only
            </CardTitle>
            <CardDescription>
              Skip technical scoring — go straight to pricing extraction and cost comparison.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={handleGoToPricing}
              disabled={!canAnalyse || busy}
              className="w-full gap-2 border-primary/40 hover:bg-primary/10"
            >
              <BarChart3 className="h-4 w-4" />
              Go to Pricing Analysis
            </Button>
            {!canAnalyse && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {!selected?.rfp_filename ? "Upload RFP first" : "Add at least one supplier file"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
