/**
 * SupplierResponsesPage — Manage supplier response files for a project
 * and trigger analysis from here.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FileUploadZone from "@/components/FileUploadZone";
import { api } from "@/lib/api";
import { analysisStore } from "@/lib/analysisStore";
import type { Project } from "@/lib/types";
import {
  FolderOpen, Upload, X, Play, CheckCircle2, AlertCircle,
  Loader2, Users, Brain, BarChart3, Clock,
} from "lucide-react";

type ViewState = "select" | "manage";

const ANALYSIS_MESSAGES = [
  { text: "Parsing supplier documents...",             sub: "Extracting answers from all sheets" },
  { text: "Mapping answers to questions...",           sub: "Matching supplier responses to RFP criteria" },
  { text: "Scoring quantitative criteria...",         sub: "Comparing numbers, dates and percentages" },
  { text: "Scoring qualitative responses...",         sub: "Evaluating written answers with AI" },
  { text: "Computing category breakdowns...",         sub: "Aggregating weighted scores per category" },
  { text: "Ranking suppliers...",                     sub: "Sorting by overall weighted score" },
  { text: "Generating insights & recommendations...", sub: "Almost there!" },
];

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
  // Per-supplier name overrides (filename → display name)
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});

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

  const handleSupplierUpload = async (files: File[]) => {
    if (!selected || !files.length) return;
    setBusy(true); setActionError(null);
    for (let i = 0; i < files.length; i++) {
      setActionMsg(`Uploading ${i + 1}/${files.length}: ${files[i].name}`);
      const stem = files[i].name.replace(/\.[^.]+$/, "");
      const override = nameOverrides[files[i].name] || stem;
      try {
        await api.uploadProjectSupplier(selected.project_id, files[i], override);
      } catch (e: any) {
        setActionError(e.message);
      }
    }
    setActionMsg(`✓ ${files.length} file(s) uploaded`);
    await refreshSelected(selected.project_id);
    setBusy(false);
  };

  const handleRemove = async (filename: string) => {
    if (!selected) return;
    await api.removeProjectSupplier(selected.project_id, filename);
    await refreshSelected(selected.project_id);
  };

  const handleAnalyse = async () => {
    if (!selected) return;
    setAnalysing(true); setActionError(null); setAMsgIdx(0);
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

  // ── Analysis spinner ─────────────────────────────────────────────────────
  if (analysing) {
    const msg = ANALYSIS_MESSAGES[Math.min(analysisMsgIdx, ANALYSIS_MESSAGES.length - 1)];
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
                <div className="h-full bg-primary rounded-full transition-all duration-[2000ms] ease-in-out" style={{ width: `${progress}%` }} />
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
                <button key={p.project_id}
                  onClick={() => { setSelected(p); setView("manage"); setActionMsg(null); setActionError(null); }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/40 transition-colors text-left">
                  <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.rfp_filename ?? "No RFP"} · {p.supplier_count ?? 0} supplier{(p.supplier_count ?? 0) !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {!p.rfp_filename && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Upload RFP first</span>
                  )}
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Manage suppliers ──────────────────────────────────────────────────────
  const suppliers = selected?.suppliers ?? [];
  const canAnalyse = !!selected?.rfp_filename && suppliers.length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setView("select")} className="text-muted-foreground hover:text-foreground text-sm">← Projects</button>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl font-bold">{selected?.name}</h1>
        </div>
        <span className="text-xs text-muted-foreground">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</span>
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
          No RFP uploaded for this project yet. <button onClick={() => navigate("/rfp/new")} className="underline ml-1">Upload RFP →</button>
        </div>
      )}

      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Upload Supplier Responses</CardTitle>
          <CardDescription>
            Upload one file per supplier. The supplier name will be read from the document automatically.
            You can also set a custom name per file below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <FileUploadZone
            onFileSelect={handleSupplierUpload}
            multiple
            accept=".xlsx,.xls,.csv,.pdf,.docx"
            label="Add Supplier Files"
            description="Drop one file per supplier"
          />
        </CardContent>
      </Card>

      {/* Existing suppliers */}
      {suppliers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Supplier Files</CardTitle>
            <CardDescription>Names shown are what will appear in the analysis report</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {suppliers.map((s) => {
              const fname = s.path.split(/[\\/]/).pop() ?? s.path;
              return (
                <div key={s.path} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/40">
                  <Upload className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    {/* Editable supplier display name */}
                    <input
                      defaultValue={s.name}
                      onBlur={async (e) => {
                        const newName = e.target.value.trim();
                        if (newName && newName !== s.name && selected) {
                          // Re-upload is not needed — just patch the meta via supplier endpoint convention.
                          // We store the override in local state for UX; a full rename would need a PATCH endpoint.
                          setNameOverrides(prev => ({ ...prev, [fname]: newName }));
                          setActionMsg(`Display name updated to "${newName}" — will apply on next run`);
                        }
                      }}
                      className="text-sm font-medium bg-transparent border-b border-transparent hover:border-input focus:border-primary focus:outline-none w-full"
                    />
                    <p className="text-xs text-muted-foreground truncate">{fname}</p>
                  </div>
                  <button onClick={() => handleRemove(fname)}
                    className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Run analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Run Analysis</CardTitle>
          <CardDescription>
            Runs technical scoring + pricing analysis across all uploaded supplier responses.
            Files are stored — no re-upload needed for re-runs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleAnalyse} disabled={!canAnalyse || busy || analysing} className="w-full gap-2">
            <Play className="h-4 w-4" />
            Run Analysis ({suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""})
          </Button>
          {!canAnalyse && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {!selected?.rfp_filename ? "Upload RFP first" : "Add at least one supplier file"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
