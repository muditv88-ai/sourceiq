import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FileUploadZone from "@/components/FileUploadZone";
import { api } from "@/lib/api";
import { analysisStore } from "@/lib/analysisStore";
import type { Project } from "@/lib/types";
import {
  FolderOpen, Plus, Trash2, Upload, Play, RotateCcw,
  CheckCircle2, Clock, FileText, Users, Loader2,
  ChevronDown, ChevronUp, X, AlertCircle,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  created:            { label: "Created",            color: "bg-muted text-muted-foreground" },
  rfp_uploaded:       { label: "RFP Uploaded",       color: "bg-blue-100 text-blue-700" },
  suppliers_uploaded: { label: "Suppliers Added",    color: "bg-yellow-100 text-yellow-700" },
  parsed:             { label: "Parsed",             color: "bg-purple-100 text-purple-700" },
  analyzed:           { label: "Analyzed",           color: "bg-green-100 text-green-700" },
};

type ViewState = "list" | "detail";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects]       = useState<Project[]>([]);
  const [loading, setLoading]         = useState(true);
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState("");
  const [view, setView]               = useState<ViewState>("list");
  const [selected, setSelected]       = useState<Project | null>(null);
  const [actionMsg, setActionMsg]     = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy]               = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const fetchProjects = async () => {
    try {
      const res = await api.listProjects();
      setProjects(res.projects || []);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const refreshSelected = async (id: string) => {
    const p = await api.getProject(id);
    setSelected(p);
    setProjects(prev => prev.map(x => x.project_id === id ? p : x));
  };

  // ── Create project
  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const p = await api.createProject(newName.trim());
      setNewName("");
      setCreating(false);
      await fetchProjects();
      openProject(p);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Delete project
  const handleDelete = async (projectId: string) => {
    if (!confirm("Delete this project and all its files?")) return;
    await api.deleteProject(projectId);
    setProjects(prev => prev.filter(p => p.project_id !== projectId));
    if (selected?.project_id === projectId) { setSelected(null); setView("list"); }
  };

  // ── Open project detail
  const openProject = (p: Project) => {
    setSelected(p);
    setView("detail");
    setActionMsg(null);
    setActionError(null);
  };

  // ── Upload RFP
  const handleRfpUpload = async (files: File[]) => {
    if (!selected || !files[0]) return;
    setBusy(true); setActionMsg("Uploading RFP..."); setActionError(null);
    try {
      await api.uploadProjectRfp(selected.project_id, files[0]);
      setActionMsg(`✓ RFP uploaded: ${files[0].name}`);
      await refreshSelected(selected.project_id);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Upload suppliers
  const handleSupplierUpload = async (files: File[]) => {
    if (!selected || !files.length) return;
    setBusy(true); setActionError(null);
    for (let i = 0; i < files.length; i++) {
      setActionMsg(`Uploading supplier ${i + 1}/${files.length}: ${files[i].name}`);
      try {
        await api.uploadProjectSupplier(selected.project_id, files[i]);
      } catch (e: any) {
        setActionError(e.message);
      }
    }
    setActionMsg(`✓ ${files.length} supplier file(s) uploaded`);
    await refreshSelected(selected.project_id);
    setBusy(false);
  };

  // ── Remove supplier
  const handleRemoveSupplier = async (filename: string) => {
    if (!selected) return;
    await api.removeProjectSupplier(selected.project_id, filename);
    await refreshSelected(selected.project_id);
  };

  // ── Parse
  const handleParse = async () => {
    if (!selected) return;
    setBusy(true); setActionMsg("Parsing RFP with AI..."); setActionError(null);
    try {
      await api.parseProject(selected.project_id);
      setActionMsg("✓ RFP parsed successfully");
      await refreshSelected(selected.project_id);
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ── Analyze
  const handleAnalyze = async () => {
    if (!selected) return;
    setBusy(true); setActionMsg("Running analysis..."); setActionError(null);
    try {
      const result = await api.analyzeProject(selected.project_id);
      analysisStore.setResult(selected.project_id, result);
      await refreshSelected(selected.project_id);
      navigate("/analysis");
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ────────────────────────── RENDER ──────────────────────────

  if (view === "detail" && selected) {
    const sc = STATUS_CONFIG[selected.status] ?? STATUS_CONFIG.created;
    const canParse   = !!selected.rfp_filename;
    const canAnalyze = !!selected.rfp_filename && (selected.supplier_count ?? 0) > 0;
    const suppliers  = selected.suppliers ?? [];

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("list")} className="text-muted-foreground hover:text-foreground transition-colors text-sm">
              ← Projects
            </button>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-xl font-bold">{selected.name}</h1>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
        </div>

        {/* Action feedback */}
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

        {/* RFP Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" /> RFP Document
            </CardTitle>
            <CardDescription>
              {selected.rfp_filename
                ? `Current file: ${selected.rfp_filename} — re-upload to replace`
                : "Upload the RFP template file once"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selected.rfp_filename ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="font-medium flex-1 truncate">{selected.rfp_filename}</span>
                <FileUploadZone
                  onFileSelect={handleRfpUpload}
                  accept=".xlsx,.xls,.csv,.pdf,.docx"
                  label="Replace"
                  compact
                />
              </div>
            ) : (
              <FileUploadZone
                onFileSelect={handleRfpUpload}
                accept=".xlsx,.xls,.csv,.pdf,.docx"
                label="Upload RFP Template"
                description="Drag & drop or click — xlsx, xls, csv, pdf, docx"
              />
            )}
          </CardContent>
        </Card>

        {/* Supplier Files */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Supplier Responses
            </CardTitle>
            <CardDescription>Upload once, re-run analysis any number of times</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FileUploadZone
              onFileSelect={handleSupplierUpload}
              multiple
              accept=".xlsx,.xls,.csv,.pdf,.docx"
              label="Add Supplier Files"
              description="Drop one file per supplier"
            />
            {suppliers.length > 0 && (
              <div className="space-y-1.5">
                {suppliers.map((s) => {
                  const fname = s.path.split(/[\\/]/).pop() ?? s.path;
                  return (
                    <div key={s.path} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 text-sm">
                      <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 font-medium truncate">{s.name}</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[160px]">{fname}</span>
                      <button
                        onClick={() => handleRemoveSupplier(fname)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Run Analysis</CardTitle>
            <CardDescription>Files are stored — no re-upload needed for subsequent runs</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              onClick={handleParse}
              disabled={!canParse || busy}
              className="gap-2 flex-1"
            >
              {busy && actionMsg?.includes("Parsing") ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Parsing...</>
              ) : (
                <><RotateCcw className="h-4 w-4" /> Parse RFP</>
              )}
            </Button>
            <Button
              onClick={handleAnalyze}
              disabled={!canAnalyze || busy}
              className="gap-2 flex-1"
            >
              {busy && actionMsg?.includes("analysis") ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Analysing...</>
              ) : (
                <><Play className="h-4 w-4" /> Run Analysis ({selected.supplier_count} supplier{selected.supplier_count !== 1 ? "s" : ""})</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Project list view
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">Create a project, upload files once, run analysis repeatedly</p>
        </div>
        <Button onClick={() => { setCreating(true); setTimeout(() => nameRef.current?.focus(), 50); }} className="gap-2">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      {/* New project form */}
      {creating && (
        <Card className="border-primary/40">
          <CardContent className="p-4 flex gap-3 items-center">
            <input
              ref={nameRef}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="Project name (e.g. Q3 2026 IT Infrastructure RFP)"
              className="flex-1 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button onClick={handleCreate} disabled={!newName.trim() || busy} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </Button>
            <Button variant="ghost" onClick={() => { setCreating(false); setNewName(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Projects list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading projects...
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center gap-4">
            <FolderOpen className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-lg">No projects yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create a project to upload your RFP and supplier files once and run analysis repeatedly</p>
            </div>
            <Button onClick={() => { setCreating(true); setTimeout(() => nameRef.current?.focus(), 50); }} className="gap-2 mt-2">
              <Plus className="h-4 w-4" /> Create First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const sc = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.created;
            return (
              <div
                key={p.project_id}
                className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => openProject(p)}
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.rfp_filename ? p.rfp_filename : "No RFP yet"}
                    {p.supplier_count ? ` · ${p.supplier_count} supplier${p.supplier_count !== 1 ? "s" : ""}` : ""}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${sc.color}`}>{sc.label}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.project_id); }}
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
