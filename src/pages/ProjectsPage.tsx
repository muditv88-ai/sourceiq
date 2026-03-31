/**
 * ProjectsPage — Project management only.
 * Create / rename / delete projects and set metadata (category, budget, timeline, etc.).
 * RFP upload lives in New RFP.
 * Supplier file management lives in Supplier Responses.
 */
import { useState, useEffect, useRef } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Project, ProjectMeta } from "@/lib/types";
import {
  FolderOpen, Plus, Trash2,
  CheckCircle2, Loader2,
  X, AlertCircle, Settings2, ChevronDown, ChevronUp,
} from "lucide-react";

const STATUS_FALLBACK = { label: "Unknown", color: "bg-muted text-muted-foreground" };
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  created:            { label: "Created",         color: "bg-muted text-muted-foreground" },
  rfp_uploaded:       { label: "RFP Uploaded",    color: "bg-blue-100 text-blue-700" },
  suppliers_uploaded: { label: "Suppliers Added", color: "bg-yellow-100 text-yellow-700" },
  parsed:             { label: "Parsed",          color: "bg-purple-100 text-purple-700" },
  analyzed:           { label: "Analyzed",        color: "bg-green-100 text-green-700" },
};
const getStatus = (s: string) => STATUS_CONFIG[s] ?? STATUS_FALLBACK;

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED", "SGD", "AUD"];

type ViewState = "list" | "detail";

export default function ProjectsPage() {
  const [projects, setProjects]       = useState<Project[]>([]);
  const [loading, setLoading]         = useState(true);
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState("");
  const [view, setView]               = useState<ViewState>("list");
  const [selected, setSelected]       = useState<Project | null>(null);
  const [actionMsg, setActionMsg]     = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy]               = useState(false);
  const [showMeta, setShowMeta]       = useState(false);
  const [meta, setMeta]               = useState<Partial<ProjectMeta>>({});
  const [metaSaving, setMetaSaving]   = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const fetchProjects = async () => {
    try {
      const res = await api.listProjects();
      setProjects(res.projects || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchProjects(); }, []);

  const saveMeta = async () => {
    if (!selected) return;
    setMetaSaving(true);
    try {
      await api.updateProjectMeta(selected.project_id, meta);
      setActionMsg("✓ Project details saved");
      const p = await api.getProject(selected.project_id);
      setSelected(p);
      setProjects(prev => prev.map(x => x.project_id === p.project_id ? p : x));
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setMetaSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const p = await api.createProject(newName.trim());
      setNewName(""); setCreating(false);
      await fetchProjects();
      openProject(p);
    } catch (e: any) {
      setActionError(e.message);
    } finally { setBusy(false); }
  };

  const handleDelete = async (projectId: string) => {
    if (!confirm("Delete this project and all its files?")) return;
    await api.deleteProject(projectId);
    setProjects(prev => prev.filter(p => p.project_id !== projectId));
    if (selected?.project_id === projectId) { setSelected(null); setView("list"); }
  };

  const openProject = (p: Project) => {
    setSelected(p); setView("detail");
    setActionMsg(null); setActionError(null);
    setShowMeta(false); setMeta(p.meta ?? {});
  };

  // ── Detail view ───────────────────────────────────────────────────────────
  if (view === "detail" && selected) {
    const sc = getStatus(selected.status);
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setView("list")} className="text-muted-foreground hover:text-foreground transition-colors text-sm">← Projects</button>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-xl font-bold">{selected.name}</h1>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
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

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/40 text-center">
            <p className="text-xs text-muted-foreground">RFP</p>
            <p className="text-sm font-semibold mt-0.5 truncate">{selected.rfp_filename ?? "—"}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 text-center">
            <p className="text-xs text-muted-foreground">Suppliers</p>
            <p className="text-sm font-semibold mt-0.5">{selected.supplier_count ?? 0}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/40 text-center">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="text-sm font-semibold mt-0.5">{sc.label}</p>
          </div>
        </div>

        {/* Meta card */}
        <Card>
          <CardHeader className="cursor-pointer select-none" onClick={() => setShowMeta(v => !v)}>
            <CardTitle className="text-base flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><Settings2 className="h-4 w-4" /> Project Details</span>
              {showMeta ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
            {!showMeta && (
              <CardDescription>{selected.meta?.category ?? "Category, description, stakeholders, budget…"}</CardDescription>
            )}
          </CardHeader>
          {showMeta && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <input value={meta.category ?? ""} onChange={e => setMeta(m => ({ ...m, category: e.target.value }))}
                    placeholder="e.g. IT Infrastructure"
                    className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Timeline</label>
                  <input value={meta.timeline ?? ""} onChange={e => setMeta(m => ({ ...m, timeline: e.target.value }))}
                    placeholder="e.g. Q3 2026"
                    className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <textarea value={meta.description ?? ""} onChange={e => setMeta(m => ({ ...m, description: e.target.value }))}
                  placeholder="Brief description of this RFP project" rows={2}
                  className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Stakeholders</label>
                <input value={meta.stakeholders ?? ""} onChange={e => setMeta(m => ({ ...m, stakeholders: e.target.value }))}
                  placeholder="e.g. Procurement, Finance, IT"
                  className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Budget</label>
                  <input type="number" value={meta.budget ?? ""}
                    onChange={e => setMeta(m => ({ ...m, budget: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="0"
                    className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Currency</label>
                  <select value={meta.currency ?? "USD"} onChange={e => setMeta(m => ({ ...m, currency: e.target.value }))}
                    className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <Button onClick={saveMeta} disabled={metaSaving} size="sm" className="gap-1.5">
                {metaSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Save Details
              </Button>
            </CardContent>
          )}
        </Card>

        <p className="text-sm text-muted-foreground text-center">
          Use <strong>New RFP</strong> in the sidebar to upload & parse the RFP document.
          Use <strong>Supplier Responses</strong> to manage supplier files and run analysis.
        </p>
      </div>
    );
  }

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">Create and manage your RFP evaluation projects</p>
        </div>
        <Button onClick={() => { setCreating(true); setTimeout(() => nameRef.current?.focus(), 50); }} className="gap-2">
          <Plus className="h-4 w-4" /> New Project
        </Button>
      </div>

      {creating && (
        <Card className="border-primary/40">
          <CardContent className="p-4 flex gap-3 items-center">
            <input ref={nameRef} value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              placeholder="Project name (e.g. Q3 2026 IT Infrastructure RFP)"
              className="flex-1 text-sm border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            <Button onClick={handleCreate} disabled={!newName.trim() || busy} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create
            </Button>
            <Button variant="ghost" onClick={() => { setCreating(false); setNewName(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

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
              <p className="text-sm text-muted-foreground mt-1">Create a project to get started</p>
            </div>
            <Button onClick={() => { setCreating(true); setTimeout(() => nameRef.current?.focus(), 50); }} className="gap-2 mt-2">
              <Plus className="h-4 w-4" /> Create First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => {
            const sc = getStatus(p.status);
            return (
              <div key={p.project_id}
                className="flex items-center gap-4 p-4 rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => openProject(p)}>
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.meta?.category ? <span className="font-medium text-foreground/70">{p.meta.category} · </span> : null}
                    {p.rfp_filename ?? "No RFP yet"}
                    {p.supplier_count ? ` · ${p.supplier_count} supplier${p.supplier_count !== 1 ? "s" : ""}` : ""}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${sc.color}`}>{sc.label}</span>
                <button onClick={(e) => { e.stopPropagation(); handleDelete(p.project_id); }}
                  className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
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
